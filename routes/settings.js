const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  const settings = {};
  const rows = db.prepare('SELECT * FROM settings').all();
  rows.forEach(r => settings[r.key] = r.value);
  res.render('settings', { settings });
});

router.post('/', (req, res) => {
  const { check_start, check_end, notify_time, notify_webhook } = req.body;
  
  if (check_start) db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('check_start', check_start);
  if (check_end) db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('check_end', check_end);
  if (notify_time) db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('notify_time', notify_time);
  if (notify_webhook) db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('notify_webhook', notify_webhook);
  
  res.redirect('/settings');
});

module.exports = router;
