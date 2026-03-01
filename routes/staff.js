const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const xlsx = require('xlsx');
const upload = multer({ dest: 'uploads/' });

router.get('/', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const { q } = req.query;
  
  let staff;
  if (q) {
    staff = db.prepare(`
      SELECT s.*, COALESCE(ds.status, 'oncall') as status
      FROM staff s
      LEFT JOIN daily_status ds ON ds.staff_id = s.id AND ds.date = ?
      WHERE s.name LIKE ? OR s.phone LIKE ?
      ORDER BY s.id
    `).all(today, `%${q}%`, `%${q}%`);
  } else {
    staff = db.prepare(`
      SELECT s.*, COALESCE(ds.status, 'oncall') as status
      FROM staff s
      LEFT JOIN daily_status ds ON ds.staff_id = s.id AND ds.date = ?
      ORDER BY s.id
    `).all(today);
  }
  
  res.render('staff', { staff, date: today, q: q || '' });
});

// 添加人员
router.post('/add', (req, res) => {
  const { name, phone, department, position } = req.body;
  db.prepare('INSERT INTO staff (name, phone, department, position) VALUES (?, ?, ?, ?)')
    .run(name, phone || '', department || '', position || '');
  res.redirect('/staff');
});

// 删除人员
router.post('/delete', (req, res) => {
  db.prepare('DELETE FROM staff WHERE id = ?').run(req.body.id);
  res.redirect('/staff');
});

// 切换在岗/休假
router.post('/status', (req, res) => {
  const { staff_id, date, status } = req.body;
  const today = date || new Date().toISOString().slice(0, 10);
  db.prepare('INSERT OR REPLACE INTO daily_status (date, staff_id, status) VALUES (?, ?, ?)')
    .run(today, staff_id, status);
  res.redirect('/staff');
});

// 批量设置
router.post('/batch-status', (req, res) => {
  const { status, date } = req.body;
  const today = date || new Date().toISOString().slice(0, 10);
  
  const allStaff = db.prepare('SELECT id FROM staff').all();
  const insert = db.prepare('INSERT OR REPLACE INTO daily_status (date, staff_id, status) VALUES (?, ?, ?)');
  
  for (const s of allStaff) {
    insert.run(today, s.id, status);
  }
  
  res.redirect('/staff');
});

// 导入Excel
router.post('/import', upload.single('file'), (req, res) => {
  try {
    const wb = xlsx.readFile(req.file.path);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(ws);
    
    const insert = db.prepare('INSERT OR IGNORE INTO staff (name, phone, department, position) VALUES (?, ?, ?, ?)');
    
    for (const row of rows) {
      const name = row['姓名'] || row['name'];
      const phone = row['手机号'] || row['phone'] || '';
      const department = row['部门'] || row['department'] || '';
      const position = row['职务'] || row['position'] || '';
      if (name) insert.run(name, phone, department, position);
    }
    
    res.redirect('/staff');
  } catch (e) {
    res.status(500).send('导入失败：' + e.message);
  }
});

// 从目标系统同步人员
router.post('/sync', async (req, res) => {
  try {
    const targetAccount = db.prepare('SELECT * FROM target_accounts WHERE is_active=1 LIMIT 1').get();
    if (!targetAccount) {
      return res.json({ ok: false, error: '请先配置目标系统账号' });
    }

    const { fetchCheckRecords } = require('../services/targetApi');
    const today = new Date().toISOString().slice(0, 10);
    const { records } = await fetchCheckRecords(targetAccount, today);
    
    // 去重获取所有人员
    const staffMap = new Map();
    records.forEach(r => {
      const key = r.PHONE || r.CREATE_USER;
      if (key && !staffMap.has(key)) {
        staffMap.set(key, {
          name: r.CREATE_USER,
          phone: r.PHONE,
          department: r.DEPT_NAME,
          position: r.JOB_NAME
        });
      }
    });

    // 插入本地数据库
    const insert = db.prepare('INSERT OR IGNORE INTO staff (name, phone, department, position) VALUES (?, ?, ?, ?)');
    let count = 0;
    for (const s of staffMap.values()) {
      insert.run(s.name, s.phone, s.department, s.position);
      count++;
    }

    res.json({ ok: true, count });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
