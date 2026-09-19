// SPENDY — Database Query Layer
// All DB operations for the ledger

import { getDatabase } from './schema';

export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 10)}`;
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Transaction {
  id: string;
  amount: number;
  type: 'debit' | 'credit';
  merchant: string | null;
  raw_source: 'sms' | 'notification' | 'manual';
  category_id: string | null;
  timestamp: number;
  matched_intent_id: string | null;
  status: 'categorized' | 'pending_reconciliation' | 'ignored';
  created_at: number;
}

export interface Category {
  id: string;
  name: string;
  icon: string | null;
  is_envelope: boolean;
}

export interface Envelope {
  id: string;
  category_id: string;
  target_amount: number;
  locked_amount: number;
  lock_on_payday: boolean;
  payday_day_of_month: number | null;
  // Joined:
  category_name?: string;
  category_icon?: string | null;
}

export interface Debt {
  id: string;
  person_name: string;
  upi_id: string | null;
  amount: number; // positive = they owe you, negative = you owe them
  status: 'open' | 'settled';
  note: string | null;
  created_at: number;
}

export interface UpiIntent {
  id: string;
  debt_id: string | null;
  amount: number;
  upi_id: string;
  note: string | null;
  status: 'initiated' | 'confirmed' | 'failed' | 'abandoned';
  created_at: number;
}

export interface BillSplit {
  id: string;
  merchant: string | null;
  total_amount: number | null;
  ocr_raw_text: string | null;
  created_at: number;
  items?: BillSplitItem[];
}

export interface BillSplitItem {
  id: string;
  bill_split_id: string;
  item_name: string | null;
  price: number | null;
  assigned_to: string | null;
}

export interface LedgerSummary {
  depositedBalance: number;
  totalBalance: number;
  safeToSpend: number;
  totalDebit: number;
  totalCredit: number;
  totalLockedInEnvelopes: number;
  totalOwed: number;        // you owe others (negative debts sum)
  totalOwedToYou: number;   // others owe you (positive debts sum)
}

// ─── Transactions ───────────────────────────────────────────────────────────


export async function insertTransaction(tx: Omit<Transaction, 'id' | 'created_at'>): Promise<string> {
  const db = getDatabase();
  const id = generateId();
  await db.runAsync(
    `INSERT INTO transactions (id, amount, type, merchant, raw_source, category_id, timestamp, matched_intent_id, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, tx.amount, tx.type, tx.merchant ?? null, tx.raw_source, tx.category_id ?? null, tx.timestamp, tx.matched_intent_id ?? null, tx.status]
  );
  return id;
}

export async function getRecentTransactions(limit = 50): Promise<Transaction[]> {
  const db = await getDatabase();
  return db.getAllAsync<Transaction>(
    'SELECT * FROM transactions WHERE status != ? ORDER BY timestamp DESC LIMIT ?',
    ['ignored', limit]
  );
}

export async function getAllTransactions(offset = 0, limit = 100): Promise<Transaction[]> {
  const db = await getDatabase();
  return db.getAllAsync<Transaction>(
    'SELECT * FROM transactions ORDER BY timestamp DESC LIMIT ? OFFSET ?',
    [limit, offset]
  );
}

export async function getPendingTransactions(): Promise<Transaction[]> {
  const db = await getDatabase();
  return db.getAllAsync<Transaction>(
    "SELECT * FROM transactions WHERE status = 'pending_reconciliation' ORDER BY timestamp DESC"
  );
}

export async function updateTransactionStatus(
  id: string,
  status: Transaction['status'],
  categoryId?: string
): Promise<void> {
  const db = await getDatabase();
  if (categoryId) {
    await db.runAsync(
      'UPDATE transactions SET status = ?, category_id = ? WHERE id = ?',
      [status, categoryId, id]
    );
  } else {
    await db.runAsync('UPDATE transactions SET status = ? WHERE id = ?', [status, id]);
  }
}

export async function checkDuplicate(
  amount: number,
  type: 'debit' | 'credit',
  timestamp: number,
  windowMs = 90000
): Promise<Transaction | null> {
  const db = await getDatabase();
  const windowSecs = windowMs / 1000;
  const results = await db.getAllAsync<Transaction>(
    `SELECT * FROM transactions 
     WHERE amount = ? AND type = ? AND ABS(timestamp - ?) < ?
     ORDER BY created_at DESC LIMIT 1`,
    [amount, type, timestamp, windowSecs]
  );
  return results[0] ?? null;
}

export async function getLatestBalance(): Promise<number> {
  // In production: parse "Avl Bal" from SMS — stored in settings
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'latest_balance'"
  );
  return row ? parseFloat(row.value) : 0;
}

export async function setLatestBalance(balance: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ('latest_balance', ?)",
    [balance.toString()]
  );
}

