// SPENDY — Scan & Split Screen (Section 9 + 10)
// Camera capture → ML Kit OCR text → Total detection → editable item list → per-person assignment → UPI links & Record as Debt

import React, { useState, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Alert, Modal, KeyboardAvoidingView, Platform,
  ActivityIndicator, Share,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { parseOcrText, OcrLineItem } from '../parsers/parseEngine';
import { insertBillSplit, insertBillSplitItem, insertDebt } from '../database/queries';
import { openUpiPayment, formatCurrency, formatCurrencyFull } from '../utils/upiLink';
import { recognizeTextFromImage } from '../native/SpendyNative';
import { useLedgerStore } from '../store/ledgerStore';
import { Colors, Spacing, BorderRadius, Shadows } from '../constants/theme';

export type Person = { name: string; upiId?: string };
export type AssignedItem = OcrLineItem & { id: string; assignees: string[] };

// ─── Item Row Component ────────────────────────────────────────────────────────

function ItemRow({
  item,
  index,
  persons,
  onChange,
  onDelete,
}: {
  item: AssignedItem;
  index: number;
  persons: Person[];
  onChange: (idx: number, updated: Partial<AssignedItem>) => void;
  onDelete: (idx: number) => void;
}) {
  const assignedCount = item.assignees.length;

  const togglePerson = (name: string) => {
    const already = item.assignees.includes(name);
    const next = already ? item.assignees.filter(n => n !== name) : [...item.assignees, name];
    onChange(index, { assignees: next });
  };

  const splitPrice = item.price && assignedCount > 0 ? item.price / assignedCount : item.price;

  return (
    <View style={itemStyles.row}>
      <View style={itemStyles.namePrice}>
        <TextInput
          style={itemStyles.nameInput}
          value={item.name}
          onChangeText={v => onChange(index, { name: v })}
          placeholder="Item name"
          placeholderTextColor={Colors.textMuted}
        />
        <View style={itemStyles.priceWrap}>
          <Text style={itemStyles.currencySymbol}>₹</Text>
          <TextInput
            style={itemStyles.priceInput}
            value={item.price !== null ? String(item.price) : ''}
            keyboardType="numeric"
            onChangeText={v => {
              const clean = v.replace(/[^0-9.]/g, '');
              onChange(index, { price: clean ? parseFloat(clean) : null });
            }}
            placeholder="0"
            placeholderTextColor={Colors.textMuted}
          />
        </View>
        <TouchableOpacity style={itemStyles.deleteBtn} onPress={() => onDelete(index)} hitSlop={8}>
          <Feather name="trash-2" size={16} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>
      <View style={itemStyles.chips}>
        {persons.map(p => {
          const selected = item.assignees.includes(p.name);
          return (
            <TouchableOpacity
              key={p.name}
              style={[itemStyles.chip, selected && itemStyles.chipSelected]}
              onPress={() => togglePerson(p.name)}
              activeOpacity={0.7}
            >
              <Text style={[itemStyles.chipText, selected && itemStyles.chipTextSelected]}>
                {p.name}
                {selected && assignedCount > 1 ? ` (${formatCurrency(splitPrice ?? 0)})` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const itemStyles = StyleSheet.create({
  row: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  namePrice: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  nameInput: { flex: 1, fontSize: 14, color: '#0A0A0A', fontWeight: '600', paddingVertical: 4 },
  priceWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.backgroundMuted, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  currencySymbol: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, marginRight: 2 },
  priceInput: { fontSize: 14, color: '#0A0A0A', fontWeight: '800', minWidth: 50, textAlign: 'right' },
  deleteBtn: { padding: 4, marginLeft: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  chip: {
    backgroundColor: Colors.backgroundMuted,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipSelected: { backgroundColor: '#0A0A0A', borderColor: '#0A0A0A' },
  chipText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  chipTextSelected: { color: '#FFFFFF', fontWeight: '700' },
});

// ─── Add Person Modal ─────────────────────────────────────────────────────────

function AddPersonModal({
  visible,
  onAdd,
  onClose,
}: {
  visible: boolean;
  onAdd: (p: Person) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [upiId, setUpiId] = useState('');

  const handleSave = () => {
    if (name.trim()) {
      onAdd({ name: name.trim(), upiId: upiId.trim() || undefined });
      setName('');
      setUpiId('');
      onClose();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={addPMod.sheet}>
            <Text style={addPMod.title}>Add Friend to Split</Text>
            <TextInput
              style={addPMod.input}
              placeholder="Friend's Name (e.g. Rahul, Priya)"
              placeholderTextColor={Colors.textMuted}
              value={name}
              onChangeText={setName}
              autoFocus
            />
            <TextInput
              style={addPMod.input}
              placeholder="UPI ID (optional, e.g. name@okaxis)"
              placeholderTextColor={Colors.textMuted}
              value={upiId}
              onChangeText={setUpiId}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <View style={addPMod.row}>
              <TouchableOpacity style={addPMod.cancel} onPress={onClose}>
                <Text style={{ color: Colors.textSecondary, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={addPMod.save} onPress={handleSave}>
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Add Friend</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const addPMod = StyleSheet.create({
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 12,
  },
  title: { fontSize: 18, fontWeight: '800', color: '#0A0A0A', marginBottom: 4 },
  input: {
    backgroundColor: Colors.backgroundMuted,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: 15,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  row: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancel: {
    flex: 1,
    borderRadius: BorderRadius.md,
    padding: 14,
    backgroundColor: Colors.backgroundMuted,
    alignItems: 'center',
  },
  save: {
    flex: 1,
    borderRadius: BorderRadius.md,
    padding: 14,
    backgroundColor: '#0A0A0A',
    alignItems: 'center',
  },
});

// ─── Main Scan & Split Screen ─────────────────────────────────────────────────

export default function ScanSplitScreen() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<'camera' | 'review' | 'summary'>('camera');
  const [splitMode, setSplitMode] = useState<'equal' | 'itemized'>('itemized');
  const [isScanning, setIsScanning] = useState(false);
  const [totalBillAmount, setTotalBillAmount] = useState<number>(0);
  const [items, setItems] = useState<AssignedItem[]>([]);
  const [persons, setPersons] = useState<Person[]>([{ name: 'Me' }]);
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [merchant, setMerchant] = useState('');
  const [recordedDebts, setRecordedDebts] = useState<Record<string, boolean>>({});
  const cameraRef = useRef<CameraView>(null);

  // Capture & Run On-Device OCR
  const handleCapture = async () => {
    if (!cameraRef.current || isScanning) return;
    try {
      setIsScanning(true);
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9, base64: false });
      if (!photo?.uri) {
        setIsScanning(false);
        return;
      }

      // 1. Run ML Kit text recognition
      const ocrText = await recognizeTextFromImage(photo.uri);
      
      // 2. Parse items and detected total
      const parsed = parseOcrText(ocrText);
      
      if (parsed.merchantName) {
        setMerchant(parsed.merchantName);
      }

      if (parsed.items.length > 0) {
        setItems(
          parsed.items.map((item, idx) => ({
            ...item,
            id: `item-${Date.now()}-${idx}`,
            assignees: ['Me'],
          }))
        );
      } else {
        // If OCR didn't catch separate lines, start with empty editable items
        setItems([
          {
            id: `item-${Date.now()}-0`,
            name: 'Bill Total',
            price: parsed.detectedTotal || 0,
            assignees: ['Me'],
          },
        ]);
      }

      if (parsed.detectedTotal) {
        setTotalBillAmount(parsed.detectedTotal);
      } else {
        const itemSum = parsed.items.reduce((s, it) => s + (it.price || 0), 0);
        setTotalBillAmount(itemSum);
      }

      setIsScanning(false);
      setPhase('review');
    } catch (e: any) {
      setIsScanning(false);
      console.warn('OCR / Camera Error:', e);
      Alert.alert('Scan Issue', 'Could not read receipt cleanly. You can enter or edit amounts manually.');
      setPhase('review');
    }
  };

  const handleManualEntry = () => {
    setMerchant('');
    setTotalBillAmount(0);
    setItems([
      { id: `item-${Date.now()}-0`, name: 'Dish / Item 1', price: 0, assignees: ['Me'] },
    ]);
    setPhase('review');
  };

  const addItem = () => {
    setItems(prev => [
      ...prev,
      { id: `item-${Date.now()}-${prev.length}`, name: `Item ${prev.length + 1}`, price: 0, assignees: ['Me'] },
    ]);
  };

  const updateItem = (idx: number, updates: Partial<AssignedItem>) => {
    setItems(prev => prev.map((item, i) => (i === idx ? { ...item, ...updates } : item)));
  };

  const deleteItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const removePerson = (name: string) => {
    if (name === 'Me') return;
    setPersons(prev => prev.filter(p => p.name !== name));
    setItems(prev =>
      prev.map(it => ({
        ...it,
        assignees: it.assignees.filter(n => n !== name),
      }))
    );
  };

  // Calculate bill total and per-person shares
  const calculateTotals = () => {
    const itemSum = items.reduce((sum, it) => sum + (it.price || 0), 0);
    const effectiveTotal = splitMode === 'equal' ? totalBillAmount || itemSum : itemSum;

    const perPerson: Record<string, number> = {};
    for (const p of persons) perPerson[p.name] = 0;

    if (splitMode === 'equal') {
      const share = persons.length > 0 ? effectiveTotal / persons.length : 0;
      for (const p of persons) {
        perPerson[p.name] = share;
      }
    } else {
      for (const item of items) {
        if (!item.price || item.assignees.length === 0) continue;
        const share = item.price / item.assignees.length;
        for (const assignee of item.assignees) {
          perPerson[assignee] = (perPerson[assignee] ?? 0) + share;
        }
      }
    }

    return { perPerson, effectiveTotal };
  };

  const handleConfirm = async () => {
    const { perPerson, effectiveTotal } = calculateTotals();
    const billId = await insertBillSplit({
      merchant: merchant || 'Bill Split',
      total_amount: effectiveTotal,
      ocr_raw_text: null,
    });

    for (const item of items) {
      await insertBillSplitItem({
        bill_split_id: billId,
        item_name: item.name,
        price: item.price,
        assigned_to: item.assignees.join(','),
      });
    }

    setPhase('summary');
  };

  // Record a person's share directly into Debts (adds to Safe-to-Spend owed amount)
  const handleRecordDebt = async (personName: string, amount: number) => {
    const p = persons.find(item => item.name === personName);
    try {
      await insertDebt({
        person_name: personName,
        upi_id: p?.upiId ?? null,
        amount: Math.round(amount),
        status: 'open',
        note: `Split bill at ${merchant || 'Restaurant'}`,
      });
      await useLedgerStore.getState().loadAll();
      setRecordedDebts(prev => ({ ...prev, [personName]: true }));
      Alert.alert('Saved to Debts', `₹${Math.round(amount)} recorded as owed to you by ${personName}.`);
    } catch (e) {
      Alert.alert('Error', 'Could not record debt.');
    }
  };

  // Share split details on WhatsApp / Apps
  const handleShare = async (personName: string, amount: number) => {
    const p = persons.find(item => item.name === personName);
    const msg = `Hey ${personName}! Your share for the bill at ${merchant || 'our meal'} is ${formatCurrencyFull(amount)}.${p?.upiId ? ` (UPI: ${p.upiId})` : ''} Sent via SPENDY.`;
    try {
      await Share.share({ message: msg });
    } catch (e) {
      console.warn('Share error', e);
    }
  };

  // ── 1. Camera Phase ──────────────────────────────────────────────────────────
  if (phase === 'camera') {
    if (!permission?.granted) {
      return (
        <View style={[styles.root, { paddingTop: insets.top, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl }]}>
          <View style={styles.permIconWrap}>
            <Feather name="camera" size={32} color="#0A0A0A" />
          </View>
          <Text style={{ fontSize: 20, fontWeight: '800', color: '#0A0A0A', textAlign: 'center', marginTop: 12 }}>
            Camera Access Needed
          </Text>
          <Text style={{ fontSize: 14, color: Colors.textSecondary, textAlign: 'center', marginTop: 8, marginBottom: 24, lineHeight: 20 }}>
            SPENDY uses your camera with on-device AI OCR to instantly scan bills, extract line items, and split with friends.
          </Text>
          <TouchableOpacity style={styles.permBtn} onPress={requestPermission} activeOpacity={0.8}>
            <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>Enable Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ marginTop: 20 }} onPress={handleManualEntry}>
            <Text style={{ color: Colors.textSecondary, fontWeight: '600', fontSize: 14 }}>Or Enter Bill Manually</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back">
          <View style={styles.cameraOverlay}>
            <View style={styles.cameraTopBar}>
              <TouchableOpacity style={styles.manualTopBtn} onPress={handleManualEntry} activeOpacity={0.8}>
                <Feather name="edit-3" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>Manual Entry</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.viewfinder}>
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
              <Text style={styles.cameraHint}>Align receipt inside frame</Text>
            </View>

            <View style={styles.captureRow}>
              {isScanning ? (
                <View style={styles.scanningWrap}>
                  <ActivityIndicator size="large" color="#FFFFFF" />
                  <Text style={styles.scanningText}>Scanning Bill with AI OCR...</Text>
                </View>
              ) : (
                <TouchableOpacity style={styles.captureBtn} onPress={handleCapture} activeOpacity={0.8}>
                  <View style={styles.captureBtnInner} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </CameraView>
      </View>
    );
  }

  const { perPerson, effectiveTotal } = calculateTotals();

  // ── 2. Review Phase ──────────────────────────────────────────────────────────
  if (phase === 'review') {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setPhase('camera')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Feather name="arrow-left" size={18} color="#0A0A0A" />
            <Text style={styles.back}>Retake</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Review & Split</Text>
          <TouchableOpacity onPress={handleConfirm} style={styles.doneBtnWrap}>
            <Text style={styles.doneBtn}>Next</Text>
            <Feather name="arrow-right" size={16} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 120 }}>
          {/* Merchant + Total Card */}
          <View style={[styles.billHeroCard, Shadows.sm]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.billHeroLabel}>MERCHANT / RESTAURANT</Text>
              <TextInput
                style={styles.merchantInput}
                placeholder="e.g. Third Wave Coffee, Swiggy"
                value={merchant}
                onChangeText={setMerchant}
                placeholderTextColor={Colors.textMuted}
              />
            </View>
            <View style={styles.billTotalBadge}>
              <Text style={styles.billTotalBadgeLabel}>TOTAL BILL</Text>
              <Text style={styles.billTotalBadgeAmount}>{formatCurrency(effectiveTotal)}</Text>
            </View>
          </View>

          {/* Mode Switch: Split Equally vs Itemized */}
          <View style={styles.modeTabs}>
            <TouchableOpacity
              style={[styles.modeTab, splitMode === 'itemized' && styles.modeTabActive]}
              onPress={() => setSplitMode('itemized')}
            >
              <Feather name="list" size={14} color={splitMode === 'itemized' ? '#FFFFFF' : Colors.textSecondary} style={{ marginRight: 6 }} />
              <Text style={[styles.modeTabText, splitMode === 'itemized' && styles.modeTabTextActive]}>Split by Items</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeTab, splitMode === 'equal' && styles.modeTabActive]}
              onPress={() => setSplitMode('equal')}
            >
              <Feather name="pie-chart" size={14} color={splitMode === 'equal' ? '#FFFFFF' : Colors.textSecondary} style={{ marginRight: 6 }} />
              <Text style={[styles.modeTabText, splitMode === 'equal' && styles.modeTabTextActive]}>Split Equally</Text>
            </TouchableOpacity>
          </View>

          {/* People Bar */}
          <View style={styles.peopleSection}>
            <Text style={styles.sectionHeading}>PEOPLE IN SPLIT ({persons.length})</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
              {persons.map(p => (
                <View key={p.name} style={styles.personChip}>
                  <Text style={styles.personChipText}>{p.name}</Text>
                  {p.name !== 'Me' && (
                    <TouchableOpacity onPress={() => removePerson(p.name)} hitSlop={6} style={{ marginLeft: 6 }}>
                      <Feather name="x" size={13} color={Colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              <TouchableOpacity
                style={[styles.personChip, { backgroundColor: '#0A0A0A', borderColor: '#0A0A0A' }]}
                onPress={() => setShowAddPerson(true)}
                activeOpacity={0.8}
              >
                <Feather name="user-plus" size={13} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={[styles.personChipText, { color: '#FFFFFF' }]}>+ Add Friend</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          {/* Line Items List (or Equal amount field) */}
          {splitMode === 'equal' ? (
            <View style={styles.equalSplitCard}>
              <Text style={styles.equalCardLabel}>Enter Total Amount to Split Equally:</Text>
              <View style={styles.equalInputWrap}>
                <Text style={styles.equalCurrency}>₹</Text>
                <TextInput
                  style={styles.equalInput}
                  value={totalBillAmount ? String(totalBillAmount) : ''}
                  onChangeText={v => setTotalBillAmount(parseFloat(v) || 0)}
                  placeholder="0"
                  keyboardType="numeric"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
              <Text style={styles.equalPerPerson}>
                Each person pays: <Text style={{ fontWeight: '800', color: '#0A0A0A' }}>{formatCurrency(effectiveTotal / Math.max(1, persons.length))}</Text>
              </Text>
            </View>
          ) : (
            <View style={styles.itemsSection}>
              <View style={styles.itemsSectionHeader}>
                <Text style={styles.sectionHeading}>SCANNED ITEMS ({items.length})</Text>
                <TouchableOpacity onPress={addItem} style={styles.addItemBtn}>
                  <Feather name="plus-circle" size={14} color="#0A0A0A" style={{ marginRight: 4 }} />
                  <Text style={styles.addItemBtnText}>Add Item</Text>
                </TouchableOpacity>
              </View>

              {items.map((item, i) => (
                <ItemRow
                  key={item.id || i}
                  item={item}
                  index={i}
                  persons={persons}
                  onChange={updateItem}
                  onDelete={deleteItem}
                />
              ))}

              <TouchableOpacity style={styles.addDashedBtn} onPress={addItem} activeOpacity={0.7}>
                <Feather name="plus" size={16} color={Colors.textSecondary} />
                <Text style={styles.addDashedBtnText}>Add Another Item</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

        <AddPersonModal
          visible={showAddPerson}
          onAdd={p => setPersons(prev => [...prev, p])}
          onClose={() => setShowAddPerson(false)}
        />
      </View>
    );
  }

  // ── 3. Summary Phase ─────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setPhase('review')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Feather name="arrow-left" size={18} color="#0A0A0A" />
          <Text style={styles.back}>Edit Split</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Split Summary</Text>
        <TouchableOpacity
          onPress={() => {
            setPhase('camera');
            setItems([]);
            setPersons([{ name: 'Me' }]);
            setRecordedDebts({});
          }}
        >
          <Text style={styles.doneBtnSimple}>New Scan</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.md, paddingBottom: 100 }}>
        {/* Total Card */}
        <View style={[styles.summaryHeroCard, Shadows.md]}>
          <View>
            <Text style={styles.summaryMerchant}>{merchant || 'Bill Split'}</Text>
            <Text style={styles.summarySplitType}>
              {splitMode === 'equal' ? 'Split Equally' : 'Itemized Split'} · {persons.length} people
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.summaryTotalLabel}>Grand Total</Text>
            <Text style={styles.summaryTotalAmount}>{formatCurrencyFull(effectiveTotal)}</Text>
          </View>
        </View>

        {/* Per-person Breakdown */}
        <Text style={[styles.sectionHeading, { marginTop: 8 }]}>INDIVIDUAL SHARES</Text>

        {Object.entries(perPerson).map(([name, amt]) => {
          const person = persons.find(p => p.name === name);
          const isMe = name === 'Me';
          const isRecorded = recordedDebts[name];

          return (
            <View key={name} style={[styles.personSummaryCard, Shadows.sm]}>
              <View style={styles.personSummaryTop}>
                <View style={styles.personAvatar}>
                  <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.personName}>{name} {isMe && '(You)'}</Text>
                  {person?.upiId ? (
                    <Text style={styles.personUpi}>{person.upiId}</Text>
                  ) : (
                    <Text style={styles.personUpi}>{isMe ? 'Paid by you' : 'Owes you'}</Text>
                  )}
                </View>
                <Text style={styles.personShareAmt}>{formatCurrencyFull(amt)}</Text>
              </View>

              {!isMe && amt > 0 && (
                <View style={styles.personActionRow}>
                  {/* Record Debt Button */}
                  <TouchableOpacity
                    style={[styles.actionBtn, isRecorded && styles.actionBtnDone]}
                    onPress={() => handleRecordDebt(name, amt)}
                    disabled={isRecorded}
                    activeOpacity={0.8}
                  >
                    <Feather name={isRecorded ? 'check' : 'bookmark'} size={13} color={isRecorded ? '#16A34A' : '#0A0A0A'} style={{ marginRight: 4 }} />
                    <Text style={[styles.actionBtnText, isRecorded && { color: '#16A34A' }]}>
                      {isRecorded ? 'Saved to Debts' : 'Record Debt (+₹)'}
                    </Text>
                  </TouchableOpacity>

                  {/* WhatsApp / Share */}
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => handleShare(name, amt)}
                    activeOpacity={0.8}
                  >
                    <Feather name="share-2" size={13} color="#0A0A0A" style={{ marginRight: 4 }} />
                    <Text style={styles.actionBtnText}>Request</Text>
                  </TouchableOpacity>

                  {/* Pay via UPI (if person provided upiId) */}
                  {person?.upiId && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: '#0A0A0A' }]}
                      onPress={() => openUpiPayment({ upiId: person.upiId!, name, amount: amt, note: `Split bill at ${merchant}` })}
                      activeOpacity={0.8}
                    >
                      <Feather name="send" size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
                      <Text style={[styles.actionBtnText, { color: '#FFFFFF' }]}>Pay UPI</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: '#FFFFFF',
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#0A0A0A' },
  back: { fontSize: 14, color: '#0A0A0A', fontWeight: '600' },
  doneBtnWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0A0A0A',
    borderRadius: BorderRadius.full,
    paddingHorizontal: 14,
    paddingVertical: 6,
    gap: 4,
  },
  doneBtn: { fontSize: 13, color: '#FFFFFF', fontWeight: '700' },
  doneBtnSimple: { fontSize: 14, color: '#0A0A0A', fontWeight: '700' },

  // Camera
  camera: { flex: 1 },
  cameraOverlay: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: 24,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  cameraTopBar: { flexDirection: 'row', justifyContent: 'flex-end' },
  manualTopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: BorderRadius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  viewfinder: {
    alignSelf: 'center',
    width: '85%',
    height: 320,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  corner: { position: 'absolute', width: 24, height: 24, borderColor: '#FFFFFF' },
  cornerTL: { top: -2, left: -2, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 12 },
  cornerTR: { top: -2, right: -2, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 12 },
  cornerBL: { bottom: -2, left: -2, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 12 },
  cornerBR: { bottom: -2, right: -2, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 12 },
  cameraHint: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  captureRow: { alignItems: 'center', marginBottom: 20 },
  captureBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  captureBtnInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#FFFFFF' },
  scanningWrap: { alignItems: 'center', gap: 8 },
  scanningText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },

  permIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  permBtn: {
    backgroundColor: '#0A0A0A',
    borderRadius: BorderRadius.full,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },

  // Review
  billHeroCard: {
    backgroundColor: '#0A0A0A',
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  billHeroLabel: { fontSize: 10, fontWeight: '800', color: '#A3A3A3', letterSpacing: 0.8, marginBottom: 4 },
  merchantInput: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', paddingVertical: 2 },
  billTotalBadge: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: BorderRadius.md,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'flex-end',
  },
  billTotalBadgeLabel: { fontSize: 9, fontWeight: '800', color: '#A3A3A3', letterSpacing: 0.6 },
  billTotalBadgeAmount: { fontSize: 18, fontWeight: '900', color: '#FFFFFF' },

  modeTabs: {
    flexDirection: 'row',
    backgroundColor: Colors.backgroundMuted,
    borderRadius: BorderRadius.full,
    padding: 3,
    marginBottom: Spacing.md,
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: BorderRadius.full,
  },
  modeTabActive: { backgroundColor: '#0A0A0A' },
  modeTabText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  modeTabTextActive: { color: '#FFFFFF' },

  peopleSection: { marginBottom: Spacing.md },
  sectionHeading: { fontSize: 11, fontWeight: '800', color: Colors.textMuted, letterSpacing: 0.8, marginBottom: 8 },
  personChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.backgroundMuted,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  personChipText: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },

  equalSplitCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    gap: 12,
  },
  equalCardLabel: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  equalInputWrap: { flexDirection: 'row', alignItems: 'center' },
  equalCurrency: { fontSize: 32, fontWeight: '800', color: '#0A0A0A', marginRight: 4 },
  equalInput: { fontSize: 36, fontWeight: '900', color: '#0A0A0A', minWidth: 120, textAlign: 'center' },
  equalPerPerson: { fontSize: 14, color: Colors.textSecondary },

  itemsSection: { gap: 6 },
  itemsSectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  addItemBtn: { flexDirection: 'row', alignItems: 'center', padding: 4 },
  addItemBtnText: { fontSize: 13, fontWeight: '700', color: '#0A0A0A' },
  addDashedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 14,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    marginTop: 4,
  },
  addDashedBtnText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },

  // Summary
  summaryHeroCard: {
    backgroundColor: '#0A0A0A',
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryMerchant: { fontSize: 20, fontWeight: '800', color: '#FFFFFF' },
  summarySplitType: { fontSize: 12, color: '#A3A3A3', marginTop: 2 },
  summaryTotalLabel: { fontSize: 11, fontWeight: '700', color: '#A3A3A3' },
  summaryTotalAmount: { fontSize: 22, fontWeight: '900', color: '#FFFFFF' },

  personSummaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  personSummaryTop: { flexDirection: 'row', alignItems: 'center' },
  personAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.backgroundMuted,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  avatarText: { fontSize: 15, fontWeight: '800', color: '#0A0A0A' },
  personName: { fontSize: 15, fontWeight: '700', color: '#0A0A0A' },
  personUpi: { fontSize: 12, color: Colors.textMuted, marginTop: 1 },
  personShareAmt: { fontSize: 18, fontWeight: '800', color: '#0A0A0A' },
  personActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.backgroundMuted,
    borderRadius: BorderRadius.full,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionBtnDone: { backgroundColor: '#DCFCE7', borderColor: '#86EFAC' },
  actionBtnText: { fontSize: 11, fontWeight: '700', color: '#0A0A0A' },
});
