const express = require('express');
const router = express.Router();
const db = require('../db');
const { fetchCheckRecords, fetchWarningRecords, fetchOverdueRecords, fetchAllStaff } = require('../services/targetApi');
const dayjs = require('dayjs');

router.get('/', async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  
  try {
    // 获取目标账号
    const targetAccount = db.prepare('SELECT * FROM target_accounts WHERE is_active=1 LIMIT 1').get();
    
    let checkData = { records: [], warning: 0, overdue: 0 };
    let allStaff = [];
    
    if (targetAccount) {
      // 获取今日检查记录
      const { records } = await fetchCheckRecords(targetAccount, today);
      const { records: warnings } = await fetchWarningRecords(targetAccount, today);
      const { records: overdues } = await fetchOverdueRecords(targetAccount, today);
      checkData = { records, warning: warnings.length, overdue: overdues.length };
      
      // 获取所有人员
      const { staff } = await fetchAllStaff(targetAccount);
      allStaff = staff;
    }

    // 从本地获取在岗人员设置
    const oncallSettings = db.prepare(`
      SELECT staff_id, status FROM daily_status WHERE date = ?
    `).all(today);
    const oncallMap = new Map(oncallSettings.map(s => [s.staff_id, s.status]));

    // 获取本地人员列表
    const localStaff = db.prepare('SELECT * FROM staff').all();
    const localMap = new Map(localStaff.map(s => [s.phone, s]));

    // 比对：找出需要检查的人员（在目标系统出现过 且 本地设置为在岗）
    const toCheck = allStaff.filter(s => {
      const local = localMap.get(s.phone);
      // 如果本地有记录，看设置的状态；如果没有，默认为在岗
      if (local) {
        const status = oncallMap.get(local.id);
        return !status || status === 'oncall';
      }
      // 目标系统有，本地没有的，默认为在岗
      return true;
    });

    // 已填写的人员
    const filledPhones = new Set(checkData.records.map(r => r.PHONE));
    const filledNames = new Set(checkData.records.map(r => r.CREATE_USER));
    
    // 未填写 = 需要检查的人员 - 已填写
    const unfilled = toCheck.filter(s => 
      !filledPhones.has(s.phone) && !filledNames.has(s.name)
    );

    // 逾期人员
    const overduePhones = new Set(checkData.records.filter(r => r.STATE === '4').map(r => r.PHONE));

    const stats = { 
      total: toCheck.length,
      oncall: toCheck.length, 
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