// ─── Categories ─────────────────────────────────────────────────────────────

export async function getCategories(): Promise<Category[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ id: string; name: string; icon: string | null; is_envelope: number }>(
    'SELECT * FROM categories ORDER BY name'
  );
  return rows.map(r => ({ ...r, is_envelope: r.is_envelope === 1 }));
}

// ─── Envelopes ──────────────────────────────────────────────────────────────

export async function getEnvelopes(): Promise<Envelope[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: string; category_id: string; target_amount: number; locked_amount: number;
    lock_on_payday: number; payday_day_of_month: number | null;
    category_name: string; category_icon: string | null;
  }>(
    `SELECT e.*, c.name as category_name, c.icon as category_icon
     FROM envelopes e JOIN categories c ON e.category_id = c.id
     ORDER BY c.name`
  );
  return rows.map(r => ({
    ...r,
    lock_on_payday: r.lock_on_payday === 1,
  }));
}

export async function insertEnvelope(envelope: Omit<Envelope, 'id' | 'locked_amount' | 'category_name' | 'category_icon'>): Promise<string> {
  const db = getDatabase();
  const id = generateId();
  await db.runAsync(
    `INSERT INTO envelopes (id, category_id, target_amount, locked_amount, lock_on_payday, payday_day_of_month)
     VALUES (?, ?, ?, 0, ?, ?)`,
    [id, envelope.category_id, envelope.target_amount, envelope.lock_on_payday ? 1 : 0, envelope.payday_day_of_month ?? null]
  );
  return id;
}

export async function updateEnvelope(id: string, updates: Partial<Omit<Envelope, 'id' | 'category_name' | 'category_icon'>>): Promise<void> {
  const db = await getDatabase();
  const fields: string[] = [];
  const values: (string | number | null)[] = [];
  if (updates.target_amount !== undefined) { fields.push('target_amount = ?'); values.push(updates.target_amount); }
  if (updates.locked_amount !== undefined) { fields.push('locked_amount = ?'); values.push(updates.locked_amount); }
  if (updates.lock_on_payday !== undefined) { fields.push('lock_on_payday = ?'); values.push(updates.lock_on_payday ? 1 : 0); }
  if (updates.payday_day_of_month !== undefined) { fields.push('payday_day_of_month = ?'); values.push(updates.payday_day_of_month); }
  if (fields.length === 0) return;
  values.push(id);
  await db.runAsync(`UPDATE envelopes SET ${fields.join(', ')} WHERE id = ?`, values);
}

export async function deleteEnvelope(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM envelopes WHERE id = ?', [id]);
}

export async function getTotalLockedAmount(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ total: number }>(
    'SELECT COALESCE(SUM(locked_amount), 0) as total FROM envelopes'
  );
  return row?.total ?? 0;
}

