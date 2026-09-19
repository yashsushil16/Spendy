// SPENDY — Bank SMS/Notification Parsing Engine
// Section 6 of the implementation plan: per-bank templates + generic fallback + dedup

export type ParsedTransaction = {
  amount: number;
  type: 'debit' | 'credit';
  merchant: string | null;
  timestamp: number;
  raw_source: 'sms' | 'notification';
  bankKey: string | null;
};

// ─── Per-Bank Templates (Section 6a) ─────────────────────────────────────────
// Built from real SMS patterns. Add more as you collect samples.

interface BankTemplate {
  regex: RegExp;
  fields: Array<'amount' | 'type' | 'date' | 'merchant'>;
  typeMap?: { debit: string[]; credit: string[] };
}

const bankTemplates: Record<string, BankTemplate> = {
  HDFCBK: {
    regex: /Rs\.?\s?([\d,]+\.?\d*)\s?(debited|credited).*?(?:A\/c|Ac)\s?[X\d]+\s?on\s?(\d{2}-\w{3}-\d{2})(?:\s?at\s?(\w[\w\s]*))?/i,
    fields: ['amount', 'type', 'date', 'merchant'],
    typeMap: { debit: ['debited'], credit: ['credited'] },
  },
  SBIINB: {
    regex: /Rs\.?([\d,]+\.?\d*)\s?(debited|credited).*?A\/c\s?[X\d]+\s?on\s?(\d{2}\w{3}\d{2})(?:.*?to\s+([\w\s]+))?/i,
    fields: ['amount', 'type', 'date', 'merchant'],
    typeMap: { debit: ['debited'], credit: ['credited'] },
  },
  ICICIB: {
    regex: /INR\s?([\d,]+\.?\d*)\s?(?:has been\s?)?(debited|credited).*?on\s?(\d{2}-\d{2}-\d{4})(?:.*?(?:to|from)\s+([\w\s@]+))?/i,
    fields: ['amount', 'type', 'date', 'merchant'],
    typeMap: { debit: ['debited'], credit: ['credited'] },
  },
  AXISBK: {
    regex: /(?:INR|Rs\.?)\s?([\d,]+\.?\d*)\s?(?:is\s?)?(?:debited|withdrawn|spent|paid|credited|received).*?(?:Acct|A\/C)\s?[X\d]+/i,
    fields: ['amount', 'type', 'date', 'merchant'],
    typeMap: { debit: ['debited', 'withdrawn', 'spent', 'paid'], credit: ['credited', 'received'] },
  },
  KOTKBK: {
    regex: /Rs\s?([\d,]+\.?\d*)\s?(debited|credited)\s?(?:from|to)\s?.*?[Aa]\/[Cc]\s?[X\d]+/i,
    fields: ['amount', 'type', 'date', 'merchant'],
    typeMap: { debit: ['debited'], credit: ['credited'] },
  },
};

// ─── Generic Fallback (Section 6b) ───────────────────────────────────────────
// Never fail silently — always extract at least amount + type

const genericFallback = /(?:Rs\.?|INR)\s?([\d,]+\.?\d*)\s?.*?\b(debited|credited|spent|sent|received|paid)\b/i;
const genericTypeCredit = [
  'credited', 'credit', 'received', 'deposited', 'deposit', 'refund', 'refunded',
  'cashback', 'added to', 'credited to', 'received from', 'inward', 'cr',
];
const genericTypeDebit = [
  'debited', 'debit', 'spent', 'sent', 'paid', 'withdrawn', 'withdrawal',
  'purchase', 'charged', 'transfer to', 'transferred to', 'dr', 'outward',
];

// ─── Amount Normalizer (Section 11) ──────────────────────────────────────────
// Handles: 1500.00, 1,500, 1.5k, 1,500.00

