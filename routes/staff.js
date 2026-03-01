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
    // 按姓名或手机号搜索
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

// 切换在岗/休假状态
router.post('/status', (req, res) => {
  const { staff_id, date, status } = req.body;
  const today = date || new Date().toISOString().slice(0, 10);
  db.prepare('INSERT OR REPLACE INTO daily_status (date, staff_id, status) VALUES (?, ?, ?)')
    .run(today, staff_id, status);
  res.redirect('/staff');
});

// 批量设置状态
router.post('/batch-status', (req, res) => {
  const { status, date } = req.body;
  const today = date || new Date().toISOString().slice(0, 10);
  
  // 获取所有人员，设置状态
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

// API: 人员列表
router.get('/api', (req, res) => {
  const { q } = req.query;
  let rows;
  if (q) {
    rows = db.prepare('SELECT * FROM staff WHERE name LIKE ? OR phone LIKE ?').all(`%${q}%`, `%${q}%`);
  } else {
    rows = db.prepare('SELECT * FROM staff ORDER BY id').all();
  }
  res.json(rows);
});

module.exports = router;
