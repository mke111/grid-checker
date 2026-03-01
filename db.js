const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'data.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    department TEXT,
    position TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS daily_status (
    date TEXT NOT NULL,
    staff_id INTEGER NOT NULL,
    status TEXT DEFAULT 'oncall',
    PRIMARY KEY(date, staff_id)
  );

  -- 目标系统账号管理
  CREATE TABLE IF NOT EXISTS target_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    base_url TEXT NOT NULL,
    username TEXT NOT NULL,
    password TEXT NOT NULL,
    is_active INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  -- 网格化检查记录
  CREATE TABLE IF NOT EXISTS check_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    record_id TEXT,
    date TEXT,
    fixed_type TEXT,
    dept_name TEXT,
    job_name TEXT,
    create_user TEXT,
    phone TEXT,
    shift TEXT,
    state TEXT,
    check_result TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS notify_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    total INTEGER,
    oncall INTEGER,
    filled INTEGER,
    unfilled INTEGER,
    overdue INTEGER,
    message TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );
`);

// 默认配置
const defaults = {
  check_start: '08:00',
  check_end: '20:00',
  notify_time: '20:00',
  notify_webhook: '',
  target_url: 'http://221.181.9.210:17027'
};

// 默认目标账号
const accCount = db.prepare('SELECT COUNT(*) as c FROM target_accounts').get();
if (accCount.c === 0) {
  db.prepare(`INSERT INTO target_accounts (label, base_url, username, password, is_active) VALUES (?,?,?,?,1)`)
    .run('默认账号', 'http://221.181.9.210:17027', '13289004537', 'WXBwxb369852@1');
}

for (const [key, value] of Object.entries(defaults)) {
  const existing = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!existing) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, value);
  }
}

module.exports = db;
