// SPENDY — Zustand State Store

import { create } from 'zustand';
import {
  Transaction, Envelope, Debt, Category, LedgerSummary,
  getRecentTransactions, getEnvelopes, getDebts, getCategories,
  getLedgerSummary, insertTransaction, settleDebt,
  updateTransactionStatus, getPendingTransactions,
  setMonthlyDeposit, addMonthlyDeposit,
} from '../database/queries';


interface LedgerState {
  // Data
  transactions: Transaction[];
  pendingTransactions: Transaction[];
  envelopes: Envelope[];
  debts: Debt[];
  categories: Category[];
  summary: LedgerSummary;

  // UI State
  isLoading: boolean;
  lastUpdated: number;

  // Actions
  loadAll: () => Promise<void>;
  loadTransactions: () => Promise<void>;
  loadEnvelopes: () => Promise<void>;
  loadDebts: () => Promise<void>;
  loadSummary: () => Promise<void>;
  updateMonthlyDeposit: (amount: number, isAddition?: boolean) => Promise<void>;
  ingestTransaction: (parsed: {
    amount: number;
    type: 'debit' | 'credit';
    merchant: string | null;
    timestamp: number;
    raw_source: 'sms' | 'notification' | 'manual';
  }) => Promise<void>;
  settleDebt: (id: string) => Promise<void>;
  categorizeTransaction: (id: string, categoryId: string) => Promise<void>;
  dismissTransaction: (id: string) => Promise<void>;
}

export const useLedgerStore = create<LedgerState>((set, get) => ({
  transactions: [],
  pendingTransactions: [],
  envelopes: [],
  debts: [],
  categories: [],
  summary: {
    depositedBalance: 0,
    totalBalance: 0,
    safeToSpend: 0,
    totalDebit: 0,
    totalCredit: 0,
    totalLockedInEnvelopes: 0,
    totalOwed: 0,
    totalOwedToYou: 0,
  },

  isLoading: false,
  lastUpdated: 0,

  loadAll: async () => {
    set({ isLoading: true });
    try {
      const [transactions, pendingTransactions, envelopes, debts, categories, summary] = await Promise.all([
        getRecentTransactions(50),
        getPendingTransactions(),
        getEnvelopes(),
        getDebts('open'),
        getCategories(),
        getLedgerSummary(),
      ]);
      set({ transactions, pendingTransactions, envelopes, debts, categories, summary, lastUpdated: Date.now() });
    } finally {
      set({ isLoading: false });
    }
  },

  loadTransactions: async () => {
    const [transactions, pendingTransactions] = await Promise.all([
      getRecentTransactions(50),
      getPendingTransactions(),
    ]);
    set({ transactions, pendingTransactions });
  },

  loadEnvelopes: async () => {
    const envelopes = await getEnvelopes();
    set({ envelopes });
  },

  loadDebts: async () => {
    const debts = await getDebts('open');
    set({ debts });
  },

  loadSummary: async () => {
    const summary = await getLedgerSummary();
    set({ summary });
  },

  updateMonthlyDeposit: async (amount: number, isAddition = false) => {
    if (isAddition) {
      await addMonthlyDeposit(amount);
    } else {
      await setMonthlyDeposit(amount);
    }
    await get().loadAll();
  },


  ingestTransaction: async (parsed) => {
    await insertTransaction({
      amount: parsed.amount,
      type: parsed.type,
      merchant: parsed.merchant,
      raw_source: parsed.raw_source,
      category_id: null,
      timestamp: parsed.timestamp,
      matched_intent_id: null,
      status: 'pending_reconciliation',
    });
    await get().loadAll();
  },

  settleDebt: async (id: string) => {
    await settleDebt(id);
    await get().loadAll();
  },

  categorizeTransaction: async (id: string, categoryId: string) => {
    await updateTransactionStatus(id, 'categorized', categoryId);
    await get().loadAll();
  },

  dismissTransaction: async (id: string) => {
    await updateTransactionStatus(id, 'ignored');
    await get().loadAll();
  },
}));

