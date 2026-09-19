// SPENDY — Native Module Wrapper & Event Dispatcher
// Connects Kotlin NotificationListenerService & SmsReceiver to the JS Parse Engine

import { NativeModules, DeviceEventEmitter, Platform } from 'react-native';
import { parseBankMessage, parseNotification } from '../parsers/parseEngine';
import { useLedgerStore } from '../store/ledgerStore';

const { SpendyModule } = NativeModules;

export async function checkNotificationListenerPermission(): Promise<boolean> {
  if (Platform.OS !== 'android' || !SpendyModule?.isNotificationListenerEnabled) {
    return false;
  }
  try {
    return await SpendyModule.isNotificationListenerEnabled();
  } catch (e) {
    console.warn('Failed to check notification listener permission', e);
    return false;
  }
}

export async function openNotificationListenerSettings(): Promise<boolean> {
  if (Platform.OS !== 'android' || !SpendyModule?.openNotificationSettings) {
    return false;
  }
  try {
    return await SpendyModule.openNotificationSettings();
  } catch (e) {
    console.warn('Failed to open notification settings', e);
    return false;
  }
}

export async function openNativeUpiPayment(params: {
  upiId: string;
  name: string;
  amount: number;
  note?: string;
}): Promise<boolean> {
  const upiUrl = `upi://pay?pa=${encodeURIComponent(params.upiId)}&pn=${encodeURIComponent(params.name)}&am=${params.amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(params.note || 'Clearing Debt via SPENDY')}`;
  if (Platform.OS === 'android' && SpendyModule?.openUpiPayment) {
    try {
      const res = await SpendyModule.openUpiPayment(upiUrl);
      if (res) return true;
    } catch (e) {
      console.warn('Native SpendyModule.openUpiPayment failed, falling back:', e);
    }
  }
  return false;
}

export async function recognizeTextFromImage(imageUri: string): Promise<string> {
  if (Platform.OS === 'android' && SpendyModule?.recognizeTextFromImage) {
    try {
      return await SpendyModule.recognizeTextFromImage(imageUri);
    } catch (e) {
      console.warn('Native SpendyModule.recognizeTextFromImage failed:', e);
    }
  }
  return '';
}

export function setupNativeTransactionListeners() {
  // 1. Listen for raw notification from SpendyNotificationListener
  const notifSub = DeviceEventEmitter.addListener('onNotificationReceived', async (event: {
    packageName: string;
    title: string;
    text: string;
    timestamp: number;
  }) => {
    console.log('[SPENDY Native] Received Notification:', event);
    
    // First try parseNotification with package + title + text
    let parsed = parseNotification(
      event.packageName || '',
      event.title || '',
      event.text || '',
      event.timestamp || Date.now()
    );

    // Fallback: try bank message parser on combined string
    if (!parsed) {
      const combined = `${event.title || ''} ${event.text || ''}`.trim();
      parsed = parseBankMessage(
        event.packageName || 'NOTIFICATION',
        combined,
        'notification',
        event.timestamp || Date.now()
      );
    }

    if (parsed) {
      console.log('[SPENDY Native] Ingesting parsed notification transaction:', parsed);
      await useLedgerStore.getState().ingestTransaction({
        ...parsed,
        raw_source: 'notification',
      });
    }
  });

  // 2. Listen for raw SMS from SpendySmsReceiver
  const smsSub = DeviceEventEmitter.addListener('onSmsReceived', async (event: {
    sender: string;
    body: string;
    timestamp: number;
  }) => {
    console.log('[SPENDY Native] Received SMS:', event);
    const parsed = parseBankMessage(
      event.sender || 'BANK',
      event.body || '',
      'sms',
      event.timestamp || Date.now()
    );
    if (parsed) {
      console.log('[SPENDY Native] Ingesting parsed SMS transaction:', parsed);
      await useLedgerStore.getState().ingestTransaction({
        ...parsed,
        raw_source: 'sms',
      });
    }
  });

  // 3. Fallback direct onTransactionParsed listener
  const directSub = DeviceEventEmitter.addListener('onTransactionParsed', async (tx: any) => {
    console.log('[SPENDY Native] Direct Parsed Transaction:', tx);
    await useLedgerStore.getState().ingestTransaction(tx);
  });

  return () => {
    notifSub.remove();
    smsSub.remove();
    directSub.remove();
  };
}

