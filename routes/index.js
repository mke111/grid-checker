const express = require('express');
const router = express.Router();
const db = require('../db');
const { fetchCheckRecords, fetchWarningRecords, fetchOverdueRecords } = require('../services/targetApi');
const dayjs = require('dayjs');

router.get('/', async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  
  try {
    // 获取设置
    const settings = {};
    const rows = db.prepare('SELECT * FROM settings').all();
    rows.forEach(r => settings[r.key] = r.value);
    
    const checkEndTime = settings.check_end || '20:00'; // 默认20:00
    const [endHour, endMinute] = checkEndTime.split(':').map(Number);
    
    // 是否已超过截止时间
    const isAfterDeadline = currentHour > endHour || (currentHour === endHour && currentMinute >= endMinute);

    // 获取目标账号
    const targetAccount = db.prepare('SELECT * FROM target_accounts WHERE is_active=1 LIMIT 1').get();
    
    let checkData = { records: [], warning: 0, overdue: 0 };
    
    if (targetAccount) {
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

    // 已填写（在岗人员中有记录的）
    const filledPhones = new Set(checkData.records.map(r => r.PHONE));
    const filledNames = new Set(checkData.records.map(r => r.CREATE_USER));
    
    // 在岗人员中已填写的
    const filled = oncallStaff.filter(s => 
      filledPhones.has(s.phone) || filledNames.has(s.name)
    );
    
    // 未填写
    const unfilled = oncallStaff.filter(s => !filledPhones.has(s.phone) && !filledNames.has(s.name));
    
    // 逾期 = 超过截止时间且未填写
    const overdue = isAfterDeadline ? unfilled : [];
    const pending = isAfterDeadline ? [] : unfilled; // 未到截止时间 = 待填写

    const stats = { 
      oncall: oncallStaff.length,
      filled: filled.length, 
      unfilled: unfilled.length,
      overdue: overdue.length,
      pending: pending.length,
      isAfterDeadline,
      checkEndTime,
      targetRecordsCount: checkData.records.length // 调试用
    };

    // 传给前端的已填写列表只显示本地在岗人员中已填写的
    const filledList = filled;
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error: ' + err.message);
  }
});

router.post('/run-check', async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const targetAccount = db.prepare('SELECT * FROM target_accounts WHERE is_active=1 LIMIT 1').get();
    
    if (!targetAccount) {
      return res.json({ ok: false, error: '请先配置目标系统账号' });
    }

    const { records } = await fetchCheckRecords(targetAccount, today);
    res.json({ ok: true, total: records.length });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
