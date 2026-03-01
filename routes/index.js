const express = require('express');
const router = express.Router();
const db = require('../db');
const { fetchCheckRecords, fetchWarningRecords, fetchOverdueRecords } = require('../services/targetApi');
const dayjs = require('dayjs');

router.get('/', async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  
  try {
    // 获取目标账号
    const targetAccount = db.prepare('SELECT * FROM target_accounts WHERE is_active=1 LIMIT 1').get();
    
    let checkData = { records: [], warning: 0, overdue: 0 };
    
    if (targetAccount) {
      // 获取今日检查记录
      const { records } = await fetchCheckRecords(targetAccount, today);
      const { records: warnings } = await fetchWarningRecords(targetAccount, today);
      const { records: overdues } = await fetchOverdueRecords(targetAccount, today);
      checkData = { records, warning: warnings.length, overdue: overdues.length };
    }

    // 获取本地在岗人员
    const oncallStaff = db.prepare(`
      SELECT s.* FROM staff s
      JOIN daily_status ds ON ds.staff_id = s.id AND ds.date = ?
      WHERE ds.status = 'oncall'
    `).all(today);

    // 获取本地休假人员
    const leaveStaff = db.prepare(`
      SELECT s.* FROM staff s
      JOIN daily_status ds ON ds.staff_id = s.id AND ds.date = ?
      WHERE ds.status = 'leave'
    `).all(today);

    // 已填写的人员（手机号或名字匹配）
    const filledPhones = new Set(checkData.records.map(r => r.PHONE));
    const filledNames = new Set(checkData.records.map(r => r.CREATE_USER));
    
    // 在岗但未填写
    const unfilled = oncallStaff.filter(s => 
      !filledPhones.has(s.phone) && !filledNames.has(s.name)
    );

    // 统计
    const stats = { 
      oncall: oncallStaff.length,
      leave: leaveStaff.length,
      total: oncallStaff.length + leaveStaff.length,
      filled: checkData.records.length, 
      unfilled: unfilled.length,
      warning: checkData.warning,
      overdue: checkData.overdue
    };

    res.render('index', { 
      stats, 
      unfilledList: unfilled,
      filledList: checkData.records,
      date: today,
      hasAccount: !!targetAccount
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error: ' + err.message);
  }
});

// 手动触发检查
router.post('/run-check', async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const targetAccount = db.prepare('SELECT * FROM target_accounts WHERE is_active=1 LIMIT 1').get();
    
    if (!targetAccount) {
      return res.json({ ok: false, error: '请先配置目标系统账号' });
    }

    const { records } = await fetchCheckRecords(targetAccount, today);
    const { records: warnings } = await fetchWarningRecords(targetAccount, today);
    const { records: overdues } = await fetchOverdueRecords(targetAccount, today);
    
    res.json({ 
      ok: true, 
      total: records.length,
      warning: warnings.length,
      overdue: overdues.length
    });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
