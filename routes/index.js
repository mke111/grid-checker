const express = require('express');
const router = express.Router();
const db = require('../db');
const { getCheckRecords } = require('../services/api');

router.get('/', async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  
  // 获取当前账号
  const account = db.prepare('SELECT * FROM target_accounts WHERE is_active=1 LIMIT 1').get();
  
  // 获取设置
  const checkEnd = db.prepare('SELECT value FROM settings WHERE key=?').get('check_end')?.value || '20:00';
  
  // 获取本地在岗人员
  const oncallStaff = db.prepare(`
    SELECT s.* FROM staff s
    JOIN daily_status ds ON ds.staff_id = s.id AND ds.date = ?
    WHERE ds.status = 'oncall'
  `).all(today);

  let records = [];
  let error = '';
  
  if (account) {
    const result = await getCheckRecords(account, today);
    records = result.records;
    error = result.error || '';
  }

  // 匹配
  const filledPhones = new Set(records.map(r => r.PHONE));
  const filledNames = new Set(records.map(r => r.CREATE_USER));
  
  const filled = oncallStaff.filter(s => filledPhones.has(s.phone) || filledNames.has(s.name));
  const unfilled = oncallStaff.filter(s => !filledPhones.has(s.phone) && !filledNames.has(s.name));

  // 当前时间是否超过截止时间
  const now = new Date();
  const [endHour, endMin] = checkEnd.split(':').map(Number);
  const isOverdue = now.getHours() > endHour || (now.getHours() === endHour && now.getMinutes() >= endMin);

  const stats = {
    oncall: oncallStaff.length,
    filled: filled.length,
    unfilled: unfilled.length,
    isOverdue,
    checkEnd,
    targetCount: records.length
  };

  res.render('index', { stats, unfilled, filled, today, account, error });
});

router.post('/refresh', async (req, res) => {
  res.redirect('/');
});

module.exports = router;
