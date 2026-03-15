// admin.js — Knight Traders Admin Panel

let allUsers = [];
let currentPaymentId = null;
let currentBrokerId = null;

// Global helper
function setEl(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

document.addEventListener('DOMContentLoaded', async () => {
  // Theme
  const saved = localStorage.getItem('kt_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  const themeBtn = document.getElementById('adminThemeBtn');
  if (themeBtn) {
    themeBtn.textContent = saved === 'dark' ? '☀️' : '🌙';
    themeBtn.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme') || 'dark';
      const nxt = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', nxt);
      localStorage.setItem('kt_theme', nxt);
      themeBtn.textContent = nxt === 'dark' ? '☀️' : '🌙';
    });
  }
  await checkAdmin();
  initTabs();
  await loadStats();
  // Preload all sections in background so data is ready when tabs are clicked
  await Promise.all([
    loadPayments(),
    loadUsers(),
    loadBrokers(),
    loadAdminKYC(),
    loadAdminWithdrawals(),
    loadAdminReferrals(),
    loadSettings(),
    loadMfxRecords()
  ]);
  initLogout();
});

// ===================== AUTH CHECK =====================
async function checkAdmin() {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    const data = await res.json();
    if (!data.success || data.user.role !== 'admin') {
      window.location.href = '/'; return;
    }
  } catch (e) { window.location.href = '/'; }
}

// ===================== TABS =====================
function initTabs() {
  document.querySelectorAll('.sb-link').forEach(link => {
    link.addEventListener('click', async e => {
      e.preventDefault();
      const tab = link.dataset.tab;
      document.querySelectorAll('.sb-link').forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      const pane = document.getElementById('tab-' + tab);
      if (pane) pane.classList.add('active');
      // Update breadcrumb
      const label = link.querySelector('.sb-label');
      const bc = document.getElementById('bc-section');
      if (bc && label) bc.textContent = label.textContent.trim();
      if (tab === 'admin-payments')    await loadPayments();
      if (tab === 'admin-users')       await loadUsers();
      if (tab === 'admin-brokers')     await loadBrokers();
      if (tab === 'admin-referrals')   await loadAdminReferrals();
      if (tab === 'admin-kyc')         await loadAdminKYC();
      if (tab === 'admin-withdrawals') await loadAdminWithdrawals();
      if (tab === 'admin-settings')    await loadSettings();
      if (tab === 'admin-myfxbook')    await loadMfxRecords();
    });
  });

  // Modal closes
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });
  document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) m.classList.remove('on'); });
  });
}

function openModal(id) { document.getElementById(id).classList.add('on'); }
function closeModal(id) { document.getElementById(id).classList.remove('on'); }

// ===================== STATS =====================
async function loadStats() {
  try {
    const res = await fetch('/api/admin/stats', { credentials: 'include' });
    const data = await res.json();
    if (!data.success) return;
    const s = data.stats;
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('st_users', s.totalUsers);
    set('st_active', s.activeUsers);
    set('st_pending', s.pendingPayments);
    set('st_verified', s.totalPayments);
    set('st_revenue', '$' + s.totalRevenue.toFixed(0));
    set('st_brokers', s.brokerAccounts);
    const badge = document.getElementById('pendingBadge');
    if (badge) { badge.textContent = s.pendingPayments; badge.style.display = s.pendingPayments > 0 ? 'inline-flex' : 'none'; }
  } catch (e) {}
}

// ===================== PAYMENTS =====================
function getPlanFromAmount(amount, planLabel) {
  // Use stored plan_label first, fallback to amount detection
  if (planLabel && planLabel !== 'undefined' && planLabel !== 'null') return planLabel;
  const amt = parseFloat(amount);
  if (amt <= 50)  return '1 Month';
  if (amt <= 120) return '3 Months';
  if (amt <= 250) return '6 Months';
  return '12 Months';
}

async function loadPayments() {
  const tbody = document.getElementById('adminPaymentsBody');
  try {
    const res = await fetch('/api/admin/payments', { credentials: 'include' });
    const data = await res.json();
    if (!data.payments || data.payments.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-row">No payments yet.</td></tr>'; return;
    }
    tbody.innerHTML = data.payments.map((p, i) => {
      const plan = getPlanFromAmount(p.amount, p.plan_label);
      // Date: show verified_at if approved, else submitted_at
      const dateRaw = (p.status === 'verified' && p.verified_at) ? p.verified_at : p.submitted_at;
      const date = dateRaw ? new Date(dateRaw).toLocaleDateString('en-GB', {day:'2-digit',month:'short',year:'numeric'}) : '—';
      const dateLabel = (p.status === 'verified' && p.verified_at) ? 'Approved' : 'Submitted';

      const isVerified = p.status === 'verified';
      const isPending  = p.status === 'pending';

      const statusBadge = isVerified
        ? `<span style="color:#22c55e;font-size:12px;font-weight:700">✅ Approved</span>`
        : isPending
          ? `<span style="color:#f59e0b;font-size:12px;font-weight:700">⏳ Pending</span>`
          : `<span style="color:#ef4444;font-size:12px;font-weight:700">❌ Rejected</span>`;

      const actionBtn = `
        <div style="display:flex;flex-direction:column;gap:6px;align-items:center">
          <button onclick="togglePayment(${p.id}, 'verify', this)"
            style="width:80px;padding:5px 0;border-radius:20px;border:none;cursor:pointer;font-size:11px;font-weight:700;
            background:${isVerified ? '#22c55e' : '#1e293b'};
            color:${isVerified ? '#fff' : '#22c55e'};
            border:1.5px solid #22c55e;transition:all 0.2s">
            🟢 ON
          </button>
          <button onclick="togglePayment(${p.id}, 'unverify', this)"
            style="width:80px;padding:5px 0;border-radius:20px;border:none;cursor:pointer;font-size:11px;font-weight:700;
            background:${isPending ? '#f59e0b' : '#1e293b'};
            color:${isPending ? '#fff' : '#f59e0b'};
            border:1.5px solid #f59e0b;transition:all 0.2s">
            🔴 OFF
          </button>
        </div>`;

      return `
      <tr>
        <td>${i + 1}</td>
        <td><strong>${p.full_name}</strong><br><span style="color:var(--grey);font-size:11px">${p.email}</span></td>
        <td><span style="color:var(--gold)">${p.member_id}</span></td>
        <td><div style="font-size:13px;color:var(--txt-2)">${plan}</div></td>
        <td><div style="font-weight:700;color:var(--gold);font-size:14px">$${p.amount}</div></td>
        <td>${p.screenshot_path
          ? `<img src="/api/admin/screenshot/${p.screenshot_path}" onclick="openPaymentModal(${p.id}, '${p.screenshot_path}', '${p.member_id}', '${p.full_name}')" style="width:48px;height:40px;object-fit:cover;border-radius:4px;cursor:pointer;border:1px solid var(--border);display:block" title="Click to view full screenshot">`
          : '<span style="color:var(--txt-3)">—</span>'}</td>
        <td>${statusBadge}</td>
        <td style="font-size:11px">
          <div style="color:var(--txt-2)">${date}</div>
          <div style="color:var(--txt-3);margin-top:2px">${dateLabel}</div>
        </td>
        <td>${actionBtn}</td>
      </tr>`;
    }).join('');
  } catch (e) { tbody.innerHTML = '<tr><td colspan="8" class="empty-row">Error loading.</td></tr>'; }
}

