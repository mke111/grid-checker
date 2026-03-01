const express = require('express');
const router = express.Router();
const db = require('../db');
const { queryByName, queryByPhone } = require('../services/tms');

router.get('/', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  res.render('query', { results: null, error: null, keyword: '', searchType: 'name', date: today });
});

router.post('/search', async (req, res) => {
  const { keyword, type } = req.body;
  const today = new Date().toISOString().slice(0, 10);
  try {
    const account = db.prepare('SELECT * FROM accounts WHERE is_active = 1').get();
    if (!account) return res.render('query', { results: null, error: '请先在账号管理中设置激活账号', keyword, searchType: type, date: today });

    let data;
    if (type === 'phone') {
      data = await queryByPhone(account.username, account.password, keyword);
    } else {
      data = await queryByName(account.username, account.password, keyword);
    }

    const rows = data?.data || data?.rows || data?.list || [];
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    res.render('query', { results: { rows, columns }, error: null, keyword, searchType: type, date: today });
  } catch (e) {
    res.render('query', { results: null, error: '查询失败：' + e.message, keyword, searchType: type, date: today });
  }
});

module.exports = router;
