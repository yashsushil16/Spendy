// SPENDY — Envelopes Screen (Section 10)
// Grid of envelope cards, progress bars, payday-lock toggle, add FAB

import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Modal, TextInput, Switch, Alert, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useLedgerStore } from '../store/ledgerStore';
import { insertEnvelope, deleteEnvelope } from '../database/queries';
import { formatCurrency } from '../utils/upiLink';
import { Colors, Spacing, BorderRadius, Shadows } from '../constants/theme';
import CategoryIcon from '../components/CategoryIcon';

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  return (
    <View style={prog.track}>
      <View style={[prog.fill, { width: `${pct * 100}%`, backgroundColor: color }]} />
    </View>
  );
}
const prog = StyleSheet.create({
  track: { height: 4, backgroundColor: Colors.backgroundMuted, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
});

// ─── Envelope Card (Minimal Black Icons) ──────────────────────────────────────

function EnvelopeCard({ envelope, onPress, onDelete }: {
  envelope: any;
  onPress: () => void;
  onDelete: () => void;
}) {
  const spent = envelope.locked_amount;
  const budget = envelope.target_amount;
  const remaining = budget - spent;
  const pct = budget > 0 ? Math.min(spent / budget, 1) : 0;
  const barColor = pct > 0.9 ? '#DC2626' : pct > 0.7 ? '#D97706' : '#0A0A0A';
  const isLocked = envelope.lock_on_payday;

  return (
    <TouchableOpacity style={[styles.envelopeCard, Shadows.sm]} onPress={onPress} onLongPress={onDelete} activeOpacity={0.85}>
      <View style={styles.envelopeHeader}>
        <View style={styles.iconCircle}>
          <CategoryIcon categoryId={envelope.category_id} size={15} color="#0A0A0A" />
        </View>
        {isLocked && (
          <View style={styles.lockBadge}>
            <Feather name="lock" size={11} color="#0A0A0A" />
          </View>
        )}
      </View>
      <Text style={styles.envelopeName} numberOfLines={1}>{envelope.category_name}</Text>
      <Text style={styles.envelopeRemaining}>
        {formatCurrency(remaining)} left
      </Text>
      <View style={{ marginTop: 8 }}>
        <ProgressBar value={spent} max={budget} color={barColor} />
      </View>
      <View style={styles.envelopeAmounts}>
        <Text style={styles.envelopeSub}>{formatCurrency(spent)} spent</Text>
        <Text style={styles.envelopeSub}>{formatCurrency(budget)}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Add Envelope Modal ───────────────────────────────────────────────────────

function AddEnvelopeModal({ visible, onClose, onAdded, categories }: {
  visible: boolean; onClose: () => void; onAdded: () => void; categories: any[];
}) {
  const insets = useSafeAreaInsets();
  const [selectedCategory, setSelectedCategory] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [lockOnPayday, setLockOnPayday] = useState(false);
  const [paydayDay, setPaydayDay] = useState('1');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (categories.length > 0 && !selectedCategory) {
      setSelectedCategory(categories[0].id);
    }
  }, [categories]);

  const handleSave = async () => {
    if (!selectedCategory || !targetAmount) {
      Alert.alert('Required', 'Please select a category and enter a target amount.');
      return;
    }
    const parsed = parseFloat(targetAmount);
    if (isNaN(parsed) || parsed <= 0) {
      Alert.alert('Invalid', 'Please enter a valid target amount.');
      return;
    }
    setSaving(true);
    try {
      await insertEnvelope({
        category_id: selectedCategory,
        target_amount: parsed,
        lock_on_payday: lockOnPayday,
        payday_day_of_month: lockOnPayday ? parseInt(paydayDay) : null,
      });
      onAdded();
      onClose();
      setSelectedCategory(categories[0]?.id || ''); setTargetAmount(''); setLockOnPayday(false); setPaydayDay('1');
    } catch (err) {
      Alert.alert('Error', String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[modal.root, { paddingTop: Math.max(insets.top, 24) }]}>
        <View style={modal.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ padding: 8 }}>
            <Text style={modal.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={modal.title}>New Envelope</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ padding: 8 }}>
            <Text style={[modal.save, saving && { opacity: 0.5 }]}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={modal.content}>

          <Text style={modal.label}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            {categories.map(cat => (
              <TouchableOpacity
                key={cat.id}
                style={[modal.chip, selectedCategory === cat.id && modal.chipSelected]}
                onPress={() => setSelectedCategory(cat.id)}
              >
                <CategoryIcon categoryId={cat.id} size={13} color={selectedCategory === cat.id ? '#FFFFFF' : '#0A0A0A'} />
                <Text style={[modal.chipText, selectedCategory === cat.id && modal.chipTextSelected]}>
                  {cat.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={modal.label}>Monthly Budget (₹)</Text>
          <TextInput
            style={modal.input}
            keyboardType="numeric"
            placeholder="e.g. 5000"
            placeholderTextColor={Colors.textMuted}
            value={targetAmount}
            onChangeText={setTargetAmount}
          />

          <View style={modal.switchRow}>
            <View>
              <Text style={modal.label}>Lock on Payday</Text>
              <Text style={modal.sublabel}>Auto-lock budget on salary day</Text>
            </View>
            <Switch value={lockOnPayday} onValueChange={setLockOnPayday} trackColor={{ true: '#0A0A0A' }} />
          </View>

          {lockOnPayday && (
            <>
              <Text style={modal.label}>Payday (day of month)</Text>
              <TextInput
                style={modal.input}
                keyboardType="numeric"
                placeholder="e.g. 1"
                placeholderTextColor={Colors.textMuted}
                value={paydayDay}
                onChangeText={setPaydayDay}
              />
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const modal = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Spacing.xl, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  cancel: { fontSize: 15, color: Colors.textSecondary },
  title: { fontSize: 16, fontWeight: '700', color: '#0A0A0A' },
  save: { fontSize: 15, color: '#0A0A0A', fontWeight: '700' },
  content: { padding: Spacing.xl, gap: Spacing.sm },
  label: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  sublabel: { fontSize: 12, color: Colors.textMuted },
  input: {
    backgroundColor: Colors.backgroundMuted, borderRadius: BorderRadius.md,
    padding: Spacing.md, fontSize: 15, color: Colors.textPrimary, marginBottom: 16,
  },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.backgroundMuted, borderRadius: BorderRadius.full,
    paddingHorizontal: 14, paddingVertical: 8, marginRight: 8, borderWidth: 1, borderColor: Colors.border,
  },
  chipSelected: { backgroundColor: '#0A0A0A', borderColor: '#0A0A0A' },
  chipText: { fontSize: 13, color: '#0A0A0A', fontWeight: '500' },
  chipTextSelected: { color: '#FFFFFF', fontWeight: '600' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
});

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function EnvelopesScreen() {
  const insets = useSafeAreaInsets();
  const { envelopes, categories, loadEnvelopes, loadAll } = useLedgerStore();
  const [showModal, setShowModal] = useState(false);

  useEffect(() => { loadAll(); }, []);

  const handleDelete = (id: string, name: string) => {
    Alert.alert('Delete Envelope', `Delete the "${name}" envelope?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteEnvelope(id); await loadEnvelopes(); } },
    ]);
  };

  const totalBudget = envelopes.reduce((s, e) => s + e.target_amount, 0);
  const totalLocked = envelopes.reduce((s, e) => s + e.locked_amount, 0);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Envelopes</Text>
          <Text style={styles.subtitle}>{formatCurrency(totalLocked)} of {formatCurrency(totalBudget)} used</Text>
        </View>
        <TouchableOpacity style={styles.fab} onPress={() => setShowModal(true)} activeOpacity={0.8}>
          <Feather name="plus" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.grid}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={false} onRefresh={loadEnvelopes} tintColor="#0A0A0A" />}
      >
        {envelopes.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIconWrap}>
              <Feather name="layers" size={28} color="#0A0A0A" />
            </View>
            <Text style={styles.emptyTitle}>No envelopes yet</Text>
            <Text style={styles.emptyBody}>Create envelopes to budget by category and lock funds on payday.</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowModal(true)} activeOpacity={0.8}>
              <Text style={styles.emptyBtnText}>Create First Envelope</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.gridInner}>
            {envelopes.map(env => (
              <EnvelopeCard
                key={env.id}
                envelope={env}
                onPress={() => {}}
                onDelete={() => handleDelete(env.id, env.category_name ?? 'envelope')}
              />
            ))}
          </View>
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      <AddEnvelopeModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        onAdded={loadEnvelopes}
        categories={categories}
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
  title: { fontSize: 20, fontWeight: '800', color: '#0A0A0A', letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  fab: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#0A0A0A', alignItems: 'center', justifyContent: 'center',
  },
  grid: { padding: Spacing.xl },
  gridInner: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  envelopeCard: {
    width: '47%', backgroundColor: Colors.backgroundCard, borderRadius: BorderRadius.lg,
    padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border,
  },
  envelopeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  iconCircle: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#F5F5F5',
    alignItems: 'center', justifyContent: 'center',
  },
  lockBadge: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: '#F5F5F5',
    alignItems: 'center', justifyContent: 'center',
  },
  envelopeName: { fontSize: 13, fontWeight: '700', color: '#0A0A0A', marginTop: 8 },
  envelopeRemaining: { fontSize: 18, fontWeight: '800', color: '#0A0A0A', marginTop: 4, letterSpacing: -0.5 },
  envelopeAmounts: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  envelopeSub: { fontSize: 11, color: Colors.textMuted },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 10 },
  emptyIconWrap: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: '#F5F5F5',
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#0A0A0A' },
  emptyBody: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, paddingHorizontal: 32 },
  emptyBtn: { backgroundColor: '#0A0A0A', borderRadius: BorderRadius.full, paddingHorizontal: 22, paddingVertical: 10, marginTop: 8 },
  emptyBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
});
