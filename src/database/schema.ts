// SPENDY — SQLite Schema
// Full schema from the implementation plan (Section 4)

import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

export function getDatabase(): SQLite.SQLiteDatabase {
  if (db) return db;
  db = SQLite.openDatabaseSync('spendy.db');
  return db;
}

export async function initializeDatabase(): Promise<void> {
  const database = await getDatabase();

  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      amount REAL NOT NULL,
      type TEXT CHECK(type IN ('debit','credit')) NOT NULL,
      merchant TEXT,
      raw_source TEXT CHECK(raw_source IN ('sms','notification','manual')) NOT NULL,
      category_id TEXT,
      timestamp INTEGER NOT NULL,
      matched_intent_id TEXT,
      status TEXT CHECK(status IN ('categorized','pending_reconciliation','ignored')) DEFAULT 'pending_reconciliation',
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT,
      is_envelope INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS envelopes (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL,
      target_amount REAL NOT NULL,
      locked_amount REAL DEFAULT 0,
      lock_on_payday INTEGER DEFAULT 0,
      payday_day_of_month INTEGER,
      FOREIGN KEY(category_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS debts (
      id TEXT PRIMARY KEY,
      person_name TEXT NOT NULL,
      upi_id TEXT,
      amount REAL NOT NULL,
      status TEXT CHECK(status IN ('open','settled')) DEFAULT 'open',
      note TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS upi_intents (
      id TEXT PRIMARY KEY,
      debt_id TEXT,
      amount REAL NOT NULL,
      upi_id TEXT NOT NULL,
      note TEXT,
      status TEXT CHECK(status IN ('initiated','confirmed','failed','abandoned')) DEFAULT 'initiated',
      created_at INTEGER DEFAULT (strftime('%s','now')),
      FOREIGN KEY(debt_id) REFERENCES debts(id)
    );

    CREATE TABLE IF NOT EXISTS bill_splits (
      id TEXT PRIMARY KEY,
      merchant TEXT,
      total_amount REAL,
      ocr_raw_text TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS bill_split_items (
      id TEXT PRIMARY KEY,
      bill_split_id TEXT NOT NULL,
      item_name TEXT,
      price REAL,
      assigned_to TEXT,
      FOREIGN KEY(bill_split_id) REFERENCES bill_splits(id)
    );

    CREATE TABLE IF NOT EXISTS bank_sender_whitelist (
      sender_id TEXT PRIMARY KEY,
      bank_name TEXT,
      template_key TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
    CREATE INDEX IF NOT EXISTS idx_debts_status ON debts(status);
  `);

  // Seed default categories
  await seedDefaultData(database);
}

async function seedDefaultData(database: SQLite.SQLiteDatabase): Promise<void> {
  const existingCategories = await database.getAllAsync('SELECT id FROM categories LIMIT 1');
  if (existingCategories.length > 0) return;

  const defaultCategories = [
    { id: 'cat_food', name: 'Food & Dining', icon: '🍔', is_envelope: 1 },
    { id: 'cat_transport', name: 'Transport', icon: '🚗', is_envelope: 1 },
    { id: 'cat_shopping', name: 'Shopping', icon: '🛍️', is_envelope: 1 },
    { id: 'cat_health', name: 'Health', icon: '❤️', is_envelope: 0 },
    { id: 'cat_entertainment', name: 'Entertainment', icon: '🎬', is_envelope: 1 },
    { id: 'cat_bills', name: 'Bills & Utilities', icon: '⚡', is_envelope: 1 },
    { id: 'cat_education', name: 'Education', icon: '📚', is_envelope: 0 },
    { id: 'cat_other', name: 'Other', icon: '📦', is_envelope: 0 },
  ];

  for (const cat of defaultCategories) {
    await database.runAsync(
      'INSERT OR IGNORE INTO categories (id, name, icon, is_envelope) VALUES (?, ?, ?, ?)',
      [cat.id, cat.name, cat.icon, cat.is_envelope]
    );
  }

  // Seed default bank senders
  const defaultSenders = [
    { sender_id: 'HDFCBK', bank_name: 'HDFC Bank', template_key: 'HDFCBK' },
    { sender_id: 'SBIINB', bank_name: 'State Bank of India', template_key: 'SBIINB' },
    { sender_id: 'ICICIB', bank_name: 'ICICI Bank', template_key: 'ICICIB' },
    { sender_id: 'AXISBK', bank_name: 'Axis Bank', template_key: 'AXISBK' },
    { sender_id: 'PAYTMB', bank_name: 'Paytm Bank', template_key: 'PAYTMB' },
    { sender_id: 'KOTKBK', bank_name: 'Kotak Bank', template_key: 'KOTKBK' },
    { sender_id: 'YESBNK', bank_name: 'Yes Bank', template_key: 'YESBNK' },
  ];

  for (const sender of defaultSenders) {
    await database.runAsync(
      'INSERT OR IGNORE INTO bank_sender_whitelist (sender_id, bank_name, template_key) VALUES (?, ?, ?)',
      [sender.sender_id, sender.bank_name, sender.template_key]
    );
  }
}
