const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const xlsx = require('xlsx');
const upload = multer({ dest: 'uploads/' });

router.get('/', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const staff = db.prepare(`
    SELECT s.*, COALESCE(ds.status, 'oncall') as status
    FROM staff s
    LEFT JOIN daily_status ds ON ds.staff_id = s.id AND ds.date = ?
    ORDER BY s.id
  `).all(today);
  res.render('staff', { staff, date: today });
});

router.post('/add', (req, res) => {
  const { name, phone } = req.body;
  db.prepare('INSERT INTO staff (name, phone) VALUES (?, ?)').run(name, phone || null);
  res.redirect('/staff');
});

router.post('/delete', (req, res) => {
  db.prepare('DELETE FROM staff WHERE id = ?').run(req.body.id);
  res.redirect('/staff');
});

router.post('/status', (req, res) => {
  const { staff_id, date, status } = req.body;
  db.prepare('INSERT OR REPLACE INTO daily_status (date, staff_id, status) VALUES (?, ?, ?)').run(date, staff_id, status);
  res.redirect('/staff');
});

router.post('/import', upload.single('file'), (req, res) => {
  try {
    const wb = xlsx.readFile(req.file.path);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(ws);
    const insert = db.prepare('INSERT OR IGNORE INTO staff (name, phone) VALUES (?, ?)');
    rows.forEach(row => {
      const name = row['姓名'] || row['name'];
      const phone = row['手机号'] || row['phone'] || null;
      if (name) insert.run(name, phone);
    });
    res.redirect('/staff');
  } catch (e) {
    res.status(500).send('导入失败：' + e.message);
  }
});

module.exports = router;
