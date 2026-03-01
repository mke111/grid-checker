const express = require('express');
const router = express.Router();
const db = require('../db');
const fetch = require('node-fetch');

router.get('/', (req, res) => {
  const accounts = db.prepare('SELECT * FROM target_accounts ORDER BY id').all();
  res.render('accounts', { accounts });
});

router.post('/add', (req, res) => {
  const { label, base_url, username, password } = req.body;
  db.prepare('INSERT INTO target_accounts (label, base_url, username, password, is_active) VALUES (?,?,?,?,0)')
    .run(label, base_url, username, password);
  res.redirect('/accounts');
});

router.post('/activate', (req, res) => {
  db.prepare('UPDATE target_accounts SET is_active=0').run();
  db.prepare('UPDATE target_accounts SET is_active=1 WHERE id=?').run(req.body.id);
  res.redirect('/accounts');
});

router.post('/delete', (req, res) => {
  db.prepare('DELETE FROM target_accounts WHERE id=?').run(req.body.id);
  res.redirect('/accounts');
});

module.exports = router;
