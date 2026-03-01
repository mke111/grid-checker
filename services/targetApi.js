const fetch = require('node-fetch');

// 登录并获取Cookie
async function loginAndGetCookies(account) {
  const jar = {};
  const BASE_URL = account.base_url;

  try {
    const res1 = await fetch(`${BASE_URL}/tms/index`, { 
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const cookies1 = res1.headers.raw()['set-cookie'] || [];
    cookies1.forEach(c => {
      const [pair] = c.split(';');
      const [k, v] = pair.split('=');
      if (k && v) jar[k.trim()] = v.trim();
    });

    const loginUrl = res1.url.includes('/cas/login') 
      ? res1.url 
      : `${BASE_URL}/cas/login?service=${encodeURIComponent(BASE_URL + '/tms/index')}&dpAppCode=PROJECT.TMS`;

    const params = new URLSearchParams();
    params.append('username', account.username);
    params.append('password', account.password);

    const res2 = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': Object.entries(jar).map(([k,v]) => `${k}=${v}`).join('; '),
        'User-Agent': 'Mozilla/5.0'
      },
      body: params.toString(),
      redirect: 'follow'
    });

    const cookies2 = res2.headers.raw()['set-cookie'] || [];
    cookies2.forEach(c => {
      const [pair] = c.split(';');
      const [k, v] = pair.split('=');
      if (k && v) jar[k.trim()] = v.trim();
    });

    return { jar, baseUrl: BASE_URL, ok: Object.keys(jar).length > 0 };
  } catch(e) {
    return { jar: {}, baseUrl: account.base_url, ok: false, error: e.message };
  }
}

// 获取检查记录
async function fetchCheckRecords(account, date) {
  const { jar, baseUrl } = await loginAndGetCookies(account);
  if (!jar.JSESSIONID) return { records: [], error: '登录失败' };

  const url = `${baseUrl}/tms/moudle/report/164480169233200777/pagingData?startDate=${date}&endDate=${date}&pageSize=1000&pageNum=1`;
  
  try {
    const res = await fetch(url, {
      headers: { 
        'Cookie': Object.entries(jar).map(([k,v]) => `${k}=${v}`).join('; '),
        'User-Agent': 'Mozilla/5.0'
      }
    });
    const data = await res.json();
    
    if (data.code === 'success' && data.data && data.data.list) {
      return { records: data.data.list };
    }
    return { records: [], error: data.msg || '获取失败' };
  } catch(e) {
    return { records: [], error: e.message };
  }
}

// 获取预警记录
async function fetchWarningRecords(account, date) {
  const { jar, baseUrl } = await loginAndGetCookies(account);
  if (!jar.JSESSIONID) return { records: [], error: '登录失败' };

  const url = `${baseUrl}/tms/moudle/report/164811368582200179/pagingData?startDate=${date}&endDate=${date}&pageSize=1000&pageNum=1`;
  
  try {
    const res = await fetch(url, {
      headers: { 
        'Cookie': Object.entries(jar).map(([k,v]) => `${k}=${v}`).join('; '),
        'User-Agent': 'Mozilla/5.0'
      }
    });
    const data = await res.json();
    
    if (data.code === 'success' && data.data && data.data.list) {
      return { records: data.data.list };
    }
    return { records: [], error: data.msg || '获取失败' };
  } catch(e) {
    return { records: [], error: e.message };
  }
}

// 获取逾期记录
async function fetchOverdueRecords(account, date) {
  const { jar, baseUrl } = await loginAndGetCookies(account);
  if (!jar.JSESSIONID) return { records: [], error: '登录失败' };

  const url = `${baseUrl}/tms/moudle/report/164725306431302680/pagingData?startDate=${date}&endDate=${date}&pageSize=1000&pageNum=1`;
  
  try {
    const res = await fetch(url, {
      headers: { 
        'Cookie': Object.entries(jar).map(([k,v]) => `${k}=${v}`).join('; '),
        'User-Agent': 'Mozilla/5.0'
      }
    });
    const data = await res.json();
    
    if (data.code === 'success' && data.data && data.data.list) {
      return { records: data.data.list };
    }
    return { records: [], error: data.msg || '获取失败' };
  } catch(e) {
    return { records: [], error: e.message };
  }
}

// 获取目标系统所有人员（从检查记录中提取）
async function fetchAllStaff(account) {
  const { jar, baseUrl } = await loginAndGetCookies(account);
  if (!jar.JSESSIONID) return { staff: [], error: '登录失败' };

  // 获取最近30天的记录来提取所有人员
  const url = `${baseUrl}/tms/moudle/report/164480169233200777/pagingData?startDate=2025-01-01&endDate=2026-12-31&pageSize=1000&pageNum=1`;
  
  try {
    const res = await fetch(url, {
      headers: { 
        'Cookie': Object.entries(jar).map(([k,v]) => `${k}=${v}`).join('; '),
        'User-Agent': 'Mozilla/5.0'
      }
    });
    const data = await res.json();
    
    if (data.code === 'success' && data.data && data.data.list) {
      // 去重提取人员
      const staffMap = new Map();
      data.data.list.forEach(r => {
        const key = r.PHONE || r.CREATE_USER;
        if (key && !staffMap.has(key)) {
          staffMap.set(key, {
            name: r.CREATE_USER,
            phone: r.PHONE,
            dept: r.DEPT_NAME,
            job: r.JOB_NAME
          });
        }
      });
      return { staff: Array.from(staffMap.values()) };
    }
    return { staff: [], error: data.msg || '获取失败' };
  } catch(e) {
    return { staff: [], error: e.message };
  }
}

module.exports = {
  loginAndGetCookies,
  fetchCheckRecords,
  fetchWarningRecords,
  fetchOverdueRecords,
  fetchAllStaff
};
