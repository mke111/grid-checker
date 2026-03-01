const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const db = require('../db');

const upload = multer({ storage: multer.memoryStorage() });

// GET /staff
router.get('/', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  db.all(
    `SELECT s.*, dr.filled
     FROM staff s
     LEFT JOIN daily_records dr ON s.id = dr.staff_id AND dr.date = ?
     ORDER BY s.name`,
    [today],
    (err, rows) => {
      if (err) return res.status(500).send('DB Error');
      res.render('staff', { staff: rows, today });
    }
  );
});

// POST /staff/add
router.post('/add', (req, res) => {
  const { name, phone } = req.body;
  if (!name || !phone) return res.redirect('/staff');
  db.run('INSERT INTO staff (name, phone, status) VALUES (?, ?, "on_duty")', [name, phone], (err) => {
    if (err) console.error(err);
    res.redirect('/staff');
  });
});

// POST /staff/delete
router.post('/delete', (req, res) => {
  const { id } = req.body;
  db.run('DELETE FROM staff WHERE id = ?', [id], (err) => {
    if (err) console.error(err);
    res.redirect('/staff');
  });
});

// POST /staff/status
router.post('/status', (req, res) => {
  const { id } = req.body;
  db.get('SELECT status FROM staff WHERE id = ?', [id], (err, row) => {
    if (err || !row) return res.redirect('/staff');
    const newStatus = row.status === 'on_duty' ? 'off_duty' : 'on_duty';
    db.run('UPDATE staff SET status = ? WHERE id = ?', [newStatus, id], () => {
      res.redirect('/staff');
    });
  });
});

// POST /staff/import
router.post('/import', upload.single('file'), (req, res) => {
  if (!req.file) return res.redirect('/staff');
  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    const stmt = db.prepare('INSERT OR IGNORE INTO staff (name, phone, status) VALUES (?, ?, "on_duty")');
    for (const row of rows) {
      const name = row['name'] || row['姓名'];
      const phone = row['phone'] || row['手机号'] || row['电话'];
      if (name && phone) stmt.run([String(name).trim(), String(phone).trim()]);
    }
    stmt.finalize();
    res.redirect('/staff');
  } catch (err) {
    console.error('[Import]', err);
    res.status(500).send('Import failed');
  }
});

module.exports = router;
