// 简单版 - 直接用 node-fetch
const fetch = require('node-fetch');

async function getCheckRecords(account, date) {
  try {
    // 1. 获取JSESSIONID
    const res1 = await fetch(account.base_url + '/tms/index', {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    
    let jar = {};
    const cookies1 = res1.headers.raw()['set-cookie'] || [];
    cookies1.forEach(c => {
      const [pair] = c.split(';');
      const [k, v] = pair.split('=');
      if (k) jar[k] = v;
    });

    // 2. 登录
    const loginUrl = res1.url.includes('/cas/login') 
      ? res1.url 
      : account.base_url + '/cas/login?service=' + encodeURIComponent(account.base_url + '/tms/index');

    const params = new URLSearchParams();
    params.append('username', account.username);
    params.append('password', account.password);

    const res2 = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': Object.entries(jar).map(([k,v]) => k + '=' + v).join('; '),
        'User-Agent': 'Mozilla/5.0'
      },
      body: params.toString(),
      redirect: 'follow'
    });

    const cookies2 = res2.headers.raw()['set-cookie'] || [];
    cookies2.forEach(c => {
      const [pair] = c.split(';');
      const [k, v] = pair.split('=');
      if (k) jar[k] = v;
    });

    if (!jar.JSESSIONID) {
      return { records: [], error: '登录失败' };
    }

    // 3. 获取检查记录
    const url = account.base_url + '/tms/moudle/report/164480169233200777/pagingData?startDate=' + date + '&endDate=' + date + '&pageSize=1000&pageNum=1';
    const res3 = await fetch(url, {
      headers: {
        'Cookie': 'JSESSIONID=' + jar.JSESSIONID,
        'User-Agent': 'Mozilla/5.0'
      }
    });

    const data = await res3.json();
    if (data.code === 'success' && data.data && data.data.list) {
      return { records: data.data.list };
    }
    return { records: [], error: data.msg };
  } catch(e) {
    return { records: [], error: e.message };
  }
}

module.exports = { getCheckRecords };
