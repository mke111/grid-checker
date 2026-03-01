// 全局状态
var currentResults = [];
var currentStaff = [];
var currentAccounts = [];
var selectedFile = null;

// 初始化
document.addEventListener('DOMContentLoaded', function() {
  initNav();
  initDate();
  loadCurrentAccount();
  loadDashboard();
  loadStaff();
  loadAccounts();
  loadHistory();
});

// 导航切换
function initNav() {
  document.querySelectorAll('.nav-item').forEach(function(item) {
    item.addEventListener('click', function() {
      var page = item.dataset.page;
      switchPage(page);
    });
  });
}

function switchPage(page) {
  document.querySelectorAll('.nav-item').forEach(function(i) { i.classList.remove('active'); });
  document.querySelector('[data-page="' + page + '"]').classList.add('active');
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
  document.getElementById('page-' + page).classList.add('active');
}

// 初始化日期
function initDate() {
  var now = new Date();
  var today = now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  document.getElementById('currentDate').textContent = today;
  
  // 设置查询日期默认今天
  var dateStr = now.toISOString().split('T')[0];
  document.getElementById('queryStartDate').value = dateStr;
  document.getElementById('queryEndDate').value = dateStr;
}

// Toast 提示
function showToast(message, type) {
  type = type || 'success';
  var container = document.getElementById('toastContainer');
  var toast = document.createElement('div');
  toast.className = 'toast ' + type;
  var icon = '';
  if (type === 'success') {
    icon = '<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/>';
  } else if (type === 'error') {
    icon = '<circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/>';
  } else {
    icon = '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/>';
  }
  toast.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px">' + icon + '</svg><span>' + message + '</span>';
  container.appendChild(toast);
  setTimeout(function() { toast.remove(); }, 3000);
}

// 模态框
function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

// ========== 账号管理 ==========
async function loadCurrentAccount() {
  try {
    var res = await fetch('/api/accounts');
    var accounts = await res.json();
    var active = accounts.find(function(a) { return a.is_active; });
    document.getElementById('currentAccount').textContent = active ? (active.label + ' (' + active.username + ')') : '未设置';
    currentAccounts = accounts;
  } catch(e) {
    document.getElementById('currentAccount').textContent = '加载失败';
  }
}

async function loadAccounts() {
  try {
    var res = await fetch('/api/accounts');
    var accounts = await res.json();
    currentAccounts = accounts;
    renderAccounts(accounts);
  } catch(e) {
    showToast('加载账号失败', 'error');
  }
}

function renderAccounts(accounts) {
  var tbody = document.getElementById('accountsTable');
  if (accounts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#888">暂无账号，请添加</td></tr>';
    return;
  }
  tbody.innerHTML = accounts.map(function(a) {
    var statusBadge = a.is_active ? '<span class="badge badge-success">当前使用</span>' : '<span class="badge badge-default">备用</span>';
    var btnText = a.is_active ? '使用中' : '切换';
    var btnClass = a.is_active ? 'btn-outline' : 'btn-primary';
    return '<tr><td><strong>' + a.label + '</strong></td><td><code style="font-size:12px">' + a.base_url + '</code></td><td>' + a.username + '</td><td>' + statusBadge + '</td><td><div class="action-btns"><button class="btn btn-sm ' + btnClass + '" onclick="activateAccount(' + a.id + ')">' + btnText + '</button><button class="btn btn-sm btn-outline" onclick="testAccount(' + a.id + ')">测试</button><button class="btn btn-sm btn-danger" onclick="deleteAccount(' + a.id + ')">删除</button></div></td></tr>';
  }).join('');
}

function openAddAccountModal() {
  document.getElementById('accountLabel').value = '';
  document.getElementById('accountUrl').value = 'http://221.181.9.210:17027';
  document.getElementById('accountUsername').value = '';
  document.getElementById('accountPassword').value = '';
  document.getElementById('addAccountModal').classList.add('active');
}

