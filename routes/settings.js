const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  const checkEnd = db.prepare('SELECT value FROM settings WHERE key=?').get('check_end')?.value || '20:00';
  const notifyTime = db.prepare('SELECT value FROM settings WHERE key=?').get('notify_time')?.value || '20:00';
  res.render('settings', { checkEnd, notifyTime });
});

router.post('/', (req, res) => {
  const { check_end, notify_time } = req.body;
  if (check_end) db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('check_end', check_end);
  if (notify_time) db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('notify_time', notify_time);
  res.redirect('/settings');
});

module.exports = router;
