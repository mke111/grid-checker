const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  rows.forEach(r => settings[r.key] = r.value);
  res.render('settings', { settings });
});

router.post('/', (req, res) => {
  const fields = ['check_start', 'check_end', 'notify_time', 'notify_webhook', 'target_url'];
  fields.forEach(key => {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, req.body[key] || '');
  });
  res.redirect('/settings');
});

module.exports = router;