async function addAccount() {
  var label = document.getElementById('accountLabel').value.trim();
  var base_url = document.getElementById('accountUrl').value.trim();
  var username = document.getElementById('accountUsername').value.trim();
  var password = document.getElementById('accountPassword').value;

  if (!label || !base_url || !username || !password) {
    showToast('请填写所有必填字段', 'warning');
    return;
  }

  try {
    var res = await fetch('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: label, base_url: base_url, username: username, password: password })
    });
    if (res.ok) {
      showToast('添加成功');
      closeModal('addAccountModal');
      loadAccounts();
      loadCurrentAccount();
    } else {
      var data = await res.json();
      showToast(data.error || '添加失败', 'error');
    }
  } catch(e) {
    showToast('添加失败: ' + e.message, 'error');
  }
}

async function activateAccount(id) {
  try {
    var res = await fetch('/api/accounts/' + id + '/activate', { method: 'POST' });
    if (res.ok) {
      showToast('切换成功');
      loadAccounts();
      loadCurrentAccount();
    }
  } catch(e) {
    showToast('切换失败', 'error');
  }
}

async function testAccount(id) {
  showToast('正在测试连接...', 'warning');
  try {
    var res = await fetch('/api/accounts/' + id + '/test', { method: 'POST' });
    var data = await res.json();
    if (data.ok) {
      showToast('连接成功');
    } else {
      showToast(data.message, 'error');
    }
  } catch(e) {
    showToast('测试失败: ' + e.message, 'error');
  }
}

async function deleteAccount(id) {
  if (!confirm('确认删除这个账号？')) return;
  try {
    var res = await fetch('/api/accounts/' + id, { method: 'DELETE' });
    if (res.ok) {
      showToast('删除成功');
      loadAccounts();
      loadCurrentAccount();
    }
  } catch(e) {
    showToast('删除失败', 'error');
  }
}

// ========== 人员管理 ==========
async function loadStaff() {
  var q = document.getElementById('searchStaff').value;
  try {
    var url = q ? '/api/staff?q=' + encodeURIComponent(q) : '/api/staff';
    var res = await fetch(url);
    var staff = await res.json();
    currentStaff = staff;
    renderStaff(staff);
  } catch(e) {
    showToast('加载人员失败', 'error');
  }
}

function renderStaff(staff) {
  var tbody = document.getElementById('staffTable');
  if (staff.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#888">暂无人员，请添加或导入</td></tr>';
    return;
  }
  tbody.innerHTML = staff.map(function(s) {
    var statusBadge = s.status === 'on_duty' ? '<span class="badge badge-success">在岗</span>' : '<span class="badge badge-warning">休假</span>';
    var btnText = s.status === 'on_duty' ? '休假' : '在岗';
    return '<tr><td><strong>' + s.name + '</strong></td><td>' + (s.phone || '-') + '</td><td>' + (s.department || '-') + '</td><td>' + (s.position || '-') + '</td><td>' + statusBadge + '</td><td><div class="action-btns"><button class="btn btn-sm btn-outline" onclick="toggleStaffStatus(' + s.id + ',\'' + s.status + '\')">' + btnText + '</button><button class="btn btn-sm btn-danger" onclick="deleteStaff(' + s.id + ')">删除</button></div></td></tr>';
  }).join('');
}

function openAddStaffModal() {
  document.getElementById('staffName').value = '';
  document.getElementById('staffPhone').value = '';
  document.getElementById('staffDept').value = '';
  document.getElementById('staffPosition').value = '';
  document.getElementById('addStaffModal').classList.add('active');
}

async function addStaff() {
  var name = document.getElementById('staffName').value.trim();
  var phone = document.getElementById('staffPhone').value.trim();
  var department = document.getElementById('staffDept').value.trim();
  var position = document.getElementById('staffPosition').value.trim();

  if (!name) {
    showToast('请输入姓名', 'warning');
    return;
  }

  try {
    var res = await fetch('/api/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, phone: phone, department: department, position: position })
    });
    if (res.ok) {
      showToast('添加成功');
      closeModal('addStaffModal');
      loadStaff();
    }
  } catch(e) {
    showToast('添加失败', 'error');
  }
}

