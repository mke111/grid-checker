const express = require('express');
const router = express.Router();
const db = require('../db');
const tms = require('../services/tms');

// GET /query
router.get('/', (req, res) => {
  res.render('query', { results: null, keyword: '' });
});

// POST /query/search
router.post('/search', async (req, res) => {
  const { keyword } = req.body;
  if (!keyword) return res.render('query', { results: [], keyword: '' });

  try {
    // 从本地 DB 查基础信息
    const staff = await new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM staff WHERE name LIKE ? OR phone LIKE ?',
        [`%${keyword}%`, `%${keyword}%`],
        (err, rows) => { if (err) reject(err); else resolve(rows); }
      );
    });

    // 读取激活账号 + 配置
    const account = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM accounts WHERE is_active = 1 LIMIT 1', (err, row) => {
        if (err) reject(err); else resolve(row);
      });
    });

    const settings = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM settings LIMIT 1', (err, row) => {
        if (err) reject(err); else resolve(row);
      });
    });

    // 调用 TMS 获取今日记录
    let tmsRecords = [];
    if (account && settings) {
      tmsRecords = await tms.fetchTodayRecords(account, settings);
    }

    const tmsMap = {};
    for (const r of tmsRecords) {
      tmsMap[r.phone] = r;
    }

    // 合并结果
    const results = staff.map(s => ({
      ...s,
      tms: tmsMap[s.phone] || null
    }));

    res.render('query', { results, keyword });
  } catch (err) {
    console.error('[Query]', err);
    res.status(500).send('Query failed');
  }
});

module.exports = router;
