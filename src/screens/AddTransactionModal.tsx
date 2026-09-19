import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, Modal, ScrollView, Alert, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { insertTransaction } from '../database/queries';
import { useLedgerStore } from '../store/ledgerStore';
import { Colors, Spacing, BorderRadius } from '../constants/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function AddTransactionModal({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'debit' | 'credit'>('debit');
  const [merchant, setMerchant] = useState('');
  const [saving, setSaving] = useState(false);
  const { loadAll } = useLedgerStore();

  const handleSave = async () => {
    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) {
      Alert.alert('Invalid', 'Please enter a valid amount.');
      return;
    }
    setSaving(true);
    try {
      await insertTransaction({
        amount: parsed,
        type,
        merchant: merchant.trim() || null,
        raw_source: 'manual',
        category_id: null,
        timestamp: Math.floor(Date.now() / 1000),
        matched_intent_id: null,
        status: 'pending_reconciliation',
      });
      await loadAll();
      setAmount(''); setMerchant(''); setType('debit');
      onClose();
    } catch (err) {
      Alert.alert('Error', String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: Math.max(insets.top, Platform.OS === 'android' ? 24 : 0) }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={styles.headerBtn}>
            <Text style={styles.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Add Transaction</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={styles.headerBtn}>
            <Text style={[styles.save, saving && { opacity: 0.5 }]}>Save</Text>
          </TouchableOpacity>
        </View>


        <ScrollView contentContainerStyle={styles.content}>
          {/* Type toggle */}
          <View style={styles.toggle}>
            <TouchableOpacity
              style={[styles.toggleOpt, type === 'debit' && styles.toggleOptActive]}
              onPress={() => setType('debit')}
            >
              <Feather name="arrow-up-right" size={14} color={type === 'debit' ? '#0A0A0A' : '#737373'} style={{ marginRight: 6 }} />
              <Text style={[styles.toggleText, type === 'debit' && styles.toggleTextActive]}>Spent</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleOpt, type === 'credit' && styles.toggleOptActive]}
              onPress={() => setType('credit')}
            >
              <Feather name="arrow-down-left" size={14} color={type === 'credit' ? '#0A0A0A' : '#737373'} style={{ marginRight: 6 }} />
              <Text style={[styles.toggleText, type === 'credit' && styles.toggleTextActive]}>Received</Text>
            </TouchableOpacity>
          </View>

          {/* Amount — large input */}
          <View style={styles.amountRow}>
            <Text style={styles.rupee}>₹</Text>
            <TextInput
              style={styles.amountInput}
              keyboardType="numeric"
              placeholder="0.00"
              placeholderTextColor={Colors.textMuted}
              value={amount}
              onChangeText={setAmount}
              autoFocus
            />
          </View>

          <Text style={styles.label}>Merchant / Note (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Swiggy, Coffee, Salary"
            placeholderTextColor={Colors.textMuted}
            value={merchant}
            onChangeText={setMerchant}
          />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerBtn: { padding: 8 },
  cancel: { fontSize: 15, color: Colors.textSecondary },

  title: { fontSize: 16, fontWeight: '700', color: '#0A0A0A' },
  save: { fontSize: 15, color: '#0A0A0A', fontWeight: '700' },
  content: { padding: Spacing.xl, gap: Spacing.md },
  toggle: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  toggleOpt: {
    flex: 1, flexDirection: 'row', paddingVertical: 12, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.backgroundMuted,
  },
  toggleOptActive: {
    backgroundColor: '#FFFFFF', borderColor: '#0A0A0A',
  },
  toggleText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  toggleTextActive: { color: '#0A0A0A', fontWeight: '700' },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: 24 },
  rupee: { fontSize: 36, fontWeight: '700', color: '#0A0A0A', marginRight: 4 },
  amountInput: { fontSize: 48, fontWeight: '800', color: '#0A0A0A', minWidth: 140 },
  label: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: Colors.backgroundMuted, borderRadius: BorderRadius.md,
    padding: Spacing.md, fontSize: 15, color: Colors.textPrimary,
  },
});