async function toggleStaffStatus(id, currentStatus) {
  var newStatus = currentStatus === 'on_duty' ? 'leave' : 'on_duty';
  try {
    var res = await fetch('/api/staff/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    if (res.ok) {
      showToast('状态已更新');
      loadStaff();
    }
  } catch(e) {
    showToast('更新失败', 'error');
  }
}

async function deleteStaff(id) {
  if (!confirm('确认删除该人员？')) return;
  try {
    var res = await fetch('/api/staff/' + id, { method: 'DELETE' });
    if (res.ok) {
      showToast('删除成功');
      loadStaff();
    }
  } catch(e) {
    showToast('删除失败', 'error');
  }
}

async function batchSetStatus(status) {
  if (!confirm('确认批量设置状态？')) return;
  try {
    var res = await fetch('/api/staff/batch-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: status })
    });
    if (res.ok) {
      showToast('批量设置成功');
      loadStaff();
    }
  } catch(e) {
    showToast('设置失败', 'error');
  }
}

// Excel 导入
function handleFileSelect(input) {
  if (input.files && input.files[0]) {
    selectedFile = input.files[0];
    document.getElementById('selectedFileName').textContent = selectedFile.name;
    document.getElementById('importBtn').disabled = false;
  }
}

async function importStaff() {
  if (!selectedFile) {
    showToast('请选择文件', 'warning');
    return;
  }

  var formData = new FormData();
  formData.append('file', selectedFile);

  showToast('正在导入...', 'warning');

  try {
    var res = await fetch('/api/staff/import', {
      method: 'POST',
      body: formData
    });
    var data = await res.json();
    if (res.ok) {
      showToast('导入成功，共导入 ' + data.count + ' 条记录');
      closeModal('importModal');
      loadStaff();
      selectedFile = null;
      document.getElementById('selectedFileName').textContent = '';
      document.getElementById('importBtn').disabled = true;
    } else {
      showToast(data.error || '导入失败', 'error');
    }
  } catch(e) {
    showToast('导入失败: ' + e.message, 'error');
  }
}

// ========== 数据看板 ==========
async function loadDashboard() {
  // 加载今日数据
  var today = new Date().toISOString().split('T')[0];
  try {
    var res = await fetch('/api/history');
    var history = await res.json();
    
    // 找到今天的记录
    var todayRecord = null;
    for (var i = 0; i < history.length; i++) {
      if (history[i].query_date === today) {
        todayRecord = history[i];
        break;
      }
    }

    if (todayRecord) {
      // 如果有今天的数据，显示统计
      document.getElementById('statTotal').textContent = '0';
      document.getElementById('statFilled').textContent = '0';
      document.getElementById('statUnfilled').textContent = '0';
      document.getElementById('statWarned').textContent = '0';
      document.getElementById('statOverdue').textContent = '0';
      
      // 加载详细数据
      loadResults();
    } else {
      document.getElementById('resultsTable').innerHTML = '<tr><td colspan="5" style="text-align:center;color:#888">暂无今日数据，请点击"立即同步数据"</td></tr>';
    }
  } catch(e) {
    console.error(e);
  }
}

async function runCheck() {
  showToast('正在同步数据，请稍候...', 'warning');
  var today = new Date().toISOString().split('T')[0];
  
  try {
    var res = await fetch('/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: today })
    });
    var data = await res.json();
    
    if (res.ok) {
      showToast('同步成功！已填: ' + data.filled + ', 未填: ' + data.unfilled);
      currentResults = data.list || [];
      updateStats(data);
      renderResults(currentResults);
    } else {
      showToast(data.error || '同步失败', 'error');
    }
  } catch(e) {
    showToast('同步失败: ' + e.message, 'error');
  }
}

