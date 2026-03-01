const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'data.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS daily_status (
    date TEXT NOT NULL,
    staff_id INTEGER NOT NULL,
    status TEXT DEFAULT 'oncall',
    PRIMARY KEY(date, staff_id)
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    username TEXT NOT NULL,
    password TEXT NOT NULL,
    is_active INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
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

for (const [key, value] of Object.entries(defaults)) {
  const existing = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!existing) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, value);
  }
}

module.exports = db;
