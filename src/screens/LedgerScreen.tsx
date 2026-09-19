// SPENDY — Ledger Screen (Section 10)
// Full filterable transaction history, Pending Reconciliation, Settings

import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Alert, Linking, RefreshControl, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useLedgerStore } from '../store/ledgerStore';
import { getAllTransactions } from '../database/queries';
import { formatCurrency, formatDate } from '../utils/upiLink';
import { Colors, Spacing, BorderRadius, Shadows } from '../constants/theme';
import { Transaction, Category } from '../database/queries';
import CategoryIcon from '../components/CategoryIcon';
import { checkNotificationListenerPermission, openNotificationListenerSettings } from '../native/SpendyNative';
import { parseNotification } from '../parsers/parseEngine';

type FilterType = 'all' | 'debit' | 'credit' | 'pending';


// ─── Transaction Row (Minimal Black Design) ──────────────────────────────────

function LedgerRow({ tx, category, onCategorize, onDismiss }: {
  tx: Transaction;
  category?: Category;
  onCategorize: () => void;
  onDismiss: () => void;
}) {
  const isDebit = tx.type === 'debit';
  const isPending = tx.status === 'pending_reconciliation';
  return (
    <TouchableOpacity onLongPress={onDismiss} activeOpacity={0.7}>
      <View style={[styles.txRow, isPending && styles.txRowPending]}>
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
          <Text style={styles.txSource}>{tx.raw_source} · {formatDate(tx.timestamp)}</Text>
          {isPending && (
            <TouchableOpacity style={styles.tagBtn} onPress={onCategorize}>
              <Text style={styles.tagBtnText}>Tag category →</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={[styles.txAmt, { color: isDebit ? '#0A0A0A' : '#16A34A' }]}>
          {isDebit ? '−' : '+'}{formatCurrency(tx.amount)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Category Picker Modal ────────────────────────────────────────────────────

function CategoryPickerModal({ visible, categories, onPick, onClose }: {
  visible: boolean; categories: Category[]; onPick: (id: string) => void; onClose: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[cpMod.root, { paddingTop: Platform.OS === 'ios' ? 44 : 20 }]}>
        <View style={cpMod.header}>
          <TouchableOpacity onPress={onClose}><Text style={cpMod.cancel}>Cancel</Text></TouchableOpacity>
          <Text style={cpMod.title}>Pick Category</Text>
          <View style={{ width: 60 }} />
        </View>
        <ScrollView>
          {categories.map(cat => (
            <TouchableOpacity key={cat.id} style={cpMod.row} onPress={() => onPick(cat.id)}>
              <CategoryIcon categoryId={cat.id} size={15} color="#0A0A0A" containerSize={36} backgroundColor="#F5F5F5" />
              <Text style={cpMod.name}>{cat.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const cpMod = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Spacing.xl, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  cancel: { fontSize: 15, color: Colors.textSecondary, width: 60 },
  title: { fontSize: 16, fontWeight: '700', color: '#0A0A0A' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.borderLight, gap: 14 },
  name: { fontSize: 15, color: '#0A0A0A', fontWeight: '500' },
});

// ─── Settings Section (Minimal Black Icons) ──────────────────────────────────


function SettingsSection() {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  const checkPerm = async () => {
    const granted = await checkNotificationListenerPermission();
    setHasPermission(granted);
  };

  useEffect(() => {
    checkPerm();
  }, []);

  const handleNotificationPress = async () => {
    const opened = await openNotificationListenerSettings();
    if (!opened) {
      Linking.openSettings();
    }
  };

  const openBatterySettings = () => {
    Alert.alert(
      'Battery Optimization',
      'To ensure SPENDY receives SMS and notifications reliably in background:\n\n1. Go to Settings → Apps → SPENDY → Battery\n2. Select "Unrestricted" or disable battery optimization.',
      [{ text: 'Open Settings', onPress: () => Linking.openSettings() }, { text: 'Later' }]
    );
  };

  const simulateTestNotification = () => {
    Alert.alert(
      'Test Transaction Detection',
      'Simulate an incoming UPI payment notification to test ingestion:',
      [
        {
          text: 'GPay: Paid ₹180 to Starbucks',
          onPress: async () => {
            const parsed = parseNotification(
              'com.google.android.apps.nbu.paisa.user',
              'Google Pay',
              'Paid ₹180 to Starbucks Coffee',
              Date.now()
            );
            if (parsed) {
              await useLedgerStore.getState().ingestTransaction({
                ...parsed,
                raw_source: 'notification',
              });
              Alert.alert('Success', 'Simulated GPay ₹180 notification ingested!');
            }
          }
        },
        {
          text: 'PhonePe: Paid ₹450 to Swiggy',
          onPress: async () => {
            const parsed = parseNotification(
              'com.phonepe.app',
              'PhonePe',
              'Paid ₹450 to Swiggy',
              Date.now()
            );
            if (parsed) {
              await useLedgerStore.getState().ingestTransaction({
                ...parsed,
                raw_source: 'notification',
              });
              Alert.alert('Success', 'Simulated PhonePe ₹450 notification ingested!');
            }
          }
        },
        {
          text: 'GPay: Received ₹1,200',
          onPress: async () => {
            const parsed = parseNotification(
              'com.google.android.apps.nbu.paisa.user',
              'Google Pay',
              'received ₹1,200 from Rahul Sharma',
              Date.now()
            );
            if (parsed) {
              await useLedgerStore.getState().ingestTransaction({
                ...parsed,
                raw_source: 'notification',
              });
              Alert.alert('Success', 'Simulated ₹1,200 credit notification ingested!');
            }
          }
        },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  return (
    <View style={[setStyles.card, Shadows.sm]}>
      <Text style={setStyles.title}>Permissions & Automation</Text>

      <TouchableOpacity style={setStyles.row} onPress={handleNotificationPress}>
        <View style={setStyles.rowLeft}>
          <View style={setStyles.iconWrap}>
            <Feather name="bell" size={15} color="#0A0A0A" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={setStyles.rowTitle}>Notification Access</Text>
            <Text style={setStyles.rowSub}>
              {hasPermission === true ? 'Enabled (Auto-reading UPI)' : 'Tap to enable Special Access in Settings'}
            </Text>
          </View>
        </View>
        <View style={setStyles.statusBadge}>
          <Text style={[setStyles.statusText, hasPermission === false && { color: '#DC2626' }]}>
            {hasPermission === true ? 'Active' : hasPermission === false ? 'Disabled' : 'Check'}
          </Text>
        </View>
      </TouchableOpacity>

      <View style={setStyles.divider} />

      <TouchableOpacity style={setStyles.row} onPress={simulateTestNotification}>
        <View style={setStyles.rowLeft}>
          <View style={setStyles.iconWrap}>
            <Feather name="zap" size={15} color="#0A0A0A" />
          </View>
          <View>
            <Text style={setStyles.rowTitle}>Test UPI Detection</Text>
            <Text style={setStyles.rowSub}>Simulate GPay / PhonePe notification</Text>
          </View>
        </View>
        <Feather name="chevron-right" size={16} color="#A3A3A3" />
      </TouchableOpacity>

      <View style={setStyles.divider} />

      <TouchableOpacity style={setStyles.row} onPress={openBatterySettings}>
        <View style={setStyles.rowLeft}>
          <View style={setStyles.iconWrap}>
            <Feather name="battery-charging" size={15} color="#0A0A0A" />
          </View>
          <View>
            <Text style={setStyles.rowTitle}>Battery Optimization</Text>
            <Text style={setStyles.rowSub}>Disable for background detection</Text>
          </View>
        </View>
        <Feather name="chevron-right" size={16} color="#A3A3A3" />
      </TouchableOpacity>

      <View style={setStyles.divider} />

      <View style={setStyles.row}>
        <View style={setStyles.rowLeft}>
          <View style={setStyles.iconWrap}>
            <Feather name="shield" size={15} color="#0A0A0A" />
          </View>
          <View>
            <Text style={setStyles.rowTitle}>Local Database</Text>
            <Text style={setStyles.rowSub}>Encrypted SQLite on device</Text>
          </View>
        </View>
        <View style={setStyles.statusBadge}>
          <Text style={setStyles.statusText}>Active</Text>
        </View>
      </View>
    </View>
  );
}


const setStyles = StyleSheet.create({
  card: { backgroundColor: Colors.backgroundCard, borderRadius: BorderRadius.lg, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  title: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, padding: Spacing.lg, paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  iconWrap: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '600', color: '#0A0A0A' },
  rowSub: { fontSize: 12, color: Colors.textMuted, marginTop: 1 },
  divider: { height: 1, backgroundColor: Colors.borderLight, marginLeft: 56 },
  statusBadge: { backgroundColor: '#F5F5F5', borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: '700', color: '#16A34A' },
});

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function LedgerScreen() {
  const insets = useSafeAreaInsets();
  const { pendingTransactions, categories, categorizeTransaction, dismissTransaction, loadAll } = useLedgerStore();
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [targetTxId, setTargetTxId] = useState<string | null>(null);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const txs = await getAllTransactions(0, 200);
      setAllTransactions(txs);
    } finally {
      setLoading(false);
    }
  };

  const handleCategorize = (id: string) => {
    setTargetTxId(id);
    setPickerVisible(true);
  };

  const handlePickCategory = async (categoryId: string) => {
    if (!targetTxId) return;
    setPickerVisible(false);
    await categorizeTransaction(targetTxId, categoryId);
    await fetchAll();
  };

  const handleDismiss = (id: string) => {
    Alert.alert('Dismiss Transaction', 'Hide this transaction from your ledger?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Dismiss', style: 'destructive', onPress: async () => { await dismissTransaction(id); await fetchAll(); } },
    ]);
  };

  const categoryMap = Object.fromEntries(categories.map(c => [c.id, c]));

  const filtered = allTransactions.filter(tx => {
    if (filter === 'debit' && tx.type !== 'debit') return false;
    if (filter === 'credit' && tx.type !== 'credit') return false;
    if (filter === 'pending' && tx.status !== 'pending_reconciliation') return false;
    if (search) {
      const q = search.toLowerCase();
      return (tx.merchant ?? '').toLowerCase().includes(q) ||
        (categoryMap[tx.category_id ?? '']?.name ?? '').toLowerCase().includes(q);
    }
    return true;
  });

  const filters: { key: FilterType; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'debit', label: 'Spent' },
    { key: 'credit', label: 'Received' },
    { key: 'pending', label: `Pending${pendingTransactions.length > 0 ? ` (${pendingTransactions.length})` : ''}` },
  ];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Ledger</Text>
        <Text style={styles.count}>{filtered.length} records</Text>
      </View>

      {/* Search */}
      <View style={styles.searchBar}>
        <View style={styles.searchInner}>
          <Feather name="search" size={15} color="#737373" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search merchant or category..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      {/* Filter pills */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterBar}>
        {filters.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { fetchAll(); loadAll(); }} tintColor="#0A0A0A" />}
      >
        {/* Pending Reconciliation Banner */}
        {pendingTransactions.length > 0 && filter !== 'pending' && (
          <TouchableOpacity style={styles.pendingBanner} onPress={() => setFilter('pending')}>
            <Text style={styles.pendingBannerText}>⚠ {pendingTransactions.length} transactions need tagging →</Text>
          </TouchableOpacity>
        )}

        {/* Transaction List */}
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIconWrap}>
              <Feather name="file-text" size={28} color="#0A0A0A" />
            </View>
            <Text style={styles.emptyTitle}>No transactions</Text>
          </View>
        ) : (
          <View style={[{ backgroundColor: Colors.backgroundCard, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' }, Shadows.sm]}>
            {filtered.map((tx, i) => (
              <View key={tx.id}>
                <LedgerRow
                  tx={tx}
                  category={tx.category_id ? categoryMap[tx.category_id] : undefined}
                  onCategorize={() => handleCategorize(tx.id)}
                  onDismiss={() => handleDismiss(tx.id)}
                />
                {i < filtered.length - 1 && <View style={styles.divider} />}
              </View>
            ))}
          </View>
        )}

        {/* Settings */}
        <View style={{ marginTop: 24 }}>
          <SettingsSection />
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      <CategoryPickerModal
        visible={pickerVisible}
        categories={categories}
        onPick={handlePickCategory}
        onClose={() => setPickerVisible(false)}
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
  count: { fontSize: 13, color: Colors.textMuted },
  searchBar: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  searchInner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.backgroundMuted, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#0A0A0A', padding: 0 },
  filterBar: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, gap: 8 },
  filterChip: { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#F5F5F5', borderWidth: 1, borderColor: '#E5E5E5', alignItems: 'center', justifyContent: 'center' },
  filterChipActive: { backgroundColor: '#0A0A0A', borderColor: '#0A0A0A' },
  filterText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  filterTextActive: { color: '#FFFFFF' },
  scroll: { padding: Spacing.xl, gap: Spacing.md },
  pendingBanner: { backgroundColor: Colors.warningLight, borderRadius: BorderRadius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.warning },
  pendingBannerText: { color: Colors.warning, fontWeight: '700', fontSize: 13 },
  txRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  txRowPending: { backgroundColor: Colors.warningLight + '40' },
  txMeta: { flex: 1, marginLeft: 12 },
  txMerchant: { fontSize: 14, fontWeight: '600', color: '#0A0A0A' },
  txSource: { fontSize: 11, color: Colors.textMuted, marginTop: 2, textTransform: 'capitalize' },
  tagBtn: { marginTop: 4 },
  tagBtnText: { fontSize: 12, color: '#0A0A0A', fontWeight: '600' },
  txAmt: { fontSize: 15, fontWeight: '700', marginLeft: 8 },
  divider: { height: 1, backgroundColor: Colors.borderLight, marginLeft: 64 },
  empty: { flex: 1, alignItems: 'center', paddingTop: 48, gap: 8 },
  emptyIconWrap: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: '#F5F5F5',
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#0A0A0A' },
});
