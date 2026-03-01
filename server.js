const express = require('express');
const Database = require('better-sqlite3');
const multer = require('multer');
const XLSX = require('xlsx');
const fetch = require('node-fetch');
const dayjs = require('dayjs');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// DB初始化
const db = new Database('./data.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    department TEXT,
    position TEXT,
    status TEXT DEFAULT 'on_duty',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS check_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query_date TEXT,
    time_from TEXT,
    time_to TEXT,
    result_json TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS sys_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    base_url TEXT NOT NULL,
    username TEXT NOT NULL,
    password TEXT NOT NULL,
    is_active INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );
`);

// 默认账号（如果没有任何账号，插入默认）
const accCount = db.prepare('SELECT COUNT(*) as c FROM sys_accounts').get();
if (accCount.c === 0) {
  db.prepare(`INSERT INTO sys_accounts (label, base_url, username, password, is_active) VALUES (?,?,?,?,1)`)
    .run('默认账号', 'http://221.181.9.210:17027', '13289004537', 'WXBwxb369852@1');
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const upload = multer({ dest: 'uploads/' });

// ========== 获取当前激活账号 ==========
function getActiveAccount() {
  return db.prepare(`SELECT * FROM sys_accounts WHERE is_active=1 LIMIT 1`).get();
}

// ========== 系统登录抓数据 ==========
async function loginAndGetCookies(account) {
  const jar = {};
  const BASE_URL = account.base_url;

  const res1 = await fetch(`${BASE_URL}/tms/index`, { redirect: 'follow' });
  const cookies1 = res1.headers.raw()['set-cookie'] || [];
  cookies1.forEach(c => {
    const [pair] = c.split(';');
    const [k, v] = pair.trim().split('=');
    if (k && v !== undefined) jar[k.trim()] = v.trim();
  });

  const loginUrl = res1.url.includes('/cas/login') ? res1.url : `${BASE_URL}/cas/login?service=${encodeURIComponent(BASE_URL + '/tms/index')}&dpAppCode=PROJECT.TMS`;

  const params = new URLSearchParams();
  params.append('username', account.username);
  params.append('password', account.password);

  const res2 = await fetch(loginUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': Object.entries(jar).map(([k,v]) => `${k}=${v}`).join('; ')
    },
    body: params.toString(),
    redirect: 'follow'
  });
  const cookies2 = res2.headers.raw()['set-cookie'] || [];
  cookies2.forEach(c => {
    const [pair] = c.split(';');
    const [k, v] = pair.trim().split('=');
    if (k && v !== undefined) jar[k.trim()] = v.trim();
  });
  return { jar, baseUrl: BASE_URL };
}

async function fetchRecords(path, date, jar, baseUrl) {
  const url = `${baseUrl}${path}?startDate=${date}&endDate=${date}&pageSize=1000&pageNum=1`;
  try {
    const res = await fetch(url, {
      headers: { 'Cookie': Object.entries(jar).map(([k,v]) => `${k}=${v}`).join('; ') }
    });
    const text = await res.text();
    try { return JSON.parse(text); } catch { return { rows: [], total: 0, _raw: text.slice(0, 500) }; }
  } catch(e) {
    return { rows: [], total: 0, error: e.message };
  }
}

// ========== 账号管理 API ==========

app.get('/api/accounts', (req, res) => {
  const rows = db.prepare(`SELECT id, label, base_url, username, is_active, created_at FROM sys_accounts ORDER BY id`).all();
  res.json(rows);
});

app.post('/api/accounts', (req, res) => {
  const { label, base_url, username, password } = req.body;
  if (!label || !base_url || !username || !password) return res.status(400).json({ error: '所有字段必填' });
  const r = db.prepare(`INSERT INTO sys_accounts (label, base_url, username, password, is_active) VALUES (?,?,?,?,0)`).run(label, base_url, username, password);
  res.json({ id: r.lastInsertRowid, label, base_url, username, is_active: 0 });
});

app.patch('/api/accounts/:id', (req, res) => {
  const { id } = req.params;
  const { label, base_url, username, password } = req.body;
  if (label !== undefined) {
    db.prepare(`UPDATE sys_accounts SET label=?, base_url=?, username=?, password=? WHERE id=?`)
      .run(label, base_url, username, password || db.prepare('SELECT password FROM sys_accounts WHERE id=?').get(id).password, id);
  }
  res.json({ ok: true });
});

app.post('/api/accounts/:id/activate', (req, res) => {
  const { id } = req.params;
  db.prepare(`UPDATE sys_accounts SET is_active=0`).run();
  db.prepare(`UPDATE sys_accounts SET is_active=1 WHERE id=?`).run(id);
  const row = db.prepare(`SELECT id, label, base_url, username, is_active FROM sys_accounts WHERE id=?`).get(id);
  res.json(row);
});

app.delete('/api/accounts/:id', (req, res) => {
  db.prepare(`DELETE FROM sys_accounts WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});

