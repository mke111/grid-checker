const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /accounts
router.get('/', (req, res) => {
  db.all('SELECT id, label, username, is_active FROM accounts ORDER BY id', (err, rows) => {
    if (err) return res.status(500).send('DB Error');
    res.render('accounts', { accounts: rows });
  });
});

// POST /accounts/add
router.post('/add', (req, res) => {
  const { label, username, password } = req.body;
  if (!username || !password) return res.redirect('/accounts');
  db.run(
    'INSERT INTO accounts (label, username, password, is_active) VALUES (?, ?, ?, 0)',
    [label || username, username, password],
    (err) => {
      if (err) console.error(err);
      res.redirect('/accounts');
    }
  );
});

// POST /accounts/delete
router.post('/delete', (req, res) => {
  const { id } = req.body;
  db.run('DELETE FROM accounts WHERE id = ?', [id], (err) => {
    if (err) console.error(err);
    res.redirect('/accounts');
  });
});

// POST /accounts/activate
router.post('/activate', (req, res) => {
  const { id } = req.body;
  db.serialize(() => {
    db.run('UPDATE accounts SET is_active = 0');
    db.run('UPDATE accounts SET is_active = 1 WHERE id = ?', [id], (err) => {
      if (err) console.error(err);
      res.redirect('/accounts');
    });
  });
});

module.exports = router;
