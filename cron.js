const cron = require('node-cron');
const db = require('./db');
const tms = require('./services/tms');
const notifier = require('./services/notifier');

// 每天 UTC 12:00（北京时间 20:00）执行
cron.schedule('0 12 * * *', async () => {
  console.log('[Cron] 开始执行每日打卡检查...');
  try {
    // 1. 读取激活账号
    const account = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM accounts WHERE is_active = 1 LIMIT 1', (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!account) {
      console.warn('[Cron] 没有激活账号，跳过');
      return;
    }

    // 2. 读取配置
    const settings = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM settings LIMIT 1', (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    // 3. 调用 TMS 获取今日已填记录
    const filledRecords = await tms.fetchTodayRecords(account, settings);
    const filledPhones = new Set(filledRecords.map(r => r.phone));

    // 4. 读取所有在岗人员
    const onDutyStaff = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM staff WHERE status = "on_duty"', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    // 5. 比对未填人员
    const missing = onDutyStaff.filter(s => !filledPhones.has(s.phone));

    console.log(`[Cron] 在岗人员: ${onDutyStaff.length}, 已填: ${filledPhones.size}, 未填: ${missing.length}`);

    // 6. 发 webhook 通知
    if (missing.length > 0 && settings && settings.notify_webhook) {
      await notifier.sendWebhook(settings.notify_webhook, missing);
      console.log(`[Cron] 已发送 webhook 通知，未填人数: ${missing.length}`);
    }

    // 7. 更新今日记录到 DB（可选标记 overdue）
    const today = new Date().toISOString().slice(0, 10);
    for (const staff of onDutyStaff) {
      const filled = filledPhones.has(staff.phone);
      db.run(
        `INSERT OR REPLACE INTO daily_records (staff_id, date, filled) VALUES (?, ?, ?)`,
        [staff.id, today, filled ? 1 : 0]
      );
    }

    console.log('[Cron] 执行完成');
  } catch (err) {
    console.error('[Cron] 执行出错:', err);
  }
}, {
  timezone: 'UTC'
});

console.log('[Cron] 定时任务已注册 (UTC 12:00 每日)');
