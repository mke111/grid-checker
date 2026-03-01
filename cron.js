const cron = require('node-cron');
const { runDailyCheck } = require('./services/dailyCheck');

// 每天 UTC 12:00（北京时间 20:00）执行
cron.schedule('0 12 * * *', async () => {
  console.log('[Cron] 开始执行每日网格化检查...');
  try {
    await runDailyCheck();
    console.log('[Cron] 执行完成');
  } catch (err) {
    console.error('[Cron] 执行出错:', err);
  }
}, {
  timezone: 'Asia/Shanghai'
});

console.log('[Cron] 定时任务已注册 (北京时间 20:00 每日)');
