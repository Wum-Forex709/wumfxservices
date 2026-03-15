// database/db.js - Knight Traders Database (sql.js version - no compilation needed)
const path = require('path');
const fs   = require('fs');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'knight_traders.db');
let db;
let SQL;

// sql.js wrapper that mimics better-sqlite3 API
class SqlJsDB {
  constructor(sqlJs, dbData) {
    this.SQL = sqlJs;
    this.db  = dbData ? new sqlJs.Database(dbData) : new sqlJs.Database();
    this._saveTimer = null;
  }

  _save() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      try {
        const data = this.db.export();
        const dir  = path.dirname(DB_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(DB_PATH, Buffer.from(data));
      } catch(e) { console.error('DB save error:', e.message); }
    }, 200);
  }

  pragma(str) {
    if (str.includes('table_info')) {
      const table = str.match(/table_info\((\w+)\)/)?.[1];
      if (!table) return [];
      try {
        const res = this.db.exec(`PRAGMA table_info(${table})`);
        if (!res.length) return [];
        return res[0].values.map(row => ({ name: row[1] }));
      } catch(e) { return []; }
    }
    try { this.db.run(`PRAGMA ${str}`); } catch(e) {}
    return this;
  }

  exec(sql) {
    this.db.run(sql);
    this._save();
    return this;
  }

  prepare(sql) {
    const self = this;
    return {
      run(...args) {
        try {
          self.db.run(sql, args.map(a => a === undefined ? null : a));
          self._save();
          // Get last insert rowid
          const res = self.db.exec('SELECT last_insert_rowid() as id');
          const lastInsertRowid = res.length ? res[0].values[0][0] : 0;
          return { changes: 1, lastInsertRowid };
        } catch(e) {
          console.error('DB run error:', e.message, sql);
          throw e;
        }
      },
      get(...args) {
        try {
          const res = self.db.exec(sql, args.map(a => a === undefined ? null : a));
          if (!res.length || !res[0].values.length) return undefined;
          const cols = res[0].columns;
          const row  = res[0].values[0];
          const obj  = {};
          cols.forEach((c, i) => obj[c] = row[i]);
          return obj;
        } catch(e) {
          console.error('DB get error:', e.message);
          return undefined;
        }
      },
      all(...args) {
        try {
          const res = self.db.exec(sql, args.map(a => a === undefined ? null : a));
          if (!res.length) return [];
          const cols = res[0].columns;
          return res[0].values.map(row => {
            const obj = {};
            cols.forEach((c, i) => obj[c] = row[i]);
            return obj;
          });
        } catch(e) {
          console.error('DB all error:', e.message);
          return [];
        }
      }
    };
  }
}

async function initDB() {
  if (db) return db;
  const initSqlJs = require('sql.js');
  SQL = await initSqlJs();

  let dbData = null;
  const dir  = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(DB_PATH)) {
    dbData = fs.readFileSync(DB_PATH);
  }

  db = new SqlJsDB(SQL, dbData);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initTables();
  return db;
}

function getDB() {
  if (!db) throw new Error('DB not initialized. Call initDB() first in server.js');
  return db;
}

function initTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      status TEXT DEFAULT 'pending',
      ea_status TEXT DEFAULT 'inactive',
      referred_by TEXT DEFAULT NULL,
      referral_code TEXT UNIQUE,
      referral_earnings REAL DEFAULT 0,
      agreement_signed INTEGER DEFAULT 0,
      agreement_signed_at TEXT DEFAULT NULL,
      kyc_status TEXT DEFAULT 'not_submitted',
      nic_front TEXT DEFAULT NULL,
      nic_back TEXT DEFAULT NULL,
      kyc_submitted_at TEXT DEFAULT NULL,
      kyc_verified_at TEXT DEFAULT NULL,
      kyc_note TEXT DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS referrals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      referrer_id INTEGER NOT NULL,
      referrer_member_id TEXT NOT NULL,
      referred_id INTEGER NOT NULL,
      referred_member_id TEXT NOT NULL,
      referred_name TEXT NOT NULL,
      referred_email TEXT NOT NULL,
      rebate_amount REAL DEFAULT 20,
      rebate_status TEXT DEFAULT 'pending',
      joined_at TEXT DEFAULT (datetime('now')),
      paid_at TEXT
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      member_id TEXT NOT NULL,
      plan TEXT DEFAULT 'monthly',
      plan_label TEXT DEFAULT '1 Month',
      amount REAL DEFAULT 50,
      currency TEXT DEFAULT 'USDT',
      screenshot_path TEXT,
      screenshot_name TEXT,
      status TEXT DEFAULT 'pending',
      admin_note TEXT,
      submitted_at TEXT DEFAULT (datetime('now')),
      verified_at TEXT
    );

    CREATE TABLE IF NOT EXISTS broker_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      member_id TEXT NOT NULL,
      broker_name TEXT,
      account_login TEXT,
      account_password TEXT,
      server_name TEXT,
      account_type TEXT,
      status TEXT DEFAULT 'submitted',
      submitted_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS withdrawal_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      member_id TEXT NOT NULL,
      full_name TEXT NOT NULL,
      amount REAL NOT NULL,
      wallet_address TEXT,
      status TEXT DEFAULT 'pending',
      admin_note TEXT,
      requested_at TEXT DEFAULT (datetime('now')),
      processed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      type TEXT DEFAULT 'info',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  const set = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
  set.run('monthly_fee',    '50');
  set.run('quarterly_fee',  '120');
  set.run('sixmonth_fee',   '250');
  set.run('yearly_fee',     '500');
  set.run('referral_rebate','20');
  set.run('usdt_address',   'TN4jmznmETPrLxQVUqUfAmhRw84bUmY2Ky');
  set.run('binance_id',     '424589758');
  set.run('referral_link',  'https://one.exnesstrack.net/boarding/sign-up/a/43kq9z9ia6');
  set.run('account_title',  'Wumfx_Services');
  set.run('discord_invite', 'https://discord.gg/GgqRcUaGV');
  set.run('telegram_id',    'Signals_provider709');

  const adminExists = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
  if (!adminExists) {
    const hash = bcrypt.hashSync('Admin@Knight2025', 10);
    db.prepare(`
      INSERT INTO users (member_id, full_name, email, phone, password, role, status, ea_status, referral_code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('KT-ADMIN', 'Admin Knight', 'admin@knighttraders.com', '', hash, 'admin', 'active', 'active', 'KT-ADMIN');
    console.log('✅ Admin created: admin@knighttraders.com / Admin@Knight2025');
  }

  // Migrations
  try {
    const cols = db.pragma('table_info(users)').map(c => c.name);
    if (!cols.includes('agreement_signed'))    db.exec(`ALTER TABLE users ADD COLUMN agreement_signed INTEGER DEFAULT 0`);
    if (!cols.includes('agreement_signed_at')) db.exec(`ALTER TABLE users ADD COLUMN agreement_signed_at TEXT DEFAULT NULL`);
    if (!cols.includes('kyc_status'))          db.exec(`ALTER TABLE users ADD COLUMN kyc_status TEXT DEFAULT 'not_submitted'`);
    if (!cols.includes('nic_front'))           db.exec(`ALTER TABLE users ADD COLUMN nic_front TEXT DEFAULT NULL`);
    if (!cols.includes('nic_back'))            db.exec(`ALTER TABLE users ADD COLUMN nic_back TEXT DEFAULT NULL`);
    if (!cols.includes('kyc_submitted_at'))    db.exec(`ALTER TABLE users ADD COLUMN kyc_submitted_at TEXT DEFAULT NULL`);
    if (!cols.includes('kyc_verified_at'))     db.exec(`ALTER TABLE users ADD COLUMN kyc_verified_at TEXT DEFAULT NULL`);
    if (!cols.includes('kyc_note'))            db.exec(`ALTER TABLE users ADD COLUMN kyc_note TEXT DEFAULT NULL`);
    if (!cols.includes('mt5_account_id'))      db.exec(`ALTER TABLE users ADD COLUMN mt5_account_id TEXT DEFAULT NULL`);
    if (!cols.includes('plain_password'))      db.exec(`ALTER TABLE users ADD COLUMN plain_password TEXT DEFAULT NULL`);
  } catch(e) {}

  console.log('✅ Database initialized');
}

function saveDB() {
  return new Promise((resolve) => {
    if (!db) return resolve();
    try {
      const data = db.db.export();
      const dir  = require('path').dirname(DB_PATH);
      if (!require('fs').existsSync(dir)) require('fs').mkdirSync(dir, { recursive: true });
      require('fs').writeFileSync(DB_PATH, Buffer.from(data));
      resolve();
    } catch(e) {
      console.error('saveDB error:', e.message);
      resolve();
    }
  });
}

module.exports = { getDB, initDB, saveDB };
