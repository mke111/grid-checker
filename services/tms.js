const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

const BASE = 'http://221.181.9.210:17027';

// 报表 ID 映射
const REPORT_IDS = {
  record: '164480169233200777',    // 检查记录
  warning: '164811368582200179',   // 预警记录
  overdue: '164725306431302680',   // 逾期记录
};

async function createSession() {
  const jar = new CookieJar();
  const client = wrapper(axios.create({ jar, withCredentials: true, maxRedirects: 10 }));
  return { jar, client };
}

async function login(username, password) {
  const { jar, client } = await createSession();

  // 1. GET 登录页拿 lt token
  const loginPageUrl = `${BASE}/cas/login?service=${encodeURIComponent(BASE + '/tms/index')}`;
  const pageResp = await client.get(loginPageUrl);
  const html = pageResp.data;

  const ltMatch = html.match(/name="lt"\s+value="([^"]+)"/);
  const sidMatch = html.match(/jsessionid=([A-Z0-9]+)/);
  if (!ltMatch) throw new Error('无法获取 lt token');

  const lt = ltMatch[1];
  const sid = sidMatch ? sidMatch[1] : '';

  // 2. POST 登录
  const postUrl = `${BASE}/cas/login${sid ? ';jsessionid=' + sid : ''}?service=${encodeURIComponent(BASE + '/tms/index')}`;
  await client.post(postUrl, new URLSearchParams({
    username, password, lt, execution: 'e1s1', _eventId: 'submit'
  }).toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  return { jar, client };
}

async function queryReport(client, reportId, queryParam = {}, pageNum = 1, pageSize = 200) {
  const url = `${BASE}/tms/moudle/report/${reportId}/pagingData`;
  const resp = await client.post(url, { pageNum, pageSize, queryParam }, {
    headers: { 'Content-Type': 'application/json' }
  });
  return resp.data;
}

async function fetchTodayRecords(username, password) {
  const { client } = await login(username, password);
  const today = new Date().toISOString().slice(0, 10);

  const [records, warnings, overdues] = await Promise.all([
    queryReport(client, REPORT_IDS.record, { startDate: today, endDate: today }),
    queryReport(client, REPORT_IDS.warning, { startDate: today, endDate: today }),
    queryReport(client, REPORT_IDS.overdue, { startDate: today, endDate: today }),
  ]);

  return { records, warnings, overdues, date: today };
}

async function queryByName(username, password, name) {
  const { client } = await login(username, password);
  const today = new Date().toISOString().slice(0, 10);
  const data = await queryReport(client, REPORT_IDS.record, { name, startDate: today, endDate: today });
  return data;
}

async function queryByPhone(username, password, phone) {
  const { client } = await login(username, password);
  const today = new Date().toISOString().slice(0, 10);
  const data = await queryReport(client, REPORT_IDS.record, { phone, startDate: today, endDate: today });
  return data;
}

module.exports = { login, fetchTodayRecords, queryByName, queryByPhone, queryReport, REPORT_IDS };