// Toggle payment verified / pending
async function togglePayment(id, action, btnEl) {
  try {
    const res = await fetch(`/api/admin/payments/${id}/verify`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, note: '' })
    });
    const data = await res.json();
    if (data.success) {
      showToast(action === 'verify' ? '✅ Payment Verified' : '⏳ Payment Pending',
                action === 'verify' ? 'Member has been activated.' : 'Payment reset to pending.');
      await loadPayments();
      await loadStats();
    } else {
      showToast('Error', data.message || 'Something went wrong.');
    }
  } catch (e) {
    showToast('Error', 'Could not update payment.');
  }
}

// Quick reject without opening modal
async function quickRejectPayment(id, name) {
  const note = prompt(`Rejection reason for ${name}:`) || 'Payment could not be verified. Please resubmit.';
  if (note === null) return; // cancelled
  try {
    const res = await fetch(`/api/admin/payments/${id}/verify`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject', note })
    });
    const data = await res.json();
    if (data.success) {
      showToast('❌ Payment Rejected', `${name} has been notified.`);
      await loadPayments(); await loadStats();
    } else showToast('❌ Error', data.message, true);
  } catch(e) { showToast('❌ Error', 'Connection error.', true); }
}
function openPaymentModal(id, screenshot, memberId, name) {
  currentPaymentId = id;
  const content = document.getElementById('paymentViewContent');
  content.innerHTML = `
    <div style="padding:4px 0 12px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;padding:12px 16px;background:rgba(201,168,76,0.07);border:1px solid rgba(201,168,76,0.18);border-radius:8px">
        <div style="width:38px;height:38px;border-radius:50%;background:rgba(201,168,76,0.2);display:flex;align-items:center;justify-content:center;font-size:18px">👤</div>
        <div>
          <div style="font-weight:700;color:var(--txt,#fff);font-size:14px">${name}</div>
          <div style="font-size:12px;color:var(--gold,#c9a84c);margin-top:1px">${memberId}</div>
        </div>
      </div>
      ${screenshot ? `
        <div style="border:1px solid rgba(201,168,76,0.2);border-radius:8px;overflow:hidden;margin-bottom:4px">
          <div style="padding:8px 12px;background:rgba(0,0,0,0.3);font-size:11px;font-weight:700;color:var(--txt-3,#888);letter-spacing:1px;border-bottom:1px solid rgba(255,255,255,0.06)">📷 PAYMENT SCREENSHOT</div>
          <img src="/api/admin/screenshot/${screenshot}" style="width:100%;max-height:320px;object-fit:contain;display:block;background:#0d1117;cursor:zoom-in" onclick="window.open(this.src,'_blank')">
          <div style="padding:8px 12px;font-size:11px;color:var(--txt-3,#888)">Click image to open full size</div>
        </div>
      ` : `
        <div style="padding:20px;text-align:center;background:rgba(0,0,0,0.2);border:1px dashed rgba(255,255,255,0.1);border-radius:8px;color:var(--txt-3,#888);font-size:13px">
          📷 No screenshot uploaded by member
        </div>
      `}
    </div>
  `;
  document.getElementById('adminNote').value = '';
  openModal('paymentModal');
}

async function verifyPayment(action) {
  const note = document.getElementById('adminNote').value;
  try {
    const res = await fetch(`/api/admin/payments/${currentPaymentId}/verify`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, note })
    });
    const data = await res.json();
    if (data.success) {
      closeModal('paymentModal');
      showToast(action === 'verify' ? '✅ Verified' : '❌ Rejected', data.message);
      await loadPayments();
      await loadStats();
    } else { showToast('❌ Error', data.message, true); }
  } catch (e) { showToast('❌ Error', 'Connection error.', true); }
}

// ===================== USERS =====================
async function loadUsers() {
  const tbody = document.getElementById('adminUsersBody');
  try {
    const res = await fetch('/api/admin/users', { credentials: 'include' });
    const data = await res.json();
    allUsers = data.users || [];
    renderUsers(allUsers);
  } catch (e) { tbody.innerHTML = '<tr><td colspan="8" class="empty-row">Error loading.</td></tr>'; }
}

function renderUsers(users) {
  const tbody = document.getElementById('adminUsersBody');
  if (!users || users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-row">No members yet.</td></tr>'; return;
  }
  tbody.innerHTML = users.map((u, i) => {
    const kycColors = { not_submitted:'var(--txt-3,#666)', pending:'#f59e0b', verified:'#22c55e', rejected:'#ef4444' };
    const kycIcons  = { not_submitted:'—', pending:'⏳ Pending', verified:'✅ Verified', rejected:'❌ Rejected' };
    const kycStatus = u.kyc_status || 'not_submitted';
    return `
    <tr>
      <td>${i + 1}</td>
      <td><strong style="color:var(--gold)">${u.member_id}</strong></td>
      <td>${u.full_name}<br><span style="font-size:11px;color:var(--txt-3)">${u.phone||''}</span></td>
      <td style="font-size:12px">${u.email}</td>
      <td>${getUserBadge(u.status)}</td>
      <td><span style="font-size:12px;font-weight:700;color:${kycColors[kycStatus]}">${kycIcons[kycStatus]}</span></td>
      <td>${getEABadge(u.ea_status)}</td>
      <td style="font-size:12px">${new Date(u.created_at).toLocaleDateString('en-GB')}</td>
      <td style="display:flex;gap:6px;flex-wrap:wrap">
        ${u.status !== 'active' ? `<button class="action-btn activate" onclick="updateUserStatus(${u.id},'active',null)">Activate</button>` : ''}
        ${u.status === 'active' ? `<button class="action-btn reject" onclick="updateUserStatus(${u.id},'pending',null)">Suspend</button>` : ''}
        ${u.ea_status !== 'active' ? `<button class="action-btn verify" onclick="updateUserStatus(${u.id},null,'active')">EA On</button>` : ''}
        ${u.ea_status === 'active' ? `<button class="action-btn reject" onclick="updateUserStatus(${u.id},null,'inactive')">EA Off</button>` : ''}
      </td>
    </tr>`;
  }).join('');
}

function filterUsers() {
  const q = document.getElementById('userSearch').value.toLowerCase();
  const filtered = allUsers.filter(u =>
    u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.member_id.toLowerCase().includes(q)
  );
  renderUsers(filtered);
}

