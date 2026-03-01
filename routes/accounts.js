const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  const accounts = db.prepare('SELECT id, label, username, is_active FROM accounts ORDER BY id').all();
  res.render('accounts', { accounts });
});

router.post('/add', (req, res) => {
  const { label, username, password } = req.body;
  db.prepare('INSERT INTO accounts (label, username, password) VALUES (?, ?, ?)').run(label, username, password);
  res.redirect('/accounts');
});

router.post('/delete', (req, res) => {
  db.prepare('DELETE FROM accounts WHERE id = ?').run(req.body.id);
  res.redirect('/accounts');
});

router.post('/activate', (req, res) => {
  db.prepare('UPDATE accounts SET is_active = 0').run();
  db.prepare('UPDATE accounts SET is_active = 1 WHERE id = ?').run(req.body.id);
  res.redirect('/accounts');
});

module.exports = router;