export async function lockEnvelopesForPayday(dayOfMonth: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE envelopes SET locked_amount = target_amount 
     WHERE lock_on_payday = 1 AND payday_day_of_month = ?`,
    [dayOfMonth]
  );
}

// ─── Debts ──────────────────────────────────────────────────────────────────

export async function getDebts(status?: 'open' | 'settled'): Promise<Debt[]> {
  const db = await getDatabase();
  if (status) {
    return db.getAllAsync<Debt>(
      'SELECT * FROM debts WHERE status = ? ORDER BY created_at DESC',
      [status]
    );
  }
  return db.getAllAsync<Debt>('SELECT * FROM debts ORDER BY created_at DESC');
}

export async function insertDebt(debt: Omit<Debt, 'id' | 'created_at'>): Promise<string> {
  const db = getDatabase();
  const id = generateId();
  await db.runAsync(
    'INSERT INTO debts (id, person_name, upi_id, amount, status, note) VALUES (?, ?, ?, ?, ?, ?)',
    [id, debt.person_name, debt.upi_id ?? null, debt.amount, debt.status, debt.note ?? null]
  );
  return id;
}

export async function settleDebt(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE debts SET status = 'settled' WHERE id = ?", [id]);
}

export async function getDebtSummary(): Promise<{ totalOwed: number; totalOwedToYou: number }> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ totalOwed: number; totalOwedToYou: number }>(
    `SELECT 
       COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) as totalOwed,
       COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as totalOwedToYou
     FROM debts WHERE status = 'open'`
  );
  return row ?? { totalOwed: 0, totalOwedToYou: 0 };
}

// ─── UPI Intents ─────────────────────────────────────────────────────────────

export async function createUpiIntent(intent: Omit<UpiIntent, 'id' | 'created_at'>): Promise<string> {
  const db = getDatabase();
  const id = generateId();
  await db.runAsync(
    'INSERT INTO upi_intents (id, debt_id, amount, upi_id, note, status) VALUES (?, ?, ?, ?, ?, ?)',
    [id, intent.debt_id ?? null, intent.amount, intent.upi_id, intent.note ?? null, intent.status]
  );
  return id;
}

export async function updateUpiIntentStatus(id: string, status: UpiIntent['status']): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE upi_intents SET status = ? WHERE id = ?', [status, id]);
}

export async function getInitiatedUpiIntents(): Promise<UpiIntent[]> {
  const db = await getDatabase();
  return db.getAllAsync<UpiIntent>(
    "SELECT * FROM upi_intents WHERE status = 'initiated' ORDER BY created_at DESC"
  );
}

// ─── Bill Splits ─────────────────────────────────────────────────────────────

export async function insertBillSplit(split: Omit<BillSplit, 'id' | 'created_at' | 'items'>): Promise<string> {
  const db = getDatabase();
  const id = generateId();
  await db.runAsync(
    'INSERT INTO bill_splits (id, merchant, total_amount, ocr_raw_text) VALUES (?, ?, ?, ?)',
    [id, split.merchant ?? null, split.total_amount ?? null, split.ocr_raw_text ?? null]
  );
  return id;
}

export async function insertBillSplitItem(item: Omit<BillSplitItem, 'id'>): Promise<string> {
  const db = getDatabase();
  const id = generateId();
  await db.runAsync(
    'INSERT INTO bill_split_items (id, bill_split_id, item_name, price, assigned_to) VALUES (?, ?, ?, ?, ?)',
    [id, item.bill_split_id, item.item_name ?? null, item.price ?? null, item.assigned_to ?? null]
  );
  return id;
}

export async function getBillSplits(): Promise<BillSplit[]> {
  const db = await getDatabase();
  return db.getAllAsync<BillSplit>('SELECT * FROM bill_splits ORDER BY created_at DESC');
}

// ─── Ledger Summary ──────────────────────────────────────────────────────────

export async function getLedgerSummary(): Promise<LedgerSummary> {
  const db = await getDatabase();

  const [balanceRow, txRow, envelopeRow, debtRow] = await Promise.all([
    db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'latest_balance'"),
    db.getFirstAsync<{ totalDebit: number; totalCredit: number }>(
      `SELECT 
         COALESCE(SUM(CASE WHEN type='debit' THEN amount ELSE 0 END), 0) as totalDebit,
         COALESCE(SUM(CASE WHEN type='credit' THEN amount ELSE 0 END), 0) as totalCredit
       FROM transactions WHERE status != 'ignored'`
    ),
    db.getFirstAsync<{ total: number }>('SELECT COALESCE(SUM(target_amount), 0) as total FROM envelopes'),
    db.getFirstAsync<{ totalOwed: number; totalOwedToYou: number }>(
      `SELECT 
         COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) as totalOwed,
         COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as totalOwedToYou
       FROM debts WHERE status = 'open'`
    ),
  ]);

  const depositedBalance = balanceRow ? parseFloat(balanceRow.value) : 0;
  const totalDebit = txRow?.totalDebit ?? 0;
  const totalCredit = txRow?.totalCredit ?? 0;
  const totalLockedInEnvelopes = envelopeRow?.total ?? 0;
  const totalOwed = debtRow?.totalOwed ?? 0;
  const totalOwedToYou = debtRow?.totalOwedToYou ?? 0;

  // Total Account Balance = Initial Deposited Balance + Total Credits - Total Debits
  const totalBalance = depositedBalance + totalCredit - totalDebit;

  // Safe to Spend = Total Balance - Total Locked in Envelopes - Total Owed to Others
  const safeToSpend = totalBalance - totalLockedInEnvelopes - totalOwed;

  return {
    depositedBalance,
    totalBalance,
    safeToSpend,
    totalDebit,
    totalCredit,
    totalLockedInEnvelopes,
    totalOwed,
    totalOwedToYou,
  };
}

export async function setMonthlyDeposit(amount: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ('latest_balance', ?)",
    [amount.toString()]
  );
}

export async function addMonthlyDeposit(amount: number): Promise<void> {
  const current = await getLatestBalance();
  await setMonthlyDeposit(current + amount);
}


// ─── Category Spending ───────────────────────────────────────────────────────

export async function getCategorySpending(days = 30): Promise<Array<{ category_id: string; name: string; icon: string; total: number }>> {
  const db = await getDatabase();
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  return db.getAllAsync(
    `SELECT t.category_id, c.name, c.icon, SUM(t.amount) as total
     FROM transactions t
     LEFT JOIN categories c ON t.category_id = c.id
     WHERE t.type = 'debit' AND t.timestamp > ? AND t.status != 'ignored'
     GROUP BY t.category_id
     ORDER BY total DESC`,
    [since]
  );
}