async function updateUserStatus(id, status, ea_status) {
  try {
    const res = await fetch(`/api/admin/users/${id}/status`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, ea_status })
    });
    const data = await res.json();
    if (data.success) { showToast('✅ Updated', data.message); await loadUsers(); await loadStats(); }
    else showToast('❌ Error', data.message, true);
  } catch (e) { showToast('❌ Error', 'Connection error.', true); }
}

// ===================== BROKERS =====================
async function loadBrokers() {
  const tbody = document.getElementById('adminBrokersBody');
  try {
    const res = await fetch('/api/admin/brokers', { credentials: 'include' });
    const data = await res.json();
    if (!data.accounts || data.accounts.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-row">No broker accounts submitted yet.</td></tr>'; return;
    }
    tbody.innerHTML = data.accounts.map((b, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><strong>${b.full_name}</strong><br><span style="color:var(--gold);font-size:11px">${b.member_id}</span></td>
        <td>${b.broker_name}</td>
        <td><code style="color:var(--gold)">${b.account_login}</code></td>
        <td style="font-size:12px">${b.server_name}</td>
        <td>${getBrokerStatusBadge(b.status)}</td>
        <td>
          <button class="action-btn view" onclick="viewBroker(${b.id}, '${b.broker_name}', '${b.account_login}', '${b.server_name}', '${b.account_type}')">🔍 View Details</button>
        </td>
      </tr>
    `).join('');
  } catch (e) { tbody.innerHTML = '<tr><td colspan="7" class="empty-row">Error loading.</td></tr>'; }
}

function viewBroker(id, broker, login, server, type) {
  currentBrokerId = id;
  const content = document.getElementById('brokerViewContent');
  content.innerHTML = `
    <div class="broker-details-grid">
      <div class="bd-row"><div class="bd-label">Broker</div><div class="bd-value">${broker}</div></div>
      <div class="bd-row"><div class="bd-label">Account Login</div><div class="bd-value">${login}</div></div>
      <div class="bd-row"><div class="bd-label">Server</div><div class="bd-value">${server}</div></div>
      <div class="bd-row"><div class="bd-label">Account Type</div><div class="bd-value">${type}</div></div>
    </div>
    <div style="background:rgba(231,76,60,0.08);border:1px solid rgba(231,76,60,0.2);padding:12px 14px;margin-top:16px;font-size:12px;color:rgba(231,76,60,0.8)">
      ⚠️ Password is stored securely. Use it only to configure EA on the broker platform.
    </div>
  `;
  openModal('brokerViewModal');
}

async function updateEAStatus(status) {
  try {
    const res = await fetch(`/api/admin/brokers/${currentBrokerId}/ea-activate`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ea_status: status })
    });
    const data = await res.json();
    if (data.success) { closeModal('brokerViewModal'); showToast('✅ Done', data.message); await loadBrokers(); }
    else showToast('❌ Error', data.message, true);
  } catch (e) { showToast('❌ Error', 'Connection error.', true); }
}

// ===================== SETTINGS =====================
async function loadSettings() {
  try {
    const res  = await fetch('/api/admin/settings', { credentials: 'include' });
    const data = await res.json();
    if (!data.success) return;
    const s = data.settings;
    const set = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
    set('set_title',    s.account_title);
    set('set_usdt',     s.usdt_address);
    set('set_binance',  s.binance_id);
    set('set_fee',      s.monthly_fee);
    set('set_qfee',     s.quarterly_fee);
    set('set_6fee',     s.sixmonth_fee);
    set('set_yfee',     s.yearly_fee);
    set('set_rebate',   s.referral_rebate);
    set('set_ref',      s.referral_link);
    set('set_discord',  s.discord_invite);
    set('set_telegram', s.telegram_id);
  } catch(e) {}
}

async function saveSettings() {
  const g = id => document.getElementById(id)?.value || '';
  const body = {
    account_title:   g('set_title'),
    usdt_address:    g('set_usdt'),
    binance_id:      g('set_binance'),
    monthly_fee:     g('set_fee'),
    quarterly_fee:   g('set_qfee'),
    sixmonth_fee:    g('set_6fee'),
    yearly_fee:      g('set_yfee'),
    referral_rebate: g('set_rebate'),
    referral_link:   g('set_ref'),
    discord_invite:  g('set_discord'),
    telegram_id:     g('set_telegram'),
  };
  const msgEl = document.getElementById('set_msg');
  try {
    const res  = await fetch('/api/admin/settings', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    msgEl.className = `fmsg ${data.success ? 'ok' : 'err'}`;
    msgEl.textContent = data.message;
    if (data.success) showToast('✅ Saved', 'Settings updated successfully.');
  } catch (e) { msgEl.className = 'fmsg err'; msgEl.textContent = 'Error saving.'; }
}

// ===================== REFERRALS (ADMIN) =====================
async function loadAdminReferrals() {
  try {
    const res  = await fetch('/api/admin/referrals', { credentials: 'include' });
    const data = await res.json();
    if (!data.success) return;

    // Stats
    const total   = data.total || 0;
    const paid    = data.referrals?.filter(r => r.rebate_status === 'paid').length || 0;
    const pending = total - paid;
    const paidAmt = data.referrals?.filter(r => r.rebate_status === 'paid').reduce((s,r) => s+r.rebate_amount, 0) || 0;
    const setEl = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = v; };
    setEl('ar_total',      total);
    setEl('ar_paid',       paid + ' paid');
    setEl('ar_pending',    pending + ' pending');
    setEl('ar_total_paid', '$' + paidAmt.toFixed(2));

    // Referrers table
    const rBody = document.getElementById('referrerTableBody');
    if (rBody && data.byReferrer?.length > 0) {
      rBody.innerHTML = data.byReferrer.map(r => `<tr>
        <td><strong>${r.referrer_name}</strong><br><small style="color:var(--txt-3)">${r.referrer_email}</small></td>
        <td style="font-family:'Courier New',monospace;color:var(--gold)">${r.referrer_member_id}</td>
        <td>${r.total}</td>
        <td><span class="badge badge-active">${r.paid}</span></td>
        <td><span class="badge badge-pending">${r.pending}</span></td>
        <td style="color:var(--gold);font-weight:700">$${r.total_earned.toFixed(2)}</td>
      </tr>`).join('');
    } else if (rBody) {
      rBody.innerHTML = '<tr><td class="empty-td" colspan="6">No referrals yet.</td></tr>';
    }

    // All records table
    const aBody = document.getElementById('refAllBody');
    if (aBody && data.referrals?.length > 0) {
      aBody.innerHTML = data.referrals.map(r => {
        const isPaid  = r.rebate_status === 'paid';
        const acStat  = r.referred_account_status === 'active'
          ? '<span class="badge badge-active">Active</span>'
          : '<span class="badge badge-pending">Pending</span>';
        const rebBadge = isPaid
          ? `<span class="badge badge-active">$${r.rebate_amount} Paid ✓</span>`
          : `<span class="badge badge-pending">$${r.rebate_amount} Pending</span>`;
        return `<tr>
          <td><strong>${r.referrer_name}</strong><br><small style="color:var(--gold)">${r.referrer_member_id}</small></td>
          <td>${r.referred_name}<br><small style="color:var(--txt-3)">${r.referred_member_id}</small></td>
          <td style="font-size:12px">${r.referred_email}</td>
          <td>${(r.joined_at||'').split('T')[0]}</td>
          <td>${acStat}</td>
          <td>${rebBadge}</td>
        </tr>`;
      }).join('');
    } else if (aBody) {
      aBody.innerHTML = '<tr><td class="empty-td" colspan="7">No referral records found.</td></tr>';
    }
  } catch(e) { console.error('Admin referrals error:', e); }
}

// ===================== LOGOUT =====================
function initLogout() {
  const btn = document.getElementById('adminLogout');
  if (btn) btn.addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    window.location.href = '/';
  });
}

// ===================== BADGE HELPERS =====================
function getPayBadge(s) {
  const m = { pending: 'badge-pending', verified: 'badge-verified', rejected: 'badge-rejected' };
  return `<span class="badge ${m[s] || 'badge-pending'}">${s}</span>`;
}
function getUserBadge(s) {
  const m = { pending: 'badge-pending', active: 'badge-active', inactive: 'badge-inactive' };
  return `<span class="badge ${m[s] || 'badge-pending'}">${s}</span>`;
}
function getEABadge(s) {
  return s === 'active' ? '<span class="badge badge-active">🟢 Active</span>' : '<span class="badge badge-inactive">⚫ Off</span>';
}
function getBrokerStatusBadge(s) {
  return `<span class="badge badge-pending">${s}</span>`;
}

// ===================== TOAST =====================
let toastTimer;
function showToast(title, msg, isError = false) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  document.getElementById('toastTitle').textContent = title;
  document.getElementById('toastMsg').textContent = msg;
  toast.style.borderLeftColor = isError ? '#E74C3C' : '#C9A84C';
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 4000);
}

// ══════════════════════════════════════════════
//   ADMIN KYC
// ══════════════════════════════════════════════
async function loadAdminKYC() {
  const container = document.getElementById('kycCardsContainer');
  const tbody = document.getElementById('kycTableBody');
  if (container) container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--txt-3)">⏳ Loading KYC submissions...</div>';

  try {
    const res = await fetch('/api/admin/kyc', { credentials: 'include' });
    const data = await res.json();
    if (!data.success) {
      if (container) container.innerHTML = '<div style="text-align:center;padding:40px;color:#ef4444">❌ Failed to load KYC data. Check server.</div>';
      return;
    }

    const kyc = data.kyc || [];
    const pending  = kyc.filter(k => k.kyc_status === 'pending').length;
    const verified = kyc.filter(k => k.kyc_status === 'verified').length;
    const rejected = kyc.filter(k => k.kyc_status === 'rejected').length;

    setEl('kyc_pending_count',  pending);
    setEl('kyc_verified_count', verified);
    setEl('kyc_rejected_count', rejected);

    const badge = document.getElementById('kycPendingBadge');
    if (badge) { badge.textContent = pending; badge.style.display = pending > 0 ? 'inline-flex' : 'none'; }

    // Use card layout if container exists, else fallback to table
    if (container) {
      if (kyc.length === 0) {
        container.innerHTML = `
          <div style="text-align:center;padding:60px 20px;color:var(--txt-3)">
            <div style="font-size:48px;margin-bottom:16px">🪪</div>
            <div style="font-size:16px;font-weight:600;color:var(--txt-2)">No KYC submissions yet</div>
            <div style="font-size:13px;margin-top:8px">When clients upload their NIC documents, they will appear here.</div>
          </div>`;
        return;
      }
      container.innerHTML = kyc.map(k => renderKycCard(k)).join('');
      // Load images with auth credentials after DOM is ready
      preloadKycImages(kyc);
    } else if (tbody) {
      if (kyc.length === 0) { tbody.innerHTML = '<tr><td class="empty-td" colspan="7">No KYC submissions yet.</td></tr>'; return; }
      tbody.innerHTML = kyc.map(k => {
        const statusColors = { pending:'#f59e0b', verified:'#22c55e', rejected:'#ef4444' };
        const statusIcons  = { pending:'⏳', verified:'✅', rejected:'❌' };
        const col = statusColors[k.kyc_status] || 'var(--txt-2)';
        const ico = statusIcons[k.kyc_status] || '—';
        const date = k.kyc_submitted_at ? new Date(k.kyc_submitted_at).toLocaleDateString('en-GB') : '—';
        const frontUrl = k.nic_front ? `/api/admin/kyc-image/${k.nic_front}` : null;
        const backUrl  = k.nic_back  ? `/api/admin/kyc-image/${k.nic_back}`  : null;
        const actionBtns = k.kyc_status === 'pending' ? `
          <button onclick="openKycReview(${JSON.stringify(k).replace(/"/g,'&quot;')})" style="padding:6px 12px;background:var(--gold,#c9a84c);color:#000;border:none;cursor:pointer;font-size:11px;font-weight:700;border-radius:4px">🔍 REVIEW</button>
        ` : `<span style="color:${col};font-weight:700;font-size:12px">${ico} ${k.kyc_status.toUpperCase()}</span>`;
        return `<tr>
          <td><div style="font-weight:700;color:var(--txt)">${k.full_name}</div><div style="font-size:11px;color:var(--txt-3)">${k.member_id}</div></td>
          <td style="color:var(--txt-2);font-size:12px">${k.email}</td>
          <td>${frontUrl ? `<button onclick="viewKycImage('${frontUrl}')" style="padding:5px 10px;background:transparent;color:var(--gold);border:1px solid var(--gold);cursor:pointer;font-size:12px;font-weight:700;border-radius:4px">📷 Front</button>` : '<span style="color:var(--txt-3)">—</span>'}</td>
          <td>${backUrl  ? `<button onclick="viewKycImage('${backUrl}')"  style="padding:5px 10px;background:transparent;color:var(--gold);border:1px solid var(--gold);cursor:pointer;font-size:12px;font-weight:700;border-radius:4px">📷 Back</button>`  : '<span style="color:var(--txt-3)">—</span>'}</td>
          <td style="font-size:12px;color:var(--txt-2)">${date}</td>
          <td><span style="color:${col};font-weight:700;font-size:12px">${ico} ${k.kyc_status.charAt(0).toUpperCase()+k.kyc_status.slice(1)}</span></td>
          <td>${actionBtns}</td>
        </tr>`;
      }).join('');
    }

  } catch(e) {
    console.error('KYC load error:', e);
    if (container) container.innerHTML = '<div style="text-align:center;padding:40px;color:#ef4444">❌ Network error loading KYC data.</div>';
  }
}

function renderKycCard(k) {
  const statusColors = { pending:'#f59e0b', verified:'#22c55e', rejected:'#ef4444' };
  const statusBg     = { pending:'rgba(245,158,11,0.1)', verified:'rgba(34,197,94,0.1)', rejected:'rgba(239,68,68,0.1)' };
  const statusIcons  = { pending:'⏳', verified:'✅', rejected:'❌' };
  const col   = statusColors[k.kyc_status] || '#888';
  const bg    = statusBg[k.kyc_status]    || 'rgba(255,255,255,0.05)';
  const ico   = statusIcons[k.kyc_status] || '—';
  const date  = k.kyc_submitted_at ? new Date(k.kyc_submitted_at).toLocaleDateString('en-GB', {day:'2-digit',month:'short',year:'numeric'}) : '—';
  const frontUrl = k.nic_front ? `/api/admin/kyc-image/${k.nic_front}` : null;
  const backUrl  = k.nic_back  ? `/api/admin/kyc-image/${k.nic_back}`  : null;
  const kData = JSON.stringify(k).replace(/\\/g,'\\\\').replace(/'/g,"\\'");

  return `
  <div style="background:var(--card,#1a2235);border:1px solid ${col}44;border-left:4px solid ${col};border-radius:10px;padding:20px;margin-bottom:16px">
    <!-- Header -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:10px">
      <div>
        <div style="font-size:16px;font-weight:700;color:var(--txt)">${k.full_name}</div>
        <div style="font-size:12px;color:var(--gold);margin-top:2px">${k.member_id}</div>
        <div style="font-size:12px;color:var(--txt-3);margin-top:2px">${k.email}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
        <span style="background:${bg};color:${col};border:1px solid ${col}55;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700">${ico} ${k.kyc_status.toUpperCase()}</span>
        <span style="font-size:11px;color:var(--txt-3)">Submitted: ${date}</span>
      </div>
    </div>

    <!-- NIC Images -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.08);border-radius:8px;overflow:hidden">
        <div style="padding:8px 12px;font-size:11px;font-weight:700;color:var(--txt-3);letter-spacing:1px;border-bottom:1px solid rgba(255,255,255,0.06)">NIC FRONT</div>
        ${frontUrl ? `
          <div style="position:relative;cursor:pointer" onclick="viewKycImage('${frontUrl}')">
            <img id="kycimg_front_${k.id}" style="width:100%;height:130px;object-fit:cover;display:block;background:#111" alt="NIC Front">
            <div style="position:absolute;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 0.2s" 
                 onmouseenter="this.style.opacity=1" onmouseleave="this.style.opacity=0">
              <span style="color:#fff;font-size:13px;font-weight:700">🔍 Click to View</span>
            </div>
          </div>
          <div style="padding:8px 12px;display:flex;gap:8px">
            <button onclick="viewKycImage('${frontUrl}')" style="flex:1;padding:6px;background:rgba(201,168,76,0.15);color:var(--gold,#c9a84c);border:1px solid rgba(201,168,76,0.3);border-radius:5px;cursor:pointer;font-size:11px;font-weight:700">👁 View</button>
            <button onclick="downloadKycImage('${frontUrl}','${k.member_id}_NIC_Front')" style="flex:1;padding:6px;background:rgba(255,255,255,0.05);color:var(--txt-2);border:1px solid rgba(255,255,255,0.1);border-radius:5px;cursor:pointer;font-size:11px;font-weight:700">⬇ Download</button>
          </div>
        ` : `<div style="height:130px;display:flex;align-items:center;justify-content:center;color:var(--txt-3);font-size:12px">Not uploaded</div>`}
      </div>
      <div style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.08);border-radius:8px;overflow:hidden">
        <div style="padding:8px 12px;font-size:11px;font-weight:700;color:var(--txt-3);letter-spacing:1px;border-bottom:1px solid rgba(255,255,255,0.06)">NIC BACK</div>
        ${backUrl ? `
          <div style="position:relative;cursor:pointer" onclick="viewKycImage('${backUrl}')">
            <img id="kycimg_back_${k.id}" style="width:100%;height:130px;object-fit:cover;display:block;background:#111" alt="NIC Back">
            <div style="position:absolute;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 0.2s"
                 onmouseenter="this.style.opacity=1" onmouseleave="this.style.opacity=0">
              <span style="color:#fff;font-size:13px;font-weight:700">🔍 Click to View</span>
            </div>
          </div>
          <div style="padding:8px 12px;display:flex;gap:8px">
            <button onclick="viewKycImage('${backUrl}')" style="flex:1;padding:6px;background:rgba(201,168,76,0.15);color:var(--gold,#c9a84c);border:1px solid rgba(201,168,76,0.3);border-radius:5px;cursor:pointer;font-size:11px;font-weight:700">👁 View</button>
            <button onclick="downloadKycImage('${backUrl}','${k.member_id}_NIC_Back')" style="flex:1;padding:6px;background:rgba(255,255,255,0.05);color:var(--txt-2);border:1px solid rgba(255,255,255,0.1);border-radius:5px;cursor:pointer;font-size:11px;font-weight:700">⬇ Download</button>
          </div>
        ` : `<div style="height:130px;display:flex;align-items:center;justify-content:center;color:var(--txt-3);font-size:12px">Not uploaded</div>`}
      </div>
    </div>

    <!-- Action Buttons -->
    ${k.kyc_status === 'pending' ? `
    <div style="display:flex;gap:10px">
      <button onclick="verifyKYC(${k.id},'approve')" style="flex:1;padding:12px;background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;letter-spacing:0.5px">
        ✅ APPROVE KYC
      </button>
      <button onclick="verifyKYC(${k.id},'reject')" style="flex:1;padding:12px;background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;letter-spacing:0.5px">
        ❌ REJECT KYC
      </button>
    </div>
    ` : k.kyc_status === 'rejected' ? `
    <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:8px;padding:10px 14px;font-size:12px;color:rgba(239,68,68,0.9)">
      ❌ Rejected${k.kyc_note ? ` — Reason: ${k.kyc_note}` : ''}
      <button onclick="verifyKYC(${k.id},'approve')" style="margin-left:12px;padding:4px 10px;background:rgba(34,197,94,0.2);color:#22c55e;border:1px solid rgba(34,197,94,0.3);border-radius:4px;cursor:pointer;font-size:11px;font-weight:700">Re-Approve</button>
    </div>
    ` : `
    <div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.2);border-radius:8px;padding:10px 14px;font-size:12px;color:#22c55e">
      ✅ KYC Verified${k.kyc_verified_at ? ` on ${new Date(k.kyc_verified_at).toLocaleDateString('en-GB')}` : ''}
    </div>
    `}
  </div>`;
}

// Load KYC images with auth credentials
async function preloadKycImages(kyc) {
  for (const k of kyc) {
    if (k.nic_front) loadKycImgEl(`kycimg_front_${k.id}`, `/api/admin/kyc-image/${k.nic_front}`);
    if (k.nic_back)  loadKycImgEl(`kycimg_back_${k.id}`,  `/api/admin/kyc-image/${k.nic_back}`);
  }
}

async function loadKycImgEl(elId, url) {
  try {
    const el = document.getElementById(elId);
    if (!el) return;
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return;
    const blob = await res.blob();
    el.src = URL.createObjectURL(blob);
  } catch(e) {}
}

async function verifyKYC(userId, action) {
  let note = '';
  if (action === 'reject') {
    note = prompt('Rejection reason (will be sent to client):') || 'Documents unclear. Please resubmit.';
    if (note === null) return; // cancelled
  }
  try {
    const res = await fetch(`/api/admin/kyc/${userId}/verify`, {
      method: 'POST', credentials: 'include',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ action, note })
    });
    const data = await res.json();
    if (data.success) {
      showToast(action === 'approve' ? '✅ KYC Approved' : '❌ KYC Rejected', `Client has been notified.`);
      loadAdminKYC();
    } else {
      showToast('❌ Error', data.message || 'Failed.', true);
    }
  } catch(e) { showToast('❌ Error', 'Network error.', true); }
}

// Open KYC image in new tab using session credentials
async function viewKycImage(url) {
  try {
    showToast('⏳ Loading', 'Opening image...'); 
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) { showToast('❌ Error', 'Image not found or access denied.', true); return; }
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(`<!DOCTYPE html><html><head><title>KYC Document</title><style>body{margin:0;background:#0a0a0a;display:flex;justify-content:center;align-items:center;min-height:100vh;flex-direction:column}img{max-width:95vw;max-height:90vh;object-fit:contain;border:1px solid #333;border-radius:4px}p{color:#666;font-family:sans-serif;font-size:12px;margin-top:12px}</style></head><body><img src="${objectUrl}"><p>KYC Document — Knight Traders Admin</p></body></html>`);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    }
  } catch(e) { showToast('❌ Error', 'Could not load image.', true); }
}

