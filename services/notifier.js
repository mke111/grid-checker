const axios = require('axios');
const db = require('../db');

async function sendWebhook(webhookUrl, message) {
  if (!webhookUrl) return;
  try {
    // 支持企业微信/钉钉 webhook
    await axios.post(webhookUrl, {
      msgtype: 'text',
      text: { content: message }
    });
  } catch (e) {
    console.error('Webhook 发送失败:', e.message);
  }
}

async function buildNotifyMessage(unfilledStaff, date) {
  const lines = [
    `📋 网格化检查提醒 [${date}]`,
    `以下在岗人员今日尚未填写网格化检查：`,
    '',
    ...unfilledStaff.map((s, i) => `${i + 1}. ${s.name}${s.phone ? ' (' + s.phone + ')' : ''}`),
    '',
    `共 ${unfilledStaff.length} 人未填写，请尽快完成！`
  ];
  return lines.join('\n');
}

module.exports = { sendWebhook, buildNotifyMessage };
