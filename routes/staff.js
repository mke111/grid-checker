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
    `).all(today, `%${q}%`, `%${q}%`);
  } else {
    staff = db.prepare(`
      SELECT s.*, COALESCE(ds.status, 'oncall') as status
      FROM staff s
      LEFT JOIN daily_status ds ON ds.staff_id = s.id AND ds.date = ?
    `).all(today);
  }
  
  res.render('staff', { staff, today, q: q || '' });
});

router.post('/add', (req, res) => {
  const { name, phone, department, position } = req.body;
  db.prepare('INSERT INTO staff (name, phone, department, position) VALUES (?, ?, ?, ?)')
    .run(name, phone || '', department || '', position || '');
  res.redirect('/staff');
});

router.post('/status', (req, res) => {
  const { id, date, status } = req.body;
  const today = date || new Date().toISOString().slice(0, 10);
  db.prepare('INSERT OR REPLACE INTO daily_status (date, staff_id, status) VALUES (?, ?, ?)')
    .run(today, id, status);
  res.redirect('/staff');
});

router.post('/delete', (req, res) => {
  db.prepare('DELETE FROM staff WHERE id = ?').run(req.body.id);
  res.redirect('/staff');
});

router.post('/batch', (req, res) => {
  const { status, date } = req.body;
  const today = date || new Date().toISOString().slice(0, 10);
  const all = db.prepare('SELECT id FROM staff').all();
  for (const s of all) {
    db.prepare('INSERT OR REPLACE INTO daily_status (date, staff_id, status) VALUES (?, ?, ?)')
      .run(today, s.id, status);
  }
  res.redirect('/staff');
});

router.post('/import', upload.single('file'), (req, res) => {
  try {
    const wb = xlsx.readFile(req.file.path);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(ws);
    
    const insert = db.prepare('INSERT OR IGNORE INTO staff (name, phone, department, position) VALUES (?, ?, ?, ?)');
    for (const row of rows) {
      const name = row['姓名'] || row['name'];
      if (name) {
        insert.run(name, row['手机号'] || row['phone'] || '', row['部门'] || row['department'] || '', row['职务'] || row['position'] || '');
      }
    }
    res.redirect('/staff');
  } catch(e) {
    res.send('导入失败: ' + e.message);
  }
});

module.exports = router;