// 测试账号连通性
app.post('/api/accounts/:id/test', async (req, res) => {
  const account = db.prepare(`SELECT * FROM sys_accounts WHERE id=?`).get(req.params.id);
  if (!account) return res.status(404).json({ error: '账号不存在' });
  try {
    const { jar, baseUrl } = await loginAndGetCookies(account);
    const hasCookie = Object.keys(jar).length > 0;
    res.json({ ok: hasCookie, cookies: Object.keys(jar), message: hasCookie ? '登录成功 ✅' : '登录失败，未获取到Cookie' });
  } catch(e) {
    res.json({ ok: false, message: `连接失败: ${e.message}` });
  }
});

// ========== 人员管理 API ==========

app.get('/api/staff', (req, res) => {
  const { q } = req.query;
  let rows;
  if (q) {
    rows = db.prepare(`SELECT * FROM staff WHERE name LIKE ? OR phone LIKE ? ORDER BY department, name`).all(`%${q}%`, `%${q}%`);
  } else {
    rows = db.prepare(`SELECT * FROM staff ORDER BY department, name`).all();
  }
  res.json(rows);
});

app.post('/api/staff', (req, res) => {
  const { name, phone, department, position } = req.body;
  if (!name) return res.status(400).json({ error: '姓名必填' });
  const r = db.prepare(`INSERT INTO staff (name, phone, department, position) VALUES (?, ?, ?, ?)`).run(name, phone||'', department||'', position||'');
  res.json({ id: r.lastInsertRowid, name, phone: phone||'', department: department||'', position: position||'', status: 'on_duty' });
});

app.patch('/api/staff/:id', (req, res) => {
  const { status, name, phone, department, position } = req.body;
  const { id } = req.params;
  if (status !== undefined) {
    db.prepare(`UPDATE staff SET status=? WHERE id=?`).run(status, id);
  } else {
    db.prepare(`UPDATE staff SET name=?, phone=?, department=?, position=? WHERE id=?`).run(name, phone, department, position, id);
  }
  const row = db.prepare(`SELECT * FROM staff WHERE id=?`).get(id);
  res.json(row);
});

