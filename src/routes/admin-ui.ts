// src/routes/admin-ui.ts — Admin dashboard HTML UI
// Serves a self-contained SPA at /admin (gated by admin email check)

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>English Coach — Admin</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#0f1117;--card:#1a1d27;--border:#2a2d3a;--text:#e4e6ef;--muted:#8b8fa3;--accent:#6366f1;--green:#22c55e;--red:#ef4444;--yellow:#f59e0b}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:var(--bg);color:var(--text);min-height:100vh}
.login{display:flex;align-items:center;justify-content:center;min-height:100vh}
.login form{background:var(--card);padding:40px;border-radius:16px;border:1px solid var(--border);width:400px;max-width:90vw}
.login h1{font-size:24px;margin-bottom:8px}
.login p{color:var(--muted);margin-bottom:24px}
.login input{width:100%;padding:12px 16px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:15px;margin-bottom:12px}
.login button{width:100%;padding:12px;background:var(--accent);color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer}
.login .err{color:var(--red);margin-top:8px;font-size:13px}
.dashboard{display:none;max-width:1280px;margin:0 auto;padding:24px}
.dashboard.active{display:block}
header{display:flex;justify-content:space-between;align-items:center;padding:20px 0;border-bottom:1px solid var(--border);margin-bottom:24px}
header h1{font-size:22px}
header .logout{background:var(--card);border:1px solid var(--border);color:var(--text);padding:8px 16px;border-radius:8px;cursor:pointer;font-size:13px}
nav{display:flex;gap:4px;margin-bottom:24px;background:var(--card);border-radius:10px;padding:4px;width:fit-content}
nav button{padding:10px 20px;border:none;background:none;color:var(--muted);border-radius:8px;cursor:pointer;font-size:14px;font-weight:500}
nav button.active{background:var(--accent);color:#fff}
.stats-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;margin-bottom:32px}
.stat-card{background:var(--card);padding:20px 24px;border-radius:12px;border:1px solid var(--border)}
.stat-card .label{color:var(--muted);font-size:13px;margin-bottom:8px}
.stat-card .value{font-size:28px;font-weight:700}
.stat-card .value.green{color:var(--green)}
.stat-card .value.blue{color:var(--accent)}
.stat-card .value.yellow{color:var(--yellow)}
.panel{display:none}
.panel.active{display:block}
table{width:100%;border-collapse:collapse;background:var(--card);border-radius:12px;overflow:hidden;border:1px solid var(--border)}
th{text-align:left;padding:12px 16px;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border);background:rgba(255,255,255,.02)}
td{padding:12px 16px;font-size:14px;border-bottom:1px solid var(--border)}
tr:last-child td{border-bottom:none}
.badge{display:inline-block;padding:2px 10px;border-radius:20px;font-size:12px;font-weight:600}
.badge.free{background:rgba(139,143,163,.15);color:var(--muted)}
.badge.pro{background:rgba(99,102,241,.15);color:var(--accent)}
.badge.premium{background:rgba(245,158,11,.15);color:var(--yellow)}
.broadcast-form{background:var(--card);padding:24px;border-radius:12px;border:1px solid var(--border);max-width:600px}
.broadcast-form label{display:block;color:var(--muted);font-size:13px;margin-bottom:6px;margin-top:16px}
.broadcast-form label:first-child{margin-top:0}
.broadcast-form input,.broadcast-form textarea{width:100%;padding:12px 16px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;margin-bottom:4px}
.broadcast-form textarea{min-height:100px;resize:vertical}
.broadcast-form button{padding:12px 28px;background:var(--accent);color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;margin-top:16px}
.broadcast-form .hint{color:var(--muted);font-size:12px;margin-bottom:8px}
.result-msg{padding:12px 16px;border-radius:8px;margin-top:12px;font-size:14px}
.result-msg.success{background:rgba(34,197,94,.1);color:var(--green);border:1px solid rgba(34,197,94,.2)}
.result-msg.error{background:rgba(239,68,68,.1);color:var(--red);border:1px solid rgba(239,68,68,.2)}
.loading{color:var(--muted);padding:40px;text-align:center}
.empty{color:var(--muted);padding:40px;text-align:center;font-size:14px}
</style>
</head>
<body>

<!-- Login -->
<div id="login" class="login">
  <form onsubmit="login(event)">
    <h1>🎓 English Coach</h1>
    <p>Admin Dashboard</p>
    <input id="emailInput" type="email" placeholder="Admin email" required autofocus>
    <input id="passInput" type="password" placeholder="Password" required>
    <button type="submit">Sign in</button>
    <div id="loginErr" class="err"></div>
  </form>
</div>