// Download KYC image
async function downloadKycImage(url, filename) {
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) { showToast('❌ Error', 'Could not download image.', true); return; }
    const blob = await res.blob();
    const ext = blob.type.includes('png') ? '.png' : blob.type.includes('webp') ? '.webp' : '.jpg';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename + ext;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    showToast('⬇ Downloaded', `${filename}${ext} saved.`);
  } catch(e) { showToast('❌ Error', 'Download failed.', true); }
}

// ─── WITHDRAWAL REQUESTS ─────────────────────────────────────────────────────

async function loadAdminWithdrawals() {
  try {
    const res  = await fetch('/api/admin/withdrawals', { credentials: 'include' });
    const data = await res.json();
    if (!data.success) return;

    // Update badge
    const badge = document.getElementById('wdPendingBadge');
    const count = document.getElementById('wdPendingCount');
    if (badge) { badge.textContent = data.pending_count; badge.style.display = data.pending_count > 0 ? 'inline' : 'none'; }
    if (count) count.textContent = `${data.pending_count} Pending`;

    const tbody = document.getElementById('wdTableBody');
    if (!tbody) return;

    if (!data.withdrawals || data.withdrawals.length === 0) {
      tbody.innerHTML = '<tr><td class="empty-td" colspan="7">No withdrawal requests yet.</td></tr>';
      return;
    }

    tbody.innerHTML = data.withdrawals.map(w => {
      // Date + Time formatted properly
      const rawDate = w.requested_at || w.processed_at || '';
      const dateObj  = rawDate ? new Date(rawDate.replace(' ','T')) : null;
      const dateStr  = dateObj ? dateObj.toLocaleDateString('en-GB',  {day:'2-digit', month:'short', year:'numeric'}) : '—';
      const timeStr  = dateObj ? dateObj.toLocaleTimeString('en-GB',  {hour:'2-digit', minute:'2-digit'}) : '';

      const wallet = w.wallet_address || '—';

      // Status badge
      const statusCfg = {
        pending:  { color:'#f59e0b', bg:'rgba(245,158,11,0.1)',  border:'rgba(245,158,11,0.3)',  icon:'⏳', label:'Pending'  },
        approved: { color:'#22c55e', bg:'rgba(34,197,94,0.1)',   border:'rgba(34,197,94,0.3)',   icon:'✅', label:'Approved' },
        rejected: { color:'#ef4444', bg:'rgba(239,68,68,0.1)',   border:'rgba(239,68,68,0.3)',   icon:'❌', label:'Rejected' }
      };
      const sc = statusCfg[w.status] || statusCfg.pending;
      const statusBadge = `<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;background:${sc.bg};border:1px solid ${sc.border};border-radius:20px;font-size:11px;font-weight:700;color:${sc.color}">${sc.icon} ${sc.label}</span>`;

      const actionBtns = w.status === 'pending' ? `
        <div style="display:flex;flex-direction:column;gap:5px">
          <button onclick="processWithdrawal(${w.id},'approve')" class="action-btn approve">✅ Approve</button>
          <button onclick="processWithdrawal(${w.id},'reject')"  class="action-btn reject">❌ Reject</button>
        </div>
      ` : `<span style="font-size:11px;color:var(--txt-3);font-style:italic">${w.admin_note || 'Done'}</span>`;

      return `<tr>
        <td>
          <div style="font-weight:600;color:var(--txt);font-size:13px">${dateStr}</div>
          <div style="font-size:11px;color:var(--txt-3);margin-top:2px">${timeStr}</div>
        </td>
        <td>
          <div style="font-weight:700;color:var(--txt)">${w.full_name}</div>
          <div style="font-size:11px;color:var(--gold);margin-top:2px">${w.member_id}</div>
        </td>
        <td>
          <span style="font-size:16px;font-weight:700;color:var(--gold)">$${parseFloat(w.amount).toFixed(2)}</span>
        </td>
        <td>
          <span style="font-family:monospace;font-size:11px;color:var(--txt-2);word-break:break-all;display:block;max-width:180px">${wallet}</span>
        </td>
        <td>${statusBadge}</td>
        <td>${actionBtns}</td>
      </tr>`;
    }).join('');

  } catch(e) { console.error('Withdrawal load error', e); }
}

