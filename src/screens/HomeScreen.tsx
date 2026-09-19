// SPENDY — Home Screen
// Safe-to-Spend hero, balance summary row, category donut chart, recent activity

import React, { useEffect, useCallback, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, StatusBar, ActivityIndicator, Modal, TextInput, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useLedgerStore } from '../store/ledgerStore';
import { formatCurrency, formatCurrencyFull, formatDate } from '../utils/upiLink';
import { Colors, Spacing, BorderRadius, Shadows } from '../constants/theme';
import AddTransactionModal from './AddTransactionModal';
import CategoryIcon from '../components/CategoryIcon';

// ─── Minimal Segment Bar ───────────────────────────────────────────────────

function SimpleDonut({ segments }: { segments: Array<{ value: number; color: string }> }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return (
    <View style={donutStyles.placeholder}>
      <Text style={donutStyles.placeholderText}>No data</Text>
    </View>
  );

  return (
    <View style={donutStyles.container}>
      {segments.slice(0, 4).map((seg, i) => (
        <View key={i} style={[donutStyles.segment, { backgroundColor: seg.color, flex: seg.value / total }]} />
      ))}
    </View>
  );
}

const donutStyles = StyleSheet.create({
  container: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', width: '100%' },
  segment: { height: 6 },
  placeholder: { height: 6, backgroundColor: Colors.backgroundMuted, borderRadius: 3, width: '100%' },
  placeholderText: { fontSize: 10, color: Colors.textMuted },
});

// ─── Transaction Row (Minimal Black Icons) ──────────────────────────────────

