const express = require('express');
const router = express.Router();
const db = require('../db');
const { fetchCheckRecords, fetchWarningRecords, fetchOverdueRecords } = require('../services/targetApi');
const dayjs = require('dayjs');

router.get('/', async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  
  try {
    // 获取在岗人员
    const oncallStaff = db.prepare(`
      SELECT s.* FROM staff s
      JOIN daily_status ds ON ds.staff_id = s.id AND ds.date = ?
      WHERE ds.status = 'oncall'
    `).all(today);

    // 获取目标账号
    const targetAccount = db.prepare('SELECT * FROM target_accounts WHERE is_active=1 LIMIT 1').get();
    
    let checkData = { records: [], warning: 0, overdue: 0 };
    
    if (targetAccount) {
      const { records } = await fetchCheckRecords(targetAccount, today);
      const { records: warnings } = await fetchWarningRecords(targetAccount, today);
      const { records: overdues } = await fetchOverdueRecords(targetAccount, today);
      checkData = { records, warning: warnings.length, overdue: overdues.length };
    }

    // 统计
    const filledPhones = new Set(checkData.records.map(r => r.PHONE));
    const filledNames = new Set(checkData.records.map(r => r.CREATE_USER));
    
    const total = oncallStaff.length;
    const filled = checkData.records.length;
    const unfilled = oncallStaff.filter(s => !filledPhones.has(s.phone) && !filledNames.has(s.name)).length;

    const stats = { 
      total, 
      oncall: total, 
      filled, 
      unfilled,
      warning: checkData.warning,
      overdue: checkData.overdue
    };

    // 获取最近通知
    const recentLogs = db.prepare('SELECT * FROM notify_log ORDER BY created_at DESC LIMIT 5').all();

    res.render('index', { stats, recentLogs, date: today });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error: ' + err.message);
  }
});

// 手动触发检查
router.post('/run-check', async (req, res) => {
  try {
    const { runDailyCheck } = require('../services/dailyCheck');
    const result = await runDailyCheck();
    res.json({ ok: true, stats: result.stats, unfilled: result.unfilled.map(u => u.name) });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
