// SPENDY — UPI Deep Link Utility (Section 8)

import { Linking } from 'react-native';

export interface UpiPaymentParams {
  upiId: string;
  name: string;
  amount: number;
  note?: string;
}

export function buildUpiUrl({ upiId, name, amount, note }: UpiPaymentParams): string {
  const params = new URLSearchParams({
    pa: upiId,
    pn: name,
    am: amount.toFixed(2),
    cu: 'INR',
    tn: note ?? 'Clearing Debt via SPENDY',
  });
  return `upi://pay?${params.toString()}`;
}

export async function openUpiPayment(params: UpiPaymentParams): Promise<boolean> {
  // 1. Try native chooser via SpendyNative
  try {
    const { openNativeUpiPayment } = require('../native/SpendyNative');
    const nativeSuccess = await openNativeUpiPayment(params);
    if (nativeSuccess) return true;
  } catch (e) {
    // continue to Linking
  }

  // 2. Direct Linking fallback
  const url = buildUpiUrl(params);
  try {
    await Linking.openURL(url);
    return true;
  } catch (e) {
    console.warn('Linking.openURL failed for UPI:', e);
    return false;
  }
}

// Format currency for display
export function formatCurrency(amount: number): string {
  if (amount >= 100000) {
    return `₹${(amount / 100000).toFixed(1)}L`;
  }
  if (amount >= 1000) {
    return `₹${(amount / 1000).toFixed(1)}K`;
  }
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function formatCurrencyFull(amount: number): string {
  return `₹${Math.abs(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(timestamp: number): string {
  // Normalize seconds vs milliseconds
  const ms = timestamp < 10000000000 ? timestamp * 1000 : timestamp;
  const d = new Date(ms);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const txDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (txDate.getTime() === today.getTime()) {
    return `Today, ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
  }
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (txDate.getTime() === yesterday.getTime()) {
    return `Yesterday, ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
  }
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
}