<!-- Dashboard -->
<div id="app" class="dashboard">
  <header>
    <h1>🎓 English Coach <span style="color:var(--muted);font-weight:400;font-size:16px">Admin</span></h1>
    <button class="logout" onclick="doLogout()">Log out</button>
  </header>
  <nav>
    <button class="active" onclick="showPanel('overview',this)">Overview</button>
    <button onclick="showPanel('users',this)">Users</button>
    <button onclick="showPanel('ai',this)">AI Usage</button>
    <button onclick="showPanel('broadcast',this)">📢 Broadcast</button>
  </nav>

  <!-- Overview -->
  <div id="panel-overview" class="panel active">
    <div id="overviewStats" class="stats-grid"><div class="loading">Loading…</div></div>
    <h3 style="margin-bottom:12px;color:var(--muted);font-size:13px;text-transform:uppercase">Recent Analyses</h3>
    <div id="recentAnalyses"><div class="loading">Loading…</div></div>
  </div>

  <!-- Users -->
  <div id="panel-users" class="panel">
    <div id="usersList"><div class="loading">Loading…</div></div>
  </div>

  <!-- AI Usage -->
  <div id="panel-ai" class="panel">
    <div id="aiStatsGrid" class="stats-grid"><div class="loading">Loading…</div></div>
    <div id="aiUsageList"></div>
  </div>

  <!-- Broadcast -->
  <div id="panel-broadcast" class="panel">
    <form class="broadcast-form" onsubmit="sendBroadcast(event)">
      <h3 style="margin-bottom:16px">📢 Push Notification Broadcast</h3>
      <label>Title</label>
      <input id="bcTitle" placeholder="e.g. 🔥 今日挑戰!" required>
      <label>Body</label>
      <textarea id="bcBody" placeholder="Message content…" required></textarea>
      <label>Target (optional)</label>
      <input id="bcUser" placeholder="User ID — leave empty to send to all users">
      <div class="hint">Sends push notification to all users with notify_enabled = 1</div>
      <button type="submit">Send Broadcast</button>
      <div id="broadcastResult"></div>
    </form>
  </div>
</div>

<script>
const BASE = '';
let token = localStorage.getItem('admin_token');

function api(path, opts = {}) {
  return fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, ...opts.headers },
    ...opts,
  }).then(r => r.json().then(data => ({ ok: r.ok, status: r.status, data })));
}

async function login(e) {
  e.preventDefault();
  const email = document.getElementById('emailInput').value.trim();
  const password = document.getElementById('passInput').value;
  const errEl = document.getElementById('loginErr');
  errEl.textContent = '';

  // Login via auth endpoint
  const { ok, data } = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  if (!ok || !data.token) {
    errEl.textContent = data.error || 'Login failed';
    return;
  }

  // Check if user is admin
  token = data.token;
  localStorage.setItem('admin_token', token);

  // Test admin access
  const adminCheck = await api('/api/admin/stats');
  if (!adminCheck.ok) {
    errEl.textContent = 'You are not an admin. Check ADMIN_EMAILS in Cloudflare dashboard.';
    token = null;
    localStorage.removeItem('admin_token');
    return;
  }

  showDashboard();
}

function doLogout() {
  localStorage.removeItem('admin_token');
  token = null;
  document.getElementById('login').style.display = 'flex';
  document.getElementById('app').classList.remove('active');
}

function showDashboard() {
  document.getElementById('login').style.display = 'none';
  document.getElementById('app').classList.add('active');
  loadOverview();
}

function showPanel(name, btn) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  document.getElementById('panel-' + name).classList.add('active');
  if (btn) btn.classList.add('active');
  if (name === 'overview') loadOverview();
  if (name === 'users') loadUsers();
  if (name === 'ai') loadAiUsage();
}

// ── Overview ──
async function loadOverview() {
  const [{ data: stats }, { data: analyses }] = await Promise.all([
    api('/api/admin/stats'),
    api('/api/admin/recent-analyses'),
  ]);

  const grid = document.getElementById('overviewStats');
  if (!stats) { grid.innerHTML = '<div class="loading">Failed to load</div>'; return; }

  const u = stats.users || {};
  const a = stats.analyses || {};
  const v = stats.vocab || {};
  const s = stats.sessions || {};

  grid.innerHTML = [
    { label: 'Total Users', value: u.total||0, cls: 'blue' },
    { label: 'Active (7 days)', value: u.active7d||0, cls: 'green' },
    { label: 'Pro Users', value: u.pro||0, cls: 'yellow' },
    { label: 'Premium Users', value: u.premium||0, cls: 'yellow' },
    { label: 'Total Analyses', value: a.total||0, cls: 'blue' },
    { label: 'Analyses Today', value: a.today||0, cls: 'green' },
    { label: 'Total Vocab', value: v.total||0, cls: 'blue' },
    { label: 'Active Sessions', value: s.active||0, cls: 'green' },
  ].map(s => '<div class="stat-card"><div class="label">'+s.label+'</div><div class="value '+s.cls+'">'+s.value+'</div></div>').join('');

  const tbl = document.getElementById('recentAnalyses');
  if (!Array.isArray(analyses) || !analyses.length) {
    tbl.innerHTML = '<div class="empty">No analyses yet</div>'; return;
  }
  tbl.innerHTML = '<table><thead><tr><th>User</th><th>Scene</th><th>Score</th><th>CEFR</th><th>Words</th><th>When</th></tr></thead><tbody>' +
    analyses.slice(0,20).map(a => '<tr><td>'+he(a.user_email||a.user_id)+'</td><td>'+he(a.scene||'—')+'</td><td>'+(a.overall_score||'—')+'</td><td>'+(a.cefr_level||'—')+'</td><td>'+(a.word_count||'—')+'</td><td>'+fmtTime(a.created_at)+'</td></tr>').join('') +
    '</tbody></table>';
}

