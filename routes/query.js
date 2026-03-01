const express = require('express');
const router = express.Router();
const db = require('../db');
const dayjs = require('dayjs');

router.get('/', (req, res) => {
  const { q, date } = req.query;
  const queryDate = date || new Date().toISOString().slice(0, 10);
  
  let records = [];
  if (q) {
    records = db.prepare(`
      SELECT * FROM check_records 
      WHERE date = ? AND (create_user LIKE ? OR phone LIKE ? OR dept_name LIKE ?)
      ORDER BY id DESC
    `).all(queryDate, `%${q}%`, `%${q}%`, `%${q}%`);
  } else {
    records = db.prepare('SELECT * FROM check_records WHERE date = ? ORDER BY id DESC').all(queryDate);
  }
  
  // 统计
  const stats = {
    total: records.length,
    normal: records.filter(r => r.check_result === '正常').length,
    warning: records.filter(r => r.check_result !== '正常').length
  };

  res.render('query', { records, stats, date: queryDate, q: q || '' });
});

module.exports = router;