async function processWithdrawal(id, action) {
  let note = '';
  if (action === 'reject') {
    note = prompt('Rejection reason (amount will be refunded to client):') || 'Request rejected by admin.';
    if (note === null) return; // cancelled
  } else {
    if (!confirm(`Approve this withdrawal request? Make sure you have sent the payment to the client's wallet.`)) return;
  }

  try {
    const res  = await fetch(`/api/admin/withdrawals/${id}/process`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, note })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`✅ Withdrawal ${action === 'approve' ? 'Approved' : 'Rejected'}`, 'Client has been notified.');
      loadAdminWithdrawals();
    } else {
      showToast('❌ Error', data.message || 'Failed.', true);
    }
  } catch(e) { showToast('❌ Error', 'Network error.', true); }
}

// ===================== MYFXBOOK RECORDS =====================

async function loadMfxRecords() {
  const grid = document.getElementById('mfxRecordsGrid');
  const badge = document.getElementById('mfxBadge');
  if (!grid) return;
  grid.innerHTML = '<div style="grid-column:1/-1;padding:40px;text-align:center;color:var(--txt3)">Loading...</div>';
  try {
    const res  = await fetch('/api/admin/myfxbook', { credentials: 'include' });
    const data = await res.json();
    if (!data.success) { grid.innerHTML = '<div style="grid-column:1/-1;padding:40px;text-align:center;color:var(--red)">Failed to load records.</div>'; return; }
    const records = data.records || [];
    // Update badge
    if (badge) { badge.textContent = records.length; badge.style.display = records.length ? 'flex' : 'none'; }
    if (!records.length) {
      grid.innerHTML = `<div style="grid-column:1/-1;padding:60px;text-align:center;color:var(--txt3)">
        <div style="font-size:48px;margin-bottom:16px;opacity:0.3">📊</div>
        <div style="font-family:'Cinzel',serif;letter-spacing:2px;margin-bottom:8px">NO RECORDS YET</div>
        <div style="font-size:13px">Click "+ Add Record" to add your first Myfxbook portfolio.</div>
      </div>`; return;
    }
    grid.innerHTML = records.map(r => buildAdminMfxCard(r)).join('');
  } catch(e) {
    grid.innerHTML = '<div style="grid-column:1/-1;padding:40px;text-align:center;color:var(--red)">Network error.</div>';
  }
}

