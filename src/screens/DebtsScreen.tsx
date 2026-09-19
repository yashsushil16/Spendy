// SPENDY — Debts Screen (Section 10)
// You-Owe / Owed-to-You sections, Pay via UPI button, Add Debt, expandable history

import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Modal, TextInput, Alert, RefreshControl, AppState,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useLedgerStore } from '../store/ledgerStore';
import { insertDebt, createUpiIntent, updateUpiIntentStatus } from '../database/queries';
import { openUpiPayment, formatCurrency, formatDate } from '../utils/upiLink';
import { Colors, Spacing, BorderRadius, Shadows } from '../constants/theme';

// ─── Debt Card (Minimal Black Design) ─────────────────────────────────────────

function DebtCard({ debt, onSettle, onPay }: { debt: any; onSettle: () => void; onPay: () => void }) {
  const isOwed = debt.amount > 0; // they owe you
  const isYouOwe = debt.amount < 0; // you owe them

  return (
    <View style={[styles.debtCard, Shadows.sm]}>
      <View style={styles.debtTop}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{debt.person_name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.debtInfo}>
          <Text style={styles.debtName}>{debt.person_name}</Text>
          {debt.upi_id && <Text style={styles.debtUpi}>{debt.upi_id}</Text>}
          {debt.note && <Text style={styles.debtNote} numberOfLines={1}>{debt.note}</Text>}
          <Text style={styles.debtDate}>{formatDate(debt.created_at)}</Text>
        </View>
        <View style={styles.debtRight}>
          <Text style={[styles.debtAmount, { color: isOwed ? '#16A34A' : '#0A0A0A' }]}>
            {isOwed ? '+' : '−'}{formatCurrency(Math.abs(debt.amount))}
          </Text>
          <Text style={styles.debtDirection}>{isOwed ? 'owes you' : 'you owe'}</Text>
        </View>
      </View>

      <View style={styles.debtActions}>
        {isYouOwe && debt.upi_id && (
          <TouchableOpacity style={[styles.actionBtn, styles.payBtn]} onPress={onPay}>
            <Feather name="send" size={12} color="#0A0A0A" style={{ marginRight: 6 }} />
            <Text style={styles.payBtnText}>Pay via UPI</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.actionBtn, styles.settleBtn]} onPress={onSettle}>
          <Feather name="check" size={13} color="#16A34A" style={{ marginRight: 6 }} />
          <Text style={styles.settleBtnText}>Mark Settled</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Add Debt Modal ───────────────────────────────────────────────────────────

function AddDebtModal({ visible, onClose, onAdded }: { visible: boolean; onClose: () => void; onAdded: () => void }) {
  const [personName, setPersonName] = useState('');
  const [upiId, setUpiId] = useState('');
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<'owe' | 'owed'>('owed');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!personName || !amount) { Alert.alert('Required', 'Person name and amount are required.'); return; }
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) { Alert.alert('Invalid', 'Enter a valid amount.'); return; }
    setSaving(true);
    try {
      await insertDebt({
        person_name: personName.trim(),
        upi_id: upiId.trim() || null,
        amount: direction === 'owed' ? parsed : -parsed,
        status: 'open',
        note: note.trim() || null,
      });
      onAdded();
      onClose();
      setPersonName(''); setUpiId(''); setAmount(''); setNote('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[mod.root, { paddingTop: Platform.OS === 'ios' ? 44 : 20 }]}>
        <View style={mod.header}>
          <TouchableOpacity onPress={onClose}><Text style={mod.cancel}>Cancel</Text></TouchableOpacity>
          <Text style={mod.title}>Record Debt</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            <Text style={[mod.save, saving && { opacity: 0.5 }]}>Save</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={mod.content}>
          {/* Direction toggle */}
          <View style={mod.toggle}>
            <TouchableOpacity
              style={[mod.toggleOpt, direction === 'owed' && mod.toggleActive]}
              onPress={() => setDirection('owed')}
            >
              <Text style={[mod.toggleText, direction === 'owed' && mod.toggleTextActive]}>They owe me</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[mod.toggleOpt, direction === 'owe' && mod.toggleActive]}
              onPress={() => setDirection('owe')}
            >
              <Text style={[mod.toggleText, direction === 'owe' && mod.toggleTextActive]}>I owe them</Text>
            </TouchableOpacity>
          </View>

          <Text style={mod.label}>Person's Name</Text>
          <TextInput style={mod.input} placeholder="Name" placeholderTextColor={Colors.textMuted} value={personName} onChangeText={setPersonName} />

          <Text style={mod.label}>UPI ID (optional)</Text>
          <TextInput style={mod.input} placeholder="name@upi" placeholderTextColor={Colors.textMuted} value={upiId} onChangeText={setUpiId} autoCapitalize="none" keyboardType="email-address" />

          <Text style={mod.label}>Amount (₹)</Text>
          <TextInput style={mod.input} keyboardType="numeric" placeholder="0.00" placeholderTextColor={Colors.textMuted} value={amount} onChangeText={setAmount} />

          <Text style={mod.label}>Note (optional)</Text>
          <TextInput style={mod.input} placeholder="What's it for?" placeholderTextColor={Colors.textMuted} value={note} onChangeText={setNote} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const mod = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Spacing.xl, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  cancel: { fontSize: 15, color: Colors.textSecondary },
  title: { fontSize: 16, fontWeight: '700', color: '#0A0A0A' },
  save: { fontSize: 15, color: '#0A0A0A', fontWeight: '700' },
  content: { padding: Spacing.xl, gap: Spacing.sm },
  label: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: Colors.backgroundMuted, borderRadius: BorderRadius.md,
    padding: Spacing.md, fontSize: 15, color: Colors.textPrimary, marginBottom: 16,
  },
  toggle: { flexDirection: 'row', backgroundColor: Colors.backgroundMuted, borderRadius: BorderRadius.md, padding: 4, marginBottom: 20 },
  toggleOpt: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: BorderRadius.sm },
  toggleActive: { backgroundColor: '#FFFFFF', ...Shadows.sm },
  toggleText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  toggleTextActive: { color: '#0A0A0A' },
});

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function DebtsScreen() {
  const insets = useSafeAreaInsets();
  const { debts, loadDebts, loadSummary, summary } = useLedgerStore();
  const [showModal, setShowModal] = useState(false);
  const [awaitingPayment, setAwaitingPayment] = useState<string | null>(null);

  useEffect(() => { loadDebts(); }, []);

  // After UPI payment returns, set intent to confirmed
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state === 'active' && awaitingPayment) {
        await updateUpiIntentStatus(awaitingPayment, 'confirmed');
        setAwaitingPayment(null);
        await loadDebts();
        await loadSummary();
      }
    });
    return () => sub.remove();
  }, [awaitingPayment]);

  const handlePay = async (debt: any) => {
    const success = await openUpiPayment({
      upiId: debt.upi_id,
      name: debt.person_name,
      amount: Math.abs(debt.amount),
      note: debt.note ?? 'Clearing Debt via SPENDY',
    });
    if (success) {
      const intentId = await createUpiIntent({
        debt_id: debt.id,
        amount: Math.abs(debt.amount),
        upi_id: debt.upi_id,
        note: debt.note,
        status: 'initiated',
      });
      setAwaitingPayment(intentId);
    } else {
      Alert.alert('No UPI App', 'No UPI app found. Please install GPay, PhonePe, or Paytm.');
    }
  };

  const handleSettle = (debt: any) => {
    Alert.alert('Mark as Settled', `Mark ₹${Math.abs(debt.amount).toFixed(0)} with ${debt.person_name} as settled?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Settle', onPress: async () => { await useLedgerStore.getState().settleDebt(debt.id); } },
    ]);
  };

  const youOwe = debts.filter(d => d.amount < 0);
  const owedToYou = debts.filter(d => d.amount > 0);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Debts</Text>
          <Text style={styles.subtitle}>
            You owe {formatCurrency(summary.totalOwed)} · Owed {formatCurrency(summary.totalOwedToYou)}
          </Text>
        </View>
        <TouchableOpacity style={styles.fab} onPress={() => setShowModal(true)} activeOpacity={0.8}>
          <Feather name="plus" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={false} onRefresh={loadDebts} tintColor="#0A0A0A" />}
      >
        {youOwe.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionDot} />
              <Text style={styles.sectionTitle}>You Owe</Text>
              <Text style={styles.sectionTotal}>{formatCurrency(summary.totalOwed)}</Text>
            </View>
            {youOwe.map(d => (
              <DebtCard key={d.id} debt={d} onSettle={() => handleSettle(d)} onPay={() => handlePay(d)} />
            ))}
          </>
        )}

        {owedToYou.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionDot, { backgroundColor: '#16A34A' }]} />
              <Text style={styles.sectionTitle}>Owed to You</Text>
              <Text style={[styles.sectionTotal, { color: '#16A34A' }]}>{formatCurrency(summary.totalOwedToYou)}</Text>
            </View>
            {owedToYou.map(d => (
              <DebtCard key={d.id} debt={d} onSettle={() => handleSettle(d)} onPay={() => {}} />
            ))}
          </>
        )}

        {debts.length === 0 && (
          <View style={styles.empty}>
            <View style={styles.emptyIconWrap}>
              <Feather name="users" size={28} color="#0A0A0A" />
            </View>
            <Text style={styles.emptyTitle}>No open debts</Text>
            <Text style={styles.emptyBody}>Track money you owe or are owed. Pay via UPI with one tap.</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowModal(true)} activeOpacity={0.8}>
              <Text style={styles.emptyBtnText}>Record a Debt</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      <AddDebtModal visible={showModal} onClose={() => setShowModal(false)} onAdded={loadDebts} />
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
  title: { fontSize: 20, fontWeight: '800', color: '#0A0A0A', letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  fab: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#0A0A0A', alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: Spacing.xl, gap: Spacing.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  sectionDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#0A0A0A' },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#0A0A0A', flex: 1 },
  sectionTotal: { fontSize: 14, fontWeight: '700', color: '#0A0A0A' },
  debtCard: {
    backgroundColor: Colors.backgroundCard, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  debtTop: { flexDirection: 'row', alignItems: 'flex-start', padding: Spacing.lg, gap: 12 },
  avatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#F5F5F5',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 15, fontWeight: '700', color: '#0A0A0A' },
  debtInfo: { flex: 1 },
  debtName: { fontSize: 15, fontWeight: '700', color: '#0A0A0A' },
  debtUpi: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  debtNote: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  debtDate: { fontSize: 11, color: Colors.textMuted, marginTop: 4 },
  debtRight: { alignItems: 'flex-end' },
  debtAmount: { fontSize: 18, fontWeight: '800', letterSpacing: -0.5 },
  debtDirection: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  debtActions: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: Colors.borderLight },
  actionBtn: { flexDirection: 'row', flex: 1, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  payBtn: { backgroundColor: '#F5F5F5' },
  payBtnText: { fontSize: 13, fontWeight: '700', color: '#0A0A0A' },
  settleBtn: { borderLeftWidth: 1, borderLeftColor: Colors.borderLight },
  settleBtnText: { fontSize: 13, fontWeight: '700', color: '#16A34A' },
  empty: { flex: 1, alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyIconWrap: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: '#F5F5F5',
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#0A0A0A' },
  emptyBody: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, paddingHorizontal: 32 },
  emptyBtn: { backgroundColor: '#0A0A0A', borderRadius: BorderRadius.full, paddingHorizontal: 22, paddingVertical: 10, marginTop: 8 },
  emptyBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
});