function TransactionRow({ tx, category }: {
  tx: { id: string; amount: number; type: string; merchant: string | null; timestamp: number; status: string; category_id: string | null };
  category?: { icon?: string | null; name?: string };
}) {
  const isDebit = tx.type === 'debit';
  return (
    <View style={styles.txRow}>
      <CategoryIcon
        categoryId={tx.category_id}
        type={tx.type as 'debit' | 'credit'}
        size={14}
        color="#0A0A0A"
        containerSize={36}
        backgroundColor="#F5F5F5"
      />
      <View style={styles.txMeta}>
        <Text style={styles.txMerchant} numberOfLines={1}>
          {tx.merchant ?? category?.name ?? (isDebit ? 'Debit' : 'Credit')}
        </Text>
        <Text style={styles.txTime}>{formatDate(tx.timestamp)}</Text>
      </View>
      <View style={styles.txAmountCol}>
        <Text style={[styles.txAmount, { color: isDebit ? '#0A0A0A' : '#16A34A' }]}>
          {isDebit ? '−' : '+'}{formatCurrency(tx.amount)}
        </Text>
        {tx.status === 'pending_reconciliation' && (
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingText}>pending</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Deposit / Monthly Income Modal ──────────────────────────────────────────

function DepositModal({ visible, onClose, currentDeposit }: {
  visible: boolean;
  onClose: () => void;
  currentDeposit: number;
}) {
  const insets = useSafeAreaInsets();
  const [amount, setAmount] = useState('');
  const [isAddMode, setIsAddMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const { updateMonthlyDeposit } = useLedgerStore();

  const handleSave = async () => {
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount.');
      return;
    }
    setSaving(true);
    try {
      await updateMonthlyDeposit(val, isAddMode);
      setAmount('');
      onClose();
    } catch (e) {
      Alert.alert('Error', String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalRoot, { paddingTop: Math.max(insets.top, 24) }]}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose} style={{ padding: 8 }}>
            <Text style={styles.modalCancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Monthly Deposit / Income</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving} style={{ padding: 8 }}>
            <Text style={[styles.modalSave, saving && { opacity: 0.5 }]}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.modalContent}>
          <View style={styles.toggleRow}>
            <TouchableOpacity
              style={[styles.toggleBtn, !isAddMode && styles.toggleBtnActive]}
              onPress={() => setIsAddMode(false)}
            >
              <Text style={[styles.toggleBtnText, !isAddMode && styles.toggleBtnTextActive]}>Set Total Budget</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, isAddMode && styles.toggleBtnActive]}
              onPress={() => setIsAddMode(true)}
            >
              <Text style={[styles.toggleBtnText, isAddMode && styles.toggleBtnTextActive]}>+ Add Deposit</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.amountInputWrap}>
            <Text style={styles.amountPrefix}>₹</Text>
            <TextInput
              style={styles.amountInputField}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor="#A3A3A3"
              value={amount}
              onChangeText={setAmount}
              autoFocus
            />
          </View>

          <Text style={styles.hintText}>
            {isAddMode
              ? `Adds to your current starting deposit of ${formatCurrency(currentDeposit)}.`
              : `Sets your starting monthly balance. Safe to Spend will deduct debts and envelopes from this.`}
          </Text>

          {/* Quick presets */}
          <View style={styles.presetRow}>
            {[10000, 25000, 50000, 100000].map(p => (
              <TouchableOpacity key={p} style={styles.presetChip} onPress={() => setAmount(p.toString())}>
                <Text style={styles.presetChipText}>{formatCurrency(p)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { summary, transactions, categories, isLoading, loadAll } = useLedgerStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);

  useEffect(() => { loadAll(); }, []);

  const onRefresh = useCallback(() => { loadAll(); }, []);

  const categoryMap = Object.fromEntries(categories.map(c => [c.id, c]));

  // Build chart segments from recent debit categories
  const categoryTotals: Record<string, number> = {};
  transactions.filter(t => t.type === 'debit').forEach(t => {
    const key = t.category_id ?? 'uncategorized';
    categoryTotals[key] = (categoryTotals[key] ?? 0) + t.amount;
  });
  const segments = Object.entries(categoryTotals).slice(0, 6).map(([id, value], i) => ({
    value,
    color: Colors.chart[i % Colors.chart.length],
  }));

  const isSafe = summary.safeToSpend >= 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.appName}>SPENDY</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddModal(true)} activeOpacity={0.8}>
          <Feather name="plus" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor="#0A0A0A" />}
      >
        {/* Safe-to-Spend Hero Card */}
        <View style={[styles.heroCard, { backgroundColor: isSafe ? '#0A0A0A' : '#DC2626' }]}>
          <View style={styles.heroTopRow}>
            <Text style={styles.heroLabel}>Safe to Spend</Text>
            {summary.totalOwedToYou > 0 && (
              <View style={styles.owedBadge}>
                <Feather name="arrow-up-right" size={11} color="#16A34A" style={{ marginRight: 2 }} />
                <Text style={styles.owedBadgeText}>+{formatCurrency(summary.totalOwedToYou)} owed to you</Text>
              </View>
            )}
          </View>

          <View style={styles.heroAmountRow}>
            <Text style={styles.heroAmount}>{formatCurrencyFull(summary.safeToSpend)}</Text>
            {summary.totalOwedToYou > 0 && (
              <Text style={styles.heroOwedAddon}>(+{formatCurrency(summary.totalOwedToYou)})</Text>
            )}
          </View>

          {!isSafe && <Text style={styles.heroOverdraft}>⚠ Budget Exceeded / Overspent</Text>}

          {/* Breakdown description */}
          <Text style={styles.heroSub}>
            Deposit {formatCurrency(summary.depositedBalance)} · Spent −{formatCurrency(summary.totalDebit)} · Envelopes −{formatCurrency(summary.totalLockedInEnvelopes)} · Owed −{formatCurrency(summary.totalOwed)}
          </Text>

          {/* Set / Add Deposit Action */}
          <TouchableOpacity
            style={styles.setDepositBtn}
            onPress={() => setShowDepositModal(true)}
            activeOpacity={0.85}
          >
            <Feather name="dollar-sign" size={13} color="#0A0A0A" />
            <Text style={styles.setDepositBtnText}>
              {summary.depositedBalance > 0 ? 'Edit / Add Monthly Deposit' : '+ Set Monthly Deposited Amount'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Summary Row */}
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, Shadows.sm]}>
            <Text style={styles.summaryLabel}>Spent</Text>
            <Text style={[styles.summaryValue, { color: '#0A0A0A' }]}>{formatCurrency(summary.totalDebit)}</Text>
          </View>
          <View style={[styles.summaryCard, Shadows.sm]}>
            <Text style={styles.summaryLabel}>Received</Text>
            <Text style={[styles.summaryValue, { color: '#16A34A' }]}>{formatCurrency(summary.totalCredit)}</Text>
          </View>
          <View style={[styles.summaryCard, Shadows.sm]}>
            <Text style={styles.summaryLabel}>You're owed</Text>
            <Text style={[styles.summaryValue, { color: '#2563EB' }]}>{formatCurrency(summary.totalOwedToYou)}</Text>
          </View>
        </View>

        {/* Category Bar */}
        {segments.length > 0 && (
          <View style={[styles.card, Shadows.sm]}>
            <Text style={styles.sectionTitle}>Spending by Category</Text>
            <View style={{ marginTop: Spacing.md }}>
              <SimpleDonut segments={segments} />
            </View>
            <View style={styles.legendRow}>
              {Object.entries(categoryTotals).slice(0, 4).map(([id, val], i) => (
                <View key={id} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: Colors.chart[i % Colors.chart.length] }]} />
                  <Text style={styles.legendLabel} numberOfLines={1}>
                    {categoryMap[id]?.name ?? 'Other'}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Recent Transactions */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={styles.seeAll}>See all</Text>
            <Feather name="chevron-right" size={14} color="#737373" />
          </TouchableOpacity>
        </View>

        {isLoading && transactions.length === 0 ? (
          <ActivityIndicator color="#0A0A0A" style={{ marginTop: 32 }} />
        ) : transactions.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <Feather name="inbox" size={28} color="#0A0A0A" />
            </View>
            <Text style={styles.emptyTitle}>No transactions yet</Text>
            <Text style={styles.emptyBody}>
              SPENDY will automatically detect transactions from SMS and notifications.{'\n'}
              Add one manually to get started.
            </Text>
          </View>
        ) : (
          <View style={[styles.card, Shadows.sm, { padding: 0, overflow: 'hidden' }]}>
            {transactions.slice(0, 10).map((tx, i) => (
              <View key={tx.id}>
                <TransactionRow tx={tx} category={tx.category_id ? categoryMap[tx.category_id] : undefined} />
                {i < Math.min(transactions.length - 1, 9) && <View style={styles.divider} />}
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      <AddTransactionModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
      />

      <DepositModal
        visible={showDepositModal}
        onClose={() => setShowDepositModal(false)}
        currentDeposit={summary.depositedBalance}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  appName: { fontSize: 20, fontWeight: '800', color: '#0A0A0A', letterSpacing: -0.5 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#0A0A0A', borderRadius: BorderRadius.full,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  addBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 13 },
  scroll: { padding: Spacing.xl, gap: Spacing.lg },
  heroCard: {
    borderRadius: BorderRadius.xl, padding: Spacing.xxl,
    ...Shadows.lg,
  },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },
  owedBadge: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 4,
  },
  owedBadgeText: { color: '#86EFAC', fontSize: 11, fontWeight: '700' },
  heroAmountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 6 },
  heroAmount: { color: '#FFFFFF', fontSize: 38, fontWeight: '800', letterSpacing: -1 },
  heroOwedAddon: { color: '#86EFAC', fontSize: 16, fontWeight: '700' },
  heroOverdraft: { color: '#FCA5A5', fontSize: 13, marginTop: 4, fontWeight: '600' },
  heroSub: { color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 10, lineHeight: 18 },
  setDepositBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#FFFFFF', borderRadius: BorderRadius.full, paddingVertical: 9, paddingHorizontal: 16, marginTop: 14,
  },
  setDepositBtnText: { color: '#0A0A0A', fontSize: 13, fontWeight: '700' },

  summaryRow: { flexDirection: 'row', gap: Spacing.sm },
  summaryCard: {
    flex: 1, backgroundColor: Colors.backgroundCard, borderRadius: BorderRadius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  summaryLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.3 },
  summaryValue: { fontSize: 17, fontWeight: '700', marginTop: 4 },
  card: {
    backgroundColor: Colors.backgroundCard, borderRadius: BorderRadius.lg,
    padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#0A0A0A' },
  seeAll: { fontSize: 13, color: '#737373', fontWeight: '500' },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  legendLabel: { fontSize: 11, color: Colors.textSecondary, maxWidth: 60 },
  txRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  txMeta: { flex: 1, marginLeft: 12 },
  txMerchant: { fontSize: 14, fontWeight: '600', color: '#0A0A0A' },
  txTime: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  txAmountCol: { alignItems: 'flex-end' },
  txAmount: { fontSize: 15, fontWeight: '700' },
  pendingBadge: { backgroundColor: Colors.warningLight, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, marginTop: 2 },
  pendingText: { fontSize: 9, color: Colors.warning, fontWeight: '600', textTransform: 'uppercase' },
  divider: { height: 1, backgroundColor: Colors.borderLight, marginLeft: 64 },
  emptyState: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyIconWrap: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: '#F5F5F5',
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#0A0A0A' },
  emptyBody: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, paddingHorizontal: 32 },

  // Modal styles
  modalRoot: { flex: 1, backgroundColor: Colors.background },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  modalCancel: { fontSize: 15, color: Colors.textSecondary },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#0A0A0A' },
  modalSave: { fontSize: 15, color: '#0A0A0A', fontWeight: '700' },
  modalContent: { padding: Spacing.xl, gap: Spacing.lg },
  toggleRow: { flexDirection: 'row', gap: 10 },
  toggleBtn: {
    flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.backgroundMuted,
  },
  toggleBtnActive: { backgroundColor: '#FFFFFF', borderColor: '#0A0A0A' },
  toggleBtnText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  toggleBtnTextActive: { color: '#0A0A0A', fontWeight: '700' },
  amountInputWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: 16 },
  amountPrefix: { fontSize: 36, fontWeight: '700', color: '#0A0A0A', marginRight: 6 },
  amountInputField: { fontSize: 44, fontWeight: '800', color: '#0A0A0A', minWidth: 160 },
  hintText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 18, paddingHorizontal: 16 },
  presetRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 8 },
  presetChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: BorderRadius.full,
    backgroundColor: '#F5F5F5', borderWidth: 1, borderColor: Colors.border,
  },
  presetChipText: { fontSize: 12, fontWeight: '600', color: '#0A0A0A' },
});

