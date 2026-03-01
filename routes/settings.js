const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /settings
router.get('/', (req, res) => {
  db.get('SELECT * FROM settings LIMIT 1', (err, row) => {
    if (err) return res.status(500).send('DB Error');
    res.render('settings', { settings: row || {} });
  });
});

// POST /settings
router.post('/', (req, res) => {
  const { check_start, check_end, notify_time, notify_webhook, target_url } = req.body;
  db.get('SELECT id FROM settings LIMIT 1', (err, row) => {
    if (row) {
      db.run(
        `UPDATE settings SET check_start=?, check_end=?, notify_time=?, notify_webhook=?, target_url=? WHERE id=?`,
        [check_start, check_end, notify_time, notify_webhook, target_url, row.id],
        (err) => {
          if (err) console.error(err);
          res.redirect('/settings');
        }
      );
    } else {
      db.run(
        `INSERT INTO settings (check_start, check_end, notify_time, notify_webhook, target_url) VALUES (?,?,?,?,?)`,
        [check_start, check_end, notify_time, notify_webhook, target_url],
        (err) => {
          if (err) console.error(err);
          res.redirect('/settings');
        }
      );
    }
  });
});

module.exports = router;