// ── Users ──
async function loadUsers() {
  const { data } = await api('/api/admin/users');
  const el = document.getElementById('usersList');
  if (!Array.isArray(data)) { el.innerHTML = '<div class="empty">No users</div>'; return; }
  el.innerHTML = '<table><thead><tr><th>Email</th><th>Name</th><th>Tier</th><th>Level</th><th>XP</th><th>Streak</th><th>Locale</th><th>Joined</th></tr></thead><tbody>' +
    data.map(u => '<tr><td>'+he(u.email)+'</td><td>'+he(u.display_name||'—')+'</td><td><span class="badge '+u.tier+'">'+u.tier+'</span></td><td>'+u.level+'</td><td>'+u.xp+'</td><td>🔥 '+u.streak+'</td><td>'+he(u.locale)+'</td><td>'+fmtTime(u.created_at)+'</td></tr>').join('') +
    '</tbody></table>';
}

// ── AI Usage ──
async function loadAiUsage() {
  const { data } = await api('/api/admin/ai-usage');
  const grid = document.getElementById('aiStatsGrid');
  const list = document.getElementById('aiUsageList');
  if (!Array.isArray(data)) {
    grid.innerHTML = '<div class="loading">Failed to load</div>';
    return;
  }
  const total = data.reduce((s,u) => s + (u.call_count||0), 0);
  const totalTok = data.reduce((s,u) => s + (u.tokens_used||0), 0);
  grid.innerHTML = [
    { label: 'Users Used AI Today', value: data.length, cls: 'blue' },
    { label: 'Total AI Calls Today', value: total, cls: 'green' },
    { label: 'Total Tokens Today', value: totalTok.toLocaleString(), cls: 'yellow' },
  ].map(s => '<div class="stat-card"><div class="label">'+s.label+'</div><div class="value '+s.cls+'">'+s.value+'</div></div>').join('');

  if (!data.length) { list.innerHTML = '<div class="empty">No AI usage today</div>'; return; }
  list.innerHTML = '<table style="margin-top:16px"><thead><tr><th>User ID</th><th>Date</th><th>Calls</th><th>Tokens</th></tr></thead><tbody>' +
    data.map(r => '<tr><td>'+he(r.user_id)+'</td><td>'+r.usage_date+'</td><td>'+r.call_count+'</td><td>'+r.tokens_used+'</td></tr>').join('') +
    '</tbody></table>';
}

// ── Broadcast ──
async function sendBroadcast(e) {
  e.preventDefault();
  const title = document.getElementById('bcTitle').value.trim();
  const body = document.getElementById('bcBody').value.trim();
  const userId = document.getElementById('bcUser').value.trim();
  const result = document.getElementById('broadcastResult');

  result.innerHTML = '';
  const { ok, data } = await api('/api/admin/broadcast', {
    method: 'POST',
    body: JSON.stringify({ title, body, user_id: userId || undefined }),
  });
  result.innerHTML = '<div class="result-msg '+(ok?'success':'error')+'">' +
    (ok ? '✅ Sent to '+data.sent+' users!' : '❌ '+(data.error||'Failed')) + '</div>';
  if (ok) { document.getElementById('bcTitle').value = ''; document.getElementById('bcBody').value = ''; }
}

function he(s) {
  if (!s) return '—';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmtTime(ts) {
  if (!ts) return '—';
  const d = new Date(typeof ts === 'number' ? ts : parseInt(ts));
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleDateString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
}

// Auto-login on load if token exists
if (token) {
  api('/api/admin/stats').then(({ ok }) => {
    if (ok) showDashboard();
    else { token = null; localStorage.removeItem('admin_token'); }
  });
}
</script>
</body>
</html>`;

export async function adminUIRoute(
  _request: Request,
  _env: any,
  _ctx: ExecutionContext,
  _userId: string | null,
): Promise<Response> {
  return new Response(HTML, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