function buildAdminMfxCard(r) {
  const gain   = r.gain     != null ? r.gain + '%'    : 'N/A';
  const dd     = r.drawdown != null ? r.drawdown + '%' : 'N/A';
  const trades = r.trades   || 'N/A';
  const gainColor = parseFloat(r.gain) >= 0 ? '#10b981' : '#ef4444';
  const updatedDate = r.last_updated ? new Date(r.last_updated).toLocaleString() : 'Never';
  return `
  <div style="background:var(--card);border:1px solid var(--border);border-top:3px solid var(--gold);padding:20px;position:relative">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
      <div>
        <div style="font-family:'Cinzel',serif;font-size:15px;color:var(--txt);font-weight:700">${r.display_name}</div>
        <a href="${r.myfxbook_url}" target="_blank" style="font-size:11px;color:var(--blue3);word-break:break-all">${r.myfxbook_url.substring(0,50)}...</a>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;margin-left:8px">
        <button onclick="refreshMfxRecord(${r.id})" class="btn" title="Refresh from Myfxbook" style="padding:6px 10px;font-size:11px;background:var(--card2)">🔄</button>
        <button onclick="editMfxRecord(${r.id})" class="btn btn-gold" title="Edit" style="padding:6px 10px;font-size:11px">✏️</button>
        <button onclick="deleteMfxRecord(${r.id})" class="btn btn-red" title="Delete" style="padding:6px 10px;font-size:11px">🗑️</button>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:10px 0;border-top:1px solid var(--border);border-bottom:1px solid var(--border);margin-bottom:10px">
      <div><div style="font-family:'Cinzel',serif;font-size:18px;font-weight:700;color:${gainColor}">${gain}</div><div style="font-size:9px;color:var(--txt3);letter-spacing:1px">GAIN</div></div>
      <div><div style="font-family:'Cinzel',serif;font-size:18px;font-weight:700;color:var(--gold)">${dd}</div><div style="font-size:9px;color:var(--txt3);letter-spacing:1px">DRAWDOWN</div></div>
      <div><div style="font-family:'Cinzel',serif;font-size:18px;font-weight:700;color:var(--blue3)">${trades}</div><div style="font-size:9px;color:var(--txt3);letter-spacing:1px">TRADES</div></div>
    </div>
    ${r.custom_quote ? `<div style="font-size:12px;color:var(--txt2);font-style:italic;margin-bottom:8px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">"${r.custom_quote}"</div>` : ''}
    <div style="display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:10px;color:var(--txt3)">Last updated: ${updatedDate}</span>
      <span style="font-size:10px;padding:2px 8px;background:rgba(16,185,129,0.1);color:#10b981;border:1px solid rgba(16,185,129,0.2)">✓ VERIFIED</span>
    </div>
  </div>`;
}

