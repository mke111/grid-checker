const express = require('express');
const Database = require('better-sqlite3');
const multer = require('multer');
const XLSX = require('xlsx');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ── DB 初始化 ─────────────────────────────────────────────────────────────────
const db = new Database(path.join(__dirname, 'data.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT DEFAULT '',
    department TEXT DEFAULT '',
    position TEXT DEFAULT '',
    status TEXT DEFAULT 'on_duty',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS target_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    base_url TEXT NOT NULL,
    username TEXT NOT NULL,
    password TEXT NOT NULL,
    is_active INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS check_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query_date TEXT,
    time_from TEXT DEFAULT '',
    time_to TEXT DEFAULT '',
    result_json TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// 默认账号
if (db.prepare('SELECT COUNT(*) as c FROM target_accounts').get().c === 0) {
  db.prepare('INSERT INTO target_accounts (label,base_url,username,password,is_active) VALUES (?,?,?,?,1)')
    .run('默认账号', 'http://221.181.9.210:17027', '13289004537', 'WXBwxb369852@1');
}
// 默认设置
for (const [k, v] of [['check_start','08:00'],['check_end','20:00']]) {
  if (!db.prepare('SELECT value FROM settings WHERE key=?').get(k))
    db.prepare('INSERT INTO settings (key,value) VALUES (?,?)').run(k, v);
}

// ── 中间件 ───────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ dest: 'uploads/' });

// SPA fallback — serve index.html for everything except /api
app.get(/^(?!\/api).*$/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── 目标系统 helper ───────────────────────────────────────────────────────────
async function loginAndGetCookies(account) {
  const jar = {};
  const BASE_URL = account.base_url;
  try {
    const res1 = await fetch(`${BASE_URL}/tms/index`, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0' } });
    (res1.headers.raw()['set-cookie'] || []).forEach(c => {
      const [pair] = c.split(';');
      const [k, v] = pair.trim().split('=');
      if (k && v !== undefined) jar[k.trim()] = v.trim();
    });
    const loginUrl = res1.url.includes('/cas/login')
      ? res1.url
      : `${BASE_URL}/cas/login?service=${encodeURIComponent(BASE_URL + '/tms/index')}&dpAppCode=PROJECT.TMS`;
    const params = new URLSearchParams();
    params.append('username', account.username);
    params.append('password', account.password);
    const res2 = await fetch(loginUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': cookieStr(jar), 'User-Agent': 'Mozilla/5.0' },
      body: params.toString(), redirect: 'follow'
    });
    (res2.headers.raw()['set-cookie'] || []).forEach(c => {
      const [pair] = c.split(';');
      const [k, v] = pair.trim().split('=');
      if (k && v !== undefined) jar[k.trim()] = v.trim();
    });
    return { jar, baseUrl: BASE_URL, ok: Object.keys(jar).length > 0 };
  } catch(e) {
    return { jar: {}, baseUrl: BASE_URL, ok: false, error: e.message };
  }
}

function cookieStr(jar) { return Object.entries(jar).map(([k,v]) => `${k}=${v}`).join('; '); }

async function fetchReport(reportId, date, jar, baseUrl) {
  const url = `${baseUrl}/tms/moudle/report/${reportId}/pagingData?startDate=${date}&endDate=${date}&pageSize=1000&pageNum=1`;
  try {
    const res = await fetch(url, { headers: { Cookie: cookieStr(jar), 'User-Agent': 'Mozilla/5.0' } });
    const data = await res.json();
    if (data.code === 'success' && data.data && data.data.list) return data.data.list;
    return [];
  } catch { return []; }
}

// ── API: 账号管理 ─────────────────────────────────────────────────────────────
app.get('/api/accounts', (req, res) => {
  res.json(db.prepare('SELECT id,label,base_url,username,is_active,created_at FROM target_accounts ORDER BY id').all());
});

app.post('/api/accounts', (req, res) => {
  const { label, base_url, username, password } = req.body;
  if (!label || !base_url || !username || !password) return res.status(400).json({ error: '所有字段必填' });
  const r = db.prepare('INSERT INTO target_accounts (label,base_url,username,password,is_active) VALUES (?,?,?,?,0)').run(label, base_url, username, password);
  res.json({ id: r.lastInsertRowid, label, base_url, username, is_active: 0 });
});

app.put('/api/accounts/:id', (req, res) => {
  const { label, base_url, username, password } = req.body;
  const old = db.prepare('SELECT password FROM target_accounts WHERE id=?').get(req.params.id);
  if (!old) return res.status(404).json({ error: '不存在' });
  db.prepare('UPDATE target_accounts SET label=?,base_url=?,username=?,password=? WHERE id=?')
    .run(label, base_url, username, password || old.password, req.params.id);
  res.json({ ok: true });
});

app.post('/api/accounts/:id/activate', (req, res) => {
  db.prepare('UPDATE target_accounts SET is_active=0').run();
  db.prepare('UPDATE target_accounts SET is_active=1 WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

app.delete('/api/accounts/:id', (req, res) => {
  db.prepare('DELETE FROM target_accounts WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/accounts/:id/test', async (req, res) => {
  const account = db.prepare('SELECT * FROM target_accounts WHERE id=?').get(req.params.id);
  if (!account) return res.status(404).json({ error: '不存在' });
  const result = await loginAndGetCookies(account);
  res.json({ ok: result.ok, message: result.ok ? '登录成功 ✅' : ('登录失败: ' + (result.error || '未知错误')) });
});

// ── API: 人员管理 ─────────────────────────────────────────────────────────────
app.get('/api/staff', (req, res) => {
  const { q } = req.query;
  if (q) {
    res.json(db.prepare('SELECT * FROM staff WHERE name LIKE ? OR phone LIKE ? ORDER BY department,name').all(`%${q}%`, `%${q}%`));
  } else {
    res.json(db.prepare('SELECT * FROM staff ORDER BY department,name').all());
  }
});

app.post('/api/staff', (req, res) => {
  const { name, phone, department, position } = req.body;
  if (!name) return res.status(400).json({ error: '姓名必填' });
  const r = db.prepare('INSERT INTO staff (name,phone,department,position) VALUES (?,?,?,?)').run(name, phone||'', department||'', position||'');
  res.json({ id: r.lastInsertRowid, name, phone: phone||'', department: department||'', position: position||'', status: 'on_duty' });
});

app.put('/api/staff/:id', (req, res) => {
  const { name, phone, department, position, status } = req.body;
  if (status !== undefined) {
    db.prepare('UPDATE staff SET status=? WHERE id=?').run(status, req.params.id);
  } else {
    db.prepare('UPDATE staff SET name=?,phone=?,department=?,position=? WHERE id=?').run(name, phone||'', department||'', position||'', req.params.id);
  }
  res.json(db.prepare('SELECT * FROM staff WHERE id=?').get(req.params.id));
});

app.delete('/api/staff/:id', (req, res) => {
  db.prepare('DELETE FROM staff WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/staff/batch-status', (req, res) => {
  const { status } = req.body;
  if (!['on_duty','leave'].includes(status)) return res.status(400).json({ error: '无效状态' });
  db.prepare('UPDATE staff SET status=?').run(status);
  res.json({ ok: true });
});

app.post('/api/staff/import', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请上传文件' });
  try {
    const wb = XLSX.readFile(req.file.path);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws);
    let count = 0;
    const insert = db.prepare('INSERT INTO staff (name,phone,department,position) VALUES (?,?,?,?)');
    db.transaction(rows => {
      for (const row of rows) {
        const name = row['姓名'] || row['name'] || '';
        const phone = String(row['手机号'] || row['phone'] || '');
        const department = row['部门'] || row['department'] || '';
        const position = row['职务'] || row['position'] || '';
        if (name) { insert.run(name, phone, department, position); count++; }
      }
    })(rows);
    try { fs.unlinkSync(req.file.path); } catch {}
    res.json({ ok: true, count });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── API: 查询 / 历史 ──────────────────────────────────────────────────────────
app.post('/api/query', async (req, res) => {
  const { date } = req.body;
  const queryDate = date || new Date().toISOString().slice(0,10);
  const account = db.prepare('SELECT * FROM target_accounts WHERE is_active=1 LIMIT 1').get();
  if (!account) return res.status(400).json({ error: '请先配置并激活一个账号' });

  try {
    const { jar, baseUrl, ok, error } = await loginAndGetCookies(account);
    if (!ok) return res.status(503).json({ error: '登录失败: ' + (error || '未知') });

    const [checkRows, warnRows, overdueRows] = await Promise.all([
      fetchReport('164480169233200777', queryDate, jar, baseUrl),
      fetchReport('164811368582200179', queryDate, jar, baseUrl),
      fetchReport('164725306431302680', queryDate, jar, baseUrl),
    ]);

    const onDutyStaff = db.prepare("SELECT * FROM staff WHERE status='on_duty'").all();

    const filledNames  = new Set(checkRows.map(r => r.CREATE_USER || r.create_user || r.name || '').filter(Boolean));
    const filledPhones = new Set(checkRows.map(r => String(r.PHONE || r.phone || '')).filter(Boolean));
    const warnedNames  = new Set(warnRows.map(r => r.CREATE_USER || r.create_user || r.name || '').filter(Boolean));
    const warnedPhones = new Set(warnRows.map(r => String(r.PHONE || r.phone || '')).filter(Boolean));
    const overdueNames  = new Set(overdueRows.map(r => r.CREATE_USER || r.create_user || r.name || '').filter(Boolean));
    const overduePhones = new Set(overdueRows.map(r => String(r.PHONE || r.phone || '')).filter(Boolean));

    const result = onDutyStaff.map(s => {
      const phone = String(s.phone || '');
      const filled  = filledNames.has(s.name)  || (phone && filledPhones.has(phone));
      const warned  = warnedNames.has(s.name)  || (phone && warnedPhones.has(phone));
      const overdue = overdueNames.has(s.name) || (phone && overduePhones.has(phone));
      let tag = 'unfilled';
      if (overdue) tag = 'overdue';
      else if (warned) tag = 'warned';
      else if (filled) tag = 'filled';
      return { ...s, tag };
    });

    db.prepare('INSERT INTO check_results (query_date,time_from,time_to,result_json) VALUES (?,?,?,?)')
      .run(queryDate, '', '', JSON.stringify(result));

    res.json({
      date: queryDate, account: account.label,
      total: result.length,
      filled:   result.filter(r => r.tag === 'filled').length,
      unfilled: result.filter(r => r.tag === 'unfilled').length,
      warned:   result.filter(r => r.tag === 'warned').length,
      overdue:  result.filter(r => r.tag === 'overdue').length,
      list: result
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/history', (req, res) => {
  const { start, end } = req.query;
  let sql = 'SELECT id,query_date,time_from,time_to,result_json,created_at FROM check_results';
  const params = [];
  if (start && end) { sql += ' WHERE query_date BETWEEN ? AND ?'; params.push(start, end); }
  else if (start)   { sql += ' WHERE query_date >= ?'; params.push(start); }
  else if (end)     { sql += ' WHERE query_date <= ?'; params.push(end); }
  sql += ' ORDER BY id DESC LIMIT 100';
  res.json(db.prepare(sql).all(...params));
});

// ── API: 设置 ─────────────────────────────────────────────────────────────────
app.get('/api/settings', (req, res) => {
  const rows = db.prepare('SELECT * FROM settings').all();
  const s = {};
  rows.forEach(r => s[r.key] = r.value);
  res.json(s);
});

app.post('/api/settings', (req, res) => {
  for (const [key, value] of Object.entries(req.body)) {
    db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').run(key, String(value));
  }
  res.json({ ok: true });
});

// ── 启动 ──────────────────────────────────────────────────────────────────────
app.listen(PORT, () => console.log(`✅ Grid Checker running on port ${PORT}`));