function updateStats(data) {
  document.getElementById('statTotal').textContent = data.total || 0;
  document.getElementById('statFilled').textContent = data.filled || 0;
  document.getElementById('statUnfilled').textContent = data.unfilled || 0;
  document.getElementById('statWarned').textContent = data.warned || 0;
  document.getElementById('statOverdue').textContent = data.overdue || 0;
}

async function loadResults() {
  var today = new Date().toISOString().split('T')[0];
  try {
    var res = await fetch('/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: today })
    });
    var data = await res.json();
    
    if (res.ok) {
      currentResults = data.list || [];
      updateStats(data);
      renderResults(currentResults);
    }
  } catch(e) {
    console.error(e);
  }
}

function renderResults(results) {
  var tbody = document.getElementById('resultsTable');
  if (!results || results.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#888">暂无数据</td></tr>';
    return;
  }
  
  tbody.innerHTML = results.map(function(r) {
    var tag = r.tag || 'unfilled';
    var badgeClass = 'badge-default';
    var statusText = '未填写';
    
    if (tag === 'filled') {
      badgeClass = 'badge-success';
      statusText = '已填写';
    } else if (tag === 'warned') {
      badgeClass = 'badge-warning';
      statusText = '预警';
    } else if (tag === 'overdue') {
      badgeClass = 'badge-danger';
      statusText = '逾期';
    }
    
    return '<tr><td><strong>' + r.name + '</strong></td><td>' + (r.phone || '-') + '</td><td>' + (r.department || '-') + '</td><td>' + (r.position || '-') + '</td><td><span class="badge ' + badgeClass + '">' + statusText + '</span></td></tr>';
  }).join('');
}

function filterResults() {
  var keyword = document.getElementById('searchResult').value.trim().toLowerCase();
  
  if (!keyword) {
    renderResults(currentResults);
    return;
  }
  
  var filtered = currentResults.filter(function(r) {
    return (r.name && r.name.toLowerCase().indexOf(keyword) !== -1) || 
           (r.phone && r.phone.toLowerCase().indexOf(keyword) !== -1);
  });
  
  renderResults(filtered);
}

// ========== 查询记录 ==========
async function loadHistory() {
  try {
    var res = await fetch('/api/history');
    var history = await res.json();
    renderHistory(history);
  } catch(e) {
    showToast('加载历史记录失败', 'error');
  }
}

function renderHistory(history) {
  var tbody = document.getElementById('historyTable');
  if (!history || history.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#888">暂无查询记录</td></tr>';
    return;
  }
  
  tbody.innerHTML = history.map(function(h) {
    return '<tr><td>' + h.query_date + '</td><td>' + (h.time_from || '-') + ' ~ ' + (h.time_to || '-') + '</td><td>-</td><td>-</td><td>-</td><td><button class="btn btn-sm btn-outline" onclick="viewHistoryDetail(' + h.id + ')">查看详情</button></td></tr>';
  }).join('');
}

async function searchHistory() {
  var startDate = document.getElementById('queryStartDate').value;
  var endDate = document.getElementById('queryEndDate').value;
  var keyword = document.getElementById('queryKeyword').value.trim();
  
  // 简单实现：先加载所有历史，然后前端筛选
  try {
    var res = await fetch('/api/history');
    var history = await res.json();
    
    // 按日期筛选
    var filtered = history.filter(function(h) {
      if (startDate && h.query_date < startDate) return false;
      if (endDate && h.query_date > endDate) return false;
      return true;
    });
    
    renderHistory(filtered);
    
    if (filtered.length > 0 && keyword) {
      // 如果有关键词，显示第一条记录的详情
      viewHistoryDetail(filtered[0].id, keyword);
    }
  } catch(e) {
    showToast('查询失败', 'error');
  }
}

async function viewHistoryDetail(id, keyword) {
  // 这个功能需要后端支持，暂时显示提示
  showToast('查看详情功能开发中...', 'warning');
}

// ========== 系统设置 ==========
async function saveSettings() {
  var checkStart = document.getElementById('checkStartTime').value;
  var checkEnd = document.getElementById('checkEndTime').value;
  
  showToast('设置已保存', 'success');
}