// ── Open add modal ──
function openMfxAddModal() {
  document.getElementById('mfxModalTitle').textContent = '📊 Add Myfxbook Record';
  document.getElementById('mfx_edit_id').value = '';
  document.getElementById('mfx_name').value = '';
  document.getElementById('mfx_url').value = '';
  document.getElementById('mfx_location').value = '';
  document.getElementById('mfx_plan').value = '';
  document.getElementById('mfx_quote').value = '';
  document.getElementById('mfxScraped').style.display = 'none';
  document.getElementById('mfx_msg').className = 'fmsg';
  document.getElementById('mfx_msg').textContent = '';
  openModal('mfxModal');
}

// ── Edit existing record ──
async function editMfxRecord(id) {
  try {
    const res  = await fetch(`/api/admin/myfxbook/${id}`, { credentials: 'include' });
    const data = await res.json();
    if (!data.success) return;
    const r = data.record;
    document.getElementById('mfxModalTitle').textContent = '✏️ Edit Myfxbook Record';
    document.getElementById('mfx_edit_id').value = r.id;
    document.getElementById('mfx_name').value = r.display_name || '';
    document.getElementById('mfx_url').value = r.myfxbook_url || '';
    document.getElementById('mfx_location').value = r.location || '';
    document.getElementById('mfx_plan').value = r.plan_type || '';
    document.getElementById('mfx_quote').value = r.custom_quote || '';
    // Show scraped data if available
    if (r.gain != null) {
      showScrapedData({ gain: r.gain, drawdown: r.drawdown, trades: r.trades, account_type: r.account_type, currency: r.currency, balance: r.balance });
    }
    document.getElementById('mfx_msg').className = 'fmsg';
    document.getElementById('mfx_msg').textContent = '';
    openModal('mfxModal');
  } catch(e) { showToast('❌ Error', 'Failed to load record.', true); }
}