app.delete('/api/staff/:id', (req, res) => {
  db.prepare(`DELETE FROM staff WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});

// 批量更新状态（全部在岗/全部休假）
app.post('/api/staff/batch-status', (req, res) => {
  const { status } = req.body;
  db.prepare(`UPDATE staff SET status=?`).run(status);
  res.json({ ok: true });
});

app.post('/api/staff/import', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请上传文件' });
  try {
    const wb = XLSX.readFile(req.file.path);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws);
    let count = 0;
    const insert = db.prepare(`INSERT INTO staff (name, phone, department, position) VALUES (?, ?, ?, ?)`);
    const insertMany = db.transaction((rows) => {
      for (const row of rows) {
        const name = row['姓名'] || row['name'] || '';
        const phone = String(row['手机号'] || row['phone'] || '');
        const department = row['部门'] || row['department'] || '';
        const position = row['职务'] || row['position'] || '';
        if (name) { insert.run(name, phone, department, position); count++; }
      }
    });
    insertMany(rows);
    fs.unlinkSync(req.file.path);
    res.json({ ok: true, count });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== 查询 API ==========
app.post('/api/query', async (req, res) => {
  const { date, timeFrom, timeTo } = req.body;
  const queryDate = date || dayjs().format('YYYY-MM-DD');
  const account = getActiveAccount();
  if (!account) return res.status(400).json({ error: '请先配置并激活一个目标系统账号' });

  try {
    const { jar, baseUrl } = await loginAndGetCookies(account);

    const [checkData, warnData, overdueData] = await Promise.all([
      fetchRecords('/tms/safeCheck/gridCheckRecord/list', queryDate, jar, baseUrl),
      fetchRecords('/tms/safeCheck/gridWarnRecord/list', queryDate, jar, baseUrl),
      fetchRecords('/tms/safeCheck/gridOverdueRecord/list', queryDate, jar, baseUrl),
    ]);

    const onDutyStaff = db.prepare(`SELECT * FROM staff WHERE status='on_duty'`).all();

    const checkRows = checkData.rows || checkData.data || checkData.list || [];
    const warnRows = warnData.rows || warnData.data || warnData.list || [];
    const overdueRows = overdueData.rows || overdueData.data || overdueData.list || [];

    // 提取已填写的人
    const filledNames = new Set();
    const filledPhones = new Set();
    checkRows.forEach(r => {
      const n = r.name || r.checkPerson || r.inspectorName || r.userName || '';
      const p = String(r.phone || r.mobile || r.phoneNumber || '');
      if (n) filledNames.add(n);
      if (p) filledPhones.add(p);
    });

    const warnedNames = new Set(warnRows.map(r => r.name || r.userName || '').filter(Boolean));
    const warnedPhones = new Set(warnRows.map(r => String(r.phone || r.mobile || '')).filter(Boolean));
    const overdueNames = new Set(overdueRows.map(r => r.name || r.userName || '').filter(Boolean));
    const overduePhones = new Set(overdueRows.map(r => String(r.phone || r.mobile || '')).filter(Boolean));

    const result = onDutyStaff.map(s => {
      const phone = String(s.phone || '');
      const filled = filledNames.has(s.name) || (phone && filledPhones.has(phone));
      const warned = warnedNames.has(s.name) || (phone && warnedPhones.has(phone));
      const overdue = overdueNames.has(s.name) || (phone && overduePhones.has(phone));
      let tag = 'unfilled';
      if (overdue) tag = 'overdue';
      else if (warned) tag = 'warned';
      else if (filled) tag = 'filled';
      return { ...s, filled, warned, overdue, tag };
    });

    db.prepare(`INSERT INTO check_results (query_date, time_from, time_to, result_json) VALUES (?,?,?,?)`)
      .run(queryDate, timeFrom||'', timeTo||'', JSON.stringify(result));

    res.json({
      date: queryDate, timeFrom, timeTo,
      account: account.label,
      total: result.length,
      filled: result.filter(r=>r.tag==='filled').length,
      unfilled: result.filter(r=>r.tag==='unfilled').length,
      warned: result.filter(r=>r.tag==='warned').length,
      overdue: result.filter(r=>r.tag==='overdue').length,
      list: result,
      debug: { checkRows: checkRows.length, warnRows: warnRows.length, overdueRows: overdueRows.length }
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/history', (req, res) => {
  const rows = db.prepare(`SELECT id, query_date, time_from, time_to, created_at FROM check_results ORDER BY id DESC LIMIT 20`).all();
  res.json(rows);
});

app.listen(PORT, () => console.log(`✅ Grid Checker running on port ${PORT}`));