function normalizeAmount(raw: string): number {
  let s = raw.trim().replace(/,/g, '');
  if (/k$/i.test(s)) {
    s = (parseFloat(s) * 1000).toString();
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

export function resolveType(matched: string, typeMap?: BankTemplate['typeMap']): 'debit' | 'credit' {
  const lower = matched.toLowerCase();
  
  // Explicit credit checks first
  if (typeMap?.credit?.some(k => lower.includes(k))) return 'credit';
  if (typeMap?.debit?.some(k => lower.includes(k))) return 'debit';

  if (genericTypeCredit.some(k => lower.includes(k))) return 'credit';
  if (genericTypeDebit.some(k => lower.includes(k))) return 'debit';

  return 'debit'; // default to debit (safer assumption)
}


// ─── Main Parser ─────────────────────────────────────────────────────────────

export function parseBankMessage(
  sender: string,
  body: string,
  source: 'sms' | 'notification',
  timestampMs: number = Date.now()
): ParsedTransaction | null {
  const normalizedSender = sender.trim().toUpperCase();

  // Try per-bank template
  const template = bankTemplates[normalizedSender];
  if (template) {
    const match = template.regex.exec(body);
    if (match) {
      const amount = normalizeAmount(match[1] ?? '0');
      if (amount <= 0) return null;

      // Determine type from the matched keyword in the message
      const typeKeyword = match[2] ?? '';
      const type = resolveType(typeKeyword, template.typeMap);
      const merchant = match[4] ? match[4].trim().substring(0, 100) : null;

      return {
        amount,
        type,
        merchant,
        timestamp: Math.floor(timestampMs / 1000),
        raw_source: source,
        bankKey: normalizedSender,
      };
    }
  }

  // Generic fallback
  const fallbackMatch = genericFallback.exec(body);
  if (fallbackMatch) {
    const amount = normalizeAmount(fallbackMatch[1] ?? '0');
    if (amount <= 0) return null;
    const typeKeyword = fallbackMatch[2] ?? '';
    const type = resolveType(typeKeyword);

    return {
      amount,
      type,
      merchant: null,
      timestamp: Math.floor(timestampMs / 1000),
      raw_source: source,
      bankKey: null, // flagged as generic — will go to pending_reconciliation
    };
  }

  return null; // Not a financial SMS
}

// ─── Notification Parser (Section 5b) ────────────────────────────────────────
// GPay / PhonePe / Paytm push notifications have cleaner text

export const TRACKED_PACKAGES = [
  'com.google.android.apps.nbu.paisa.user', // GPay
  'com.phonepe.app',                         // PhonePe
  'net.one97.paytm',                         // Paytm
  'in.amazon.mShop.android.shopping',        // Amazon Pay
  'com.freecharge.android',                  // Freecharge
  'com.mobikwik_new',                        // MobiKwik
];

export function parseNotification(
  packageName: string,
  title: string,
  text: string,
  timestampMs: number
): ParsedTransaction | null {
  const combined = `${title} ${text}`.trim();
  if (!combined) return null;

  // GPay specific patterns
  if (packageName === 'com.google.android.apps.nbu.paisa.user' || /gpay|google pay/i.test(packageName)) {
    const sent = /(?:sent|paid|transferred)\s+(?:₹|Rs\.?|INR)?\s*([\d,]+\.?\d*)\s+to\s+([\w\s]+)/i.exec(combined);
    if (sent) {
      return {
        amount: normalizeAmount(sent[1]),
        type: 'debit',
        merchant: sent[2]?.trim().substring(0, 50) ?? null,
        timestamp: Math.floor(timestampMs / 1000),
        raw_source: 'notification',
        bankKey: 'GPAY',
      };
    }
    const received = /(?:received|credited)\s+(?:₹|Rs\.?|INR)?\s*([\d,]+\.?\d*)\s+from\s+([\w\s]+)/i.exec(combined);
    if (received) {
      return {
        amount: normalizeAmount(received[1]),
        type: 'credit',
        merchant: received[2]?.trim().substring(0, 50) ?? null,
        timestamp: Math.floor(timestampMs / 1000),
        raw_source: 'notification',
        bankKey: 'GPAY',
      };
    }
  }

  // PhonePe specific
  if (packageName === 'com.phonepe.app' || /phonepe/i.test(packageName)) {
    const sent = /(?:paid|sent|debited)\s+(?:₹|Rs\.?|INR)?\s*([\d,]+\.?\d*)\s*(?:to\s+([\w\s]+))?/i.exec(combined);
    if (sent) {
      return {
        amount: normalizeAmount(sent[1]),
        type: 'debit',
        merchant: sent[2]?.trim().substring(0, 50) ?? null,
        timestamp: Math.floor(timestampMs / 1000),
        raw_source: 'notification',
        bankKey: 'PHONEPE',
      };
    }
    const received = /(?:received|credited)\s+(?:₹|Rs\.?|INR)?\s*([\d,]+\.?\d*)\s*(?:from\s+([\w\s]+))?/i.exec(combined);
    if (received) {
      return {
        amount: normalizeAmount(received[1]),
        type: 'credit',
        merchant: received[2]?.trim().substring(0, 50) ?? null,
        timestamp: Math.floor(timestampMs / 1000),
        raw_source: 'notification',
        bankKey: 'PHONEPE',
      };
    }
    const match = /(?:₹|Rs\.?|INR)\s*([\d,]+\.?\d*)\s+(sent|received|paid|debited|credited)/i.exec(combined);
    if (match) {
      return {
        amount: normalizeAmount(match[1]),
        type: resolveType(match[2] ?? ''),
        merchant: null,
        timestamp: Math.floor(timestampMs / 1000),
        raw_source: 'notification',
        bankKey: 'PHONEPE',
      };
    }
  }

  // Paytm specific
  if (packageName === 'net.one97.paytm' || /paytm/i.test(packageName)) {
    const match = /(?:paid|sent|received|debited|credited)\s+(?:₹|Rs\.?|INR)?\s*([\d,]+\.?\d*)\s*(?:to|from)?\s*([\w\s]+)?/i.exec(combined);
    if (match) {
      const isCredit = /received|credited/i.test(combined);
      return {
        amount: normalizeAmount(match[1]),
        type: isCredit ? 'credit' : 'debit',
        merchant: match[2]?.trim().substring(0, 50) ?? null,
        timestamp: Math.floor(timestampMs / 1000),
        raw_source: 'notification',
        bankKey: 'PAYTM',
      };
    }
  }

  // Generic UPI & Bank Notification Pattern 1: (paid|sent|debited|received|credited) Rs 500 to Merchant
  const actionFirst = /\b(paid|sent|debited|spent|transferred|received|credited)\b\s+(?:₹|Rs\.?|INR)?\s*([\d,]+\.?\d*)\s*(?:to|at|for|from)?\s*([\w\s]+)?/i.exec(combined);
  if (actionFirst) {
    const type = resolveType(actionFirst[1]);
    const amount = normalizeAmount(actionFirst[2]);
    if (amount > 0) {
      return {
        amount,
        type,
        merchant: actionFirst[3]?.trim().substring(0, 50) ?? null,
        timestamp: Math.floor(timestampMs / 1000),
        raw_source: 'notification',
        bankKey: packageName.split('.').pop()?.toUpperCase() || 'UPI',
      };
    }
  }

  // Generic UPI & Bank Notification Pattern 2: ₹500 paid/sent/debited/received
  const amountFirst = /(?:₹|Rs\.?|INR)\s*([\d,]+\.?\d*)\s*(?:has been\s+)?(paid|sent|debited|credited|transferred|received|withdrawn|spent)?(?:\s+(?:to|at|for|from)\s+([\w\s]+))?/i.exec(combined);
  if (amountFirst) {
    const amount = normalizeAmount(amountFirst[1]);
    if (amount > 0) {
      const typeKeyword = amountFirst[2] || (/\b(received|credited|refunded)\b/i.test(combined) ? 'credit' : 'debit');
      return {
        amount,
        type: resolveType(typeKeyword),
        merchant: amountFirst[3]?.trim().substring(0, 50) ?? null,
        timestamp: Math.floor(timestampMs / 1000),
        raw_source: 'notification',
        bankKey: packageName.split('.').pop()?.toUpperCase() || 'UPI',
      };
    }
  }

  // Generic any currency sign + number if it contains bank/transaction keywords
  if (/\b(debited|credited|spent|transferred|account|a\/c|vpa|upi|inr|bal)\b/i.test(combined)) {
    const genericAmt = /(?:₹|Rs\.?|INR)?\s*([\d,]+\.\d{2}|[\d,]{2,})/i.exec(combined);
    if (genericAmt) {
      const amount = normalizeAmount(genericAmt[1]);
      if (amount > 0) {
        const isCredit = /\b(received|credited|refund|deposited)\b/i.test(combined);
        return {
          amount,
          type: isCredit ? 'credit' : 'debit',
          merchant: null,
          timestamp: Math.floor(timestampMs / 1000),
          raw_source: 'notification',
          bankKey: null,
        };
      }
    }
  }

  return null;
}


// ─── Balance Extractor ───────────────────────────────────────────────────────

export function extractBalance(body: string): number | null {
  // Patterns like: "Avl Bal: Rs.12,345.67" / "Available Balance: INR 10,000"
  const patterns = [
    /[Aa]vl\.?\s*[Bb]al\.?\s*(?:Rs\.?|INR|:)?\s*([₹]?[\d,]+\.?\d*)/,
    /[Aa]vailable\s+[Bb]alance\s*(?:Rs\.?|INR|:)?\s*([₹]?[\d,]+\.?\d*)/,
    /[Bb]alance\s*(?:Rs\.?|INR|:)?\s*([₹]?[\d,]+\.?\d*)/,
  ];
  for (const p of patterns) {
    const m = p.exec(body);
    if (m) {
      const n = normalizeAmount(m[1].replace('₹', ''));
      if (n > 0) return n;
    }
  }
  return null;
}

// ─── OCR Item Parser (Section 9) ─────────────────────────────────────────────

export interface OcrLineItem {
  name: string;
  price: number | null;
}

export interface ParsedBill {
  items: OcrLineItem[];
  detectedTotal: number | null;
  merchantName: string | null;
}

export function parseOcrText(rawText: string): ParsedBill {
  if (!rawText || !rawText.trim()) {
    return { items: [], detectedTotal: null, merchantName: null };
  }

  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const items: OcrLineItem[] = [];
  let detectedTotal: number | null = null;
  let merchantName: string | null = null;

  // Potential merchant name: first line that doesn't look like an address or invoice ID
  for (let i = 0; i < Math.min(lines.length, 4); i++) {
    const line = lines[i];
    if (
      line.length > 2 &&
      !/^(invoice|bill|receipt|gstin|gst|date|time|tel|ph|tax|order|table)/i.test(line) &&
      !/\d{10}/.test(line) &&
      !/^[\d\s\-\/\:\.\,]+$/.test(line)
    ) {
      merchantName = line.replace(/[^a-zA-Z0-9\s\&\.\-]/g, '').trim();
      break;
    }
  }

  // Regex for total amount
  const totalRegexes = [
    /(?:grand\s+total|net\s+payable|total\s+payable|bill\s+total|final\s+amount|net\s+amount|amount\s+payable|total\s+amount|total\s+due|total)\s*[:\-\=]?\s*(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
    /(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)\s*(?:total|grand\s+total|paid)/i,
  ];

  // Regex for line items with prices
  // Matches: "1 Burger 120", "Coffee ₹150.00", "Pizza ... 450", "2x Coke 80.00"
  const itemWithPriceRegex = /^(\d+\s*[xX\-\.]\s*)?(.+?)\s+(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d{1,2})?)$/i;

  for (const line of lines) {
    // 1. Check for Total line
    let isTotalLine = false;
    for (const tRegex of totalRegexes) {
      const match = tRegex.exec(line);
      if (match) {
        const amt = normalizeAmount(match[1]);
        if (amt > 0) {
          detectedTotal = amt;
          isTotalLine = true;
          break;
        }
      }
    }
    if (isTotalLine) continue;

    // Skip noisy non-item lines
    if (/^(subtotal|tax|gst|cgst|sgst|vat|service charge|discount|round off|change|cash|card|upi|visa|mastercard|thank you|visit again|fssai|gstin|cin|tel|phone|ph|table|waiter|date|time|token|order no|bill no|invoice no)/i.test(line)) {
      continue;
    }
    if (/^[\=\-\*\_]{3,}$/.test(line)) continue; // Separator lines like ===== or ------
    if (/^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/.test(line)) continue; // Pure dates

    // 2. Try match line item with price
    const itemMatch = itemWithPriceRegex.exec(line);
    if (itemMatch) {
      const prefix = itemMatch[1] ? itemMatch[1].trim() + ' ' : '';
      const name = (prefix + itemMatch[2]).replace(/[\.\:\-\t]+$/, '').trim();
      const price = normalizeAmount(itemMatch[3]);

      if (name.length >= 2 && price > 0 && price < 100000) {
        items.push({ name, price });
      }
    } else if (line.length > 2 && line.length < 40 && !/^[\d\s\W]+$/.test(line)) {
      // Line with text but no obvious price
      items.push({ name: line, price: null });
    }
  }

  // If detectedTotal wasn't found in a Total line, but we have items, sum them
  if (!detectedTotal && items.length > 0) {
    const sum = items.reduce((acc, it) => acc + (it.price ?? 0), 0);
    if (sum > 0) detectedTotal = sum;
  }

  return { items, detectedTotal, merchantName };
}
