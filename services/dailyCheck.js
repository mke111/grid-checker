const db = require('./db');
const { fetchCheckRecords, fetchWarningRecords, fetchOverdueRecords } = require('./services/targetApi');
const dayjs = require('dayjs');

async function runDailyCheck() {
  const today = dayjs().format('YYYY-MM-DD');
  console.log(`[Cron] 开始每日检查 - ${today}`);
  
  // 获取当前激活的账号
  const account = db.prepare('SELECT * FROM target_accounts WHERE is_active=1 LIMIT 1').get();
  if (!account) {
    console.log('[Cron] 未配置目标系统账号');
    return;
  }

  // 获取在岗人员名单
  const oncallStaff = db.prepare(`
    SELECT s.* FROM staff s
    JOIN daily_status ds ON ds.staff_id = s.id AND ds.date = ?
    WHERE ds.status = 'oncall'
  `).all(today);

  const oncallPhones = new Set(oncallStaff.map(s => s.phone));
  const oncallNames = new Set(oncallStaff.map(s => s.name));

  // 获取检查记录
  const { records: checkRecords } = await fetchCheckRecords(account, today);
  const { records: warningRecords } = await fetchWarningRecords(account, today);
  const { records: overdueRecords } = await fetchOverdueRecords(account, today);

  // 统计
  const filledPhones = new Set(checkRecords.map(r => r.PHONE));
  const filledNames = new Set(checkRecords.map(r => r.CREATE_USER));

  // 未填写 = 在岗但没有填写记录
  const unfilled = oncallStaff.filter(s => 
    !filledPhones.has(s.phone) && !filledNames.has(s.name)
  );

  const stats = {
    total: oncallStaff.length,
    oncall: oncallStaff.length,
    filled: checkRecords.length,
    unfilled: unfilled.length,
    overdue: overdueRecords.length,
    warning: warningRecords.length
  };

  console.log(`[Cron] 统计: 在岗${stats.oncall}人, 已填${stats.filled}人, 未填${stats.unfilled}人, 预警${stats.warning}人, 逾期${stats.overdue}人`);

  // 保存检查记录到数据库
  const insertRecord = db.prepare(`
    INSERT OR REPLACE INTO check_records 
    (record_id, date, fixed_type, dept_name, job_name, create_user, phone, shift, state, check_result)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const r of checkRecords) {
    insertRecord.run(
      r.UNION_ID, today, r.FIXED_TYPE, r.DEPT_NAME, r.JOB_NAME, 
      r.CREATE_USER, r.PHONE, r.SHIFT, r.STATE, r.COUNTS > 0 ? '有隐患' : '正常'
    );
  }

  // 记录日志
  const message = `【网格化检查日报】${today}\n在岗: ${stats.oncall}人\n已填写: ${stats.filled}人\n未填写: ${stats.unfilled}人\n预警: ${stats.warning}人\n逾期: ${stats.overdue}人`;
  
  if (unfilled.length > 0) {
    const names = unfilled.map(u => u.name).join('、');
    console.log(`[Cron] 未填写人员: ${names}`);
  }

  // 保存到通知日志
  db.prepare(`
    INSERT INTO notify_log (date, total, oncall, filled, unfilled, overdue, message)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(today, stats.total, stats.oncall, stats.filled, stats.unfilled, stats.overdue, message);

  return { stats, unfilled };
}

// 手动触发检查
async function triggerCheck() {
  return await runDailyCheck();
}

module.exports = { runDailyCheck, triggerCheck };