// ── Scrape & preview ──
async function scrapeAndPreview() {
  const url  = document.getElementById('mfx_url').value.trim();
  const msgEl = document.getElementById('mfx_msg');
  const btn  = document.getElementById('mfxScrapeBtn');
  if (!url) { msgEl.className = 'fmsg err'; msgEl.textContent = 'Please enter a Myfxbook URL.'; return; }
  if (!url.includes('myfxbook.com')) { msgEl.className = 'fmsg err'; msgEl.textContent = 'Please enter a valid Myfxbook URL.'; return; }

  btn.disabled = true; btn.textContent = '⏳ Scraping...';
  msgEl.className = 'fmsg'; msgEl.textContent = '';

  try {
    const res  = await fetch('/api/admin/myfxbook/scrape', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await res.json();
    if (data.success && data.data) {
      showScrapedData(data.data);
      msgEl.className = 'fmsg ok'; msgEl.textContent = '✓ Data scraped successfully! Review and save.';
    } else {
      msgEl.className = 'fmsg err'; msgEl.textContent = data.message || 'Scrape failed. Check URL or try again.';
      document.getElementById('mfxScraped').style.display = 'none';
    }
  } catch(e) {
    msgEl.className = 'fmsg err'; msgEl.textContent = 'Network error during scrape.';
  } finally {
    btn.disabled = false; btn.textContent = '🔍 Scrape & Preview';
  }
}

function showScrapedData(d) {
  const wrap = document.getElementById('mfxScraped');
  const dataEl = document.getElementById('mfxScrapedData');
  const fields = [
    { label: 'Gain',        val: d.gain     != null ? d.gain + '%' : '—' },
    { label: 'Drawdown',    val: d.drawdown != null ? d.drawdown + '%' : '—' },
    { label: 'Trades',      val: d.trades   || '—' },
    { label: 'Acc. Type',   val: d.account_type || '—' },
    { label: 'Currency',    val: d.currency || '—' },
    { label: 'Balance',     val: d.balance  ? '$' + Number(d.balance).toLocaleString() : '—' },
  ];
  dataEl.innerHTML = fields.map(f => `
    <div style="background:rgba(16,185,129,0.05);padding:8px 10px">
      <div style="font-size:14px;font-weight:700;color:#10b981;font-family:'Cinzel',serif">${f.val}</div>
      <div style="font-size:9px;color:rgba(255,255,255,0.35);letter-spacing:1px">${f.label.toUpperCase()}</div>
    </div>`).join('');
  wrap.style.display = 'block';
}

// ── Save record (add or update) ──
async function saveMfxRecord() {
  const id       = document.getElementById('mfx_edit_id').value;
  const name     = document.getElementById('mfx_name').value.trim();
  const url      = document.getElementById('mfx_url').value.trim();
  const location = document.getElementById('mfx_location').value.trim();
  const plan     = document.getElementById('mfx_plan').value;
  const quote    = document.getElementById('mfx_quote').value.trim();
  const msgEl    = document.getElementById('mfx_msg');

  if (!name) { msgEl.className = 'fmsg err'; msgEl.textContent = 'Display name is required.'; return; }
  if (!url)  { msgEl.className = 'fmsg err'; msgEl.textContent = 'Myfxbook URL is required.'; return; }

  const btn = document.getElementById('mfxSaveBtn');
  btn.disabled = true; btn.textContent = '⏳ Saving...';

  try {
    const endpoint = id ? `/api/admin/myfxbook/${id}` : '/api/admin/myfxbook';
    const method   = id ? 'PUT' : 'POST';
    const res = await fetch(endpoint, {
      method, credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: name, myfxbook_url: url, location, plan_type: plan, custom_quote: quote })
    });
    const data = await res.json();
    if (data.success) {
      showToast('✅ Saved', id ? 'Record updated.' : 'New Myfxbook record added and will appear on website.');
      closeModal('mfxModal');
      await loadMfxRecords();
    } else {
      msgEl.className = 'fmsg err'; msgEl.textContent = data.message || 'Save failed.';
    }
  } catch(e) { msgEl.className = 'fmsg err'; msgEl.textContent = 'Network error.'; }
  finally { btn.disabled = false; btn.textContent = '💾 Save Record'; }
}

// ── Refresh (re-scrape) ──
async function refreshMfxRecord(id) {
  if (!confirm('Re-scrape this record from Myfxbook? This will update the stored stats.')) return;
  showToast('⏳ Refreshing', 'Scraping latest data from Myfxbook...');
  try {
    const res  = await fetch(`/api/admin/myfxbook/${id}/refresh`, { method: 'POST', credentials: 'include' });
    const data = await res.json();
    if (data.success) { showToast('✅ Refreshed', 'Stats updated from Myfxbook.'); await loadMfxRecords(); }
    else showToast('❌ Failed', data.message || 'Refresh failed.', true);
  } catch(e) { showToast('❌ Error', 'Network error.', true); }
}

// ── Delete ──
async function deleteMfxRecord(id) {
  if (!confirm('Delete this Myfxbook record? It will be removed from the website testimonials.')) return;
  try {
    const res  = await fetch(`/api/admin/myfxbook/${id}`, { method: 'DELETE', credentials: 'include' });
    const data = await res.json();
    if (data.success) { showToast('🗑️ Deleted', 'Record removed.'); await loadMfxRecords(); }
    else showToast('❌ Error', data.message || 'Delete failed.', true);
  } catch(e) { showToast('❌ Error', 'Network error.', true); }
}

// ── Password Recovery Lookup ──────────────────────────────────
async function lookupPassword() {
  const email   = document.getElementById('recoveryEmail').value.trim();
  const result  = document.getElementById('recoveryResult');
  const details = document.getElementById('recoveryDetails');
  const errEl   = document.getElementById('recoveryError');
  result.style.display = 'none';
  errEl.style.display  = 'none';
  if (!email) { errEl.textContent = 'Please enter an email.'; errEl.style.display = 'block'; return; }
  try {
    const res  = await fetch(`/api/auth/recover-password/${encodeURIComponent(email)}`, { credentials: 'include' });
    const data = await res.json();
    if (data.success) {
      const u = data.user;
      details.innerHTML = `
        <b style="color:var(--txt1)">Name:</b> ${u.full_name}<br>
        <b style="color:var(--txt1)">Email:</b> ${u.email}<br>
        <b style="color:var(--txt1)">Member ID:</b> ${u.member_id}<br>
        <b style="color:var(--txt1)">Joined:</b> ${new Date(u.created_at).toLocaleDateString()}<br>
        <b style="color:#fbbf24">Password:</b> <span style="font-family:monospace;background:rgba(251,191,36,0.1);padding:3px 8px;color:#fbbf24">${u.plain_password}</span>
      `;
      result.style.display = 'block';
    } else {
      errEl.textContent = data.message || 'User not found.';
      errEl.style.display = 'block';
    }
  } catch(e) {
    errEl.textContent = 'Network error.';
    errEl.style.display = 'block';
  }
}
