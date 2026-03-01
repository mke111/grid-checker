const express = require('express');
const router = express.Router();
const db = require('../db');
const { loginAndGetCookies } = require('../services/targetApi');

// 账号列表页面
router.get('/', (req, res) => {
  const accounts = db.prepare('SELECT * FROM target_accounts ORDER BY id').all();
  res.render('accounts', { accounts });
});

// 添加账号
router.post('/add', (req, res) => {
  const { label, base_url, username, password } = req.body;
  db.prepare('INSERT INTO target_accounts (label, base_url, username, password, is_active) VALUES (?,?,?,?,0)')
    .run(label, base_url, username, password);
  res.redirect('/accounts');
});

// 激活账号
router.post('/activate', (req, res) => {
  const { id } = req.body;
  db.prepare('UPDATE target_accounts SET is_active=0').run();
  db.prepare('UPDATE target_accounts SET is_active=1 WHERE id=?').run(id);
  res.redirect('/accounts');
});

// 删除账号
router.post('/delete', (req, res) => {
  db.prepare('DELETE FROM target_accounts WHERE id=?').run(req.body.id);
  res.redirect('/accounts');
});

// 测试账号
router.post('/test', async (req, res) => {
  const { id } = req.body;
  const account = db.prepare('SELECT * FROM target_accounts WHERE id=?').get(id);
  if (!account) return res.json({ ok: false, message: '账号不存在' });
  
  const result = await loginAndGetCookies(account);
  res.json({ ok: result.ok, message: result.ok ? '登录成功 ✅' : (result.error || '登录失败') });
});

// API: 账号列表
router.get('/api', (req, res) => {
  const rows = db.prepare('SELECT id, label, base_url, username, is_active FROM target_accounts ORDER BY id').all();
  res.json(rows);
});

module.exports = router;
