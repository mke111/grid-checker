const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const total = db.prepare('SELECT COUNT(*) as cnt FROM staff').get().cnt;
    const oncall = db.prepare("SELECT COUNT(*) as cnt FROM daily_status WHERE date = ? AND status = 'oncall'").get(today).cnt;
    const filled = db.prepare("SELECT COUNT(*) as cnt FROM daily_status WHERE date = ? AND status = 'oncall'").get(today).cnt;
    const unfilled = Math.max(0, oncall - filled);
    const overdue = db.prepare("SELECT COUNT(*) as cnt FROM staff s WHERE NOT EXISTS (SELECT 1 FROM daily_status ds WHERE ds.staff_id = s.id AND ds.date = ? AND ds.status = 'oncall')").get(today).cnt;
    const lastSync = db.prepare("SELECT value FROM settings WHERE key = 'last_sync'").get()?.value || null;

    res.render('index', { stats: { total, oncall, filled, unfilled, overdue, lastSync } });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error: ' + err.message);
  }
});

module.exports = router;
