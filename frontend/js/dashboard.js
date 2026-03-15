// dashboard.js — Knight Traders User Dashboard
(function(){ const t=localStorage.getItem('kt_theme')||'dark'; document.documentElement.setAttribute('data-theme',t); })();
function _toggleTheme(){ const c=document.documentElement.getAttribute('data-theme')||'dark'; const n=c==='dark'?'light':'dark'; document.documentElement.setAttribute('data-theme',n); localStorage.setItem('kt_theme',n); const b=document.getElementById('dTheme')||document.getElementById('dashThemeToggle'); if(b) b.textContent=n==='dark'?'☀️':'🌙'; }

let currentUser = null;
let currentPayments = [];
let currentBroker = null;
let selectedPlan = { plan: 'monthly', amount: 50, label: 'Monthly — 1 Month' };

// Helper
function setEl(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

// THEME
function initTheme() {
  const saved = localStorage.getItem('kt_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  const btn = document.getElementById('dashThemeToggle');
  if (btn) btn.textContent = saved === 'dark' ? '☀️' : '🌙';
}
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('kt_theme', next);
  const btn = document.getElementById('dashThemeToggle');
  if (btn) btn.textContent = next === 'dark' ? '☀️' : '🌙';
}

// PLAN SELECTION
let discountApplied = false;
let discountPct = 0;

function selectPlan(el) {
  document.querySelectorAll('.plan-option').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  const amount = el.dataset.amount;
  const plan   = el.dataset.plan;
  const labels = {
    monthly:   'Monthly — 1 Month',
    quarterly: 'Quarterly — 3 Months',
    sixmonth:  '6 Months Plan',
    yearly:    'Annual — 12 Months'
  };
  selectedPlan = { plan, amount: parseInt(amount), label: labels[plan] || el.dataset.label || plan };
  updatePlanDisplay();
}

function updatePlanDisplay() {
  const labelEl  = document.getElementById('selectedPlanLabel');
  const amountEl = document.getElementById('selectedPlanAmount');
  if (labelEl)  labelEl.textContent  = selectedPlan.label;
  if (amountEl) {
    if (discountApplied && discountPct > 0) {
      const discounted = Math.round(selectedPlan.amount * (1 - discountPct/100) * 100) / 100;
      amountEl.innerHTML = `<span style="text-decoration:line-through;opacity:0.5;font-size:13px">$${selectedPlan.amount}.00</span> <span style="color:var(--success,#22c55e)">$${discounted.toFixed(2)} USDT</span>`;
    } else {
      amountEl.textContent = `$${selectedPlan.amount}.00 USDT`;
    }
  }
}


// ── DISCORD ──
async function openDiscord(e) {
  e.preventDefault();
  try {
    const res  = await fetch('/api/admin/settings', { credentials: 'include' });
    const data = await res.json();
    const url  = data.settings?.discord_invite || 'https://discord.gg/GgqRcUaGV';
    window.open(url, '_blank');
  } catch { window.open('https://discord.gg/GgqRcUaGV', '_blank'); }
}

// ── REFERRAL SYSTEM ──
let refData = null;

async function loadReferral() {
  try {
    const res  = await fetch('/api/referral/my', { credentials: 'include' });
    const data = await res.json();
    if (!data.success) return;
    refData = data;

    // Stats
    setEl('refTotal',   data.total_referrals);
    setEl('refPaid',    data.paid_referrals + ' paid');
    setEl('refPending', data.pending_earnings > 0 ? `$${data.pending_earnings} pending` : '—');
    setEl('refEarned',  `$${data.referral_earnings.toFixed(2)}`);

    // Referral link
    const origin = window.location.origin;
    const link   = `${origin}/?ref=${data.referral_code}`;
    setEl('refLinkDisplay', link);
    setEl('refCodeDisplay', data.referral_code);

    // Table
    const tbody = document.getElementById('refTableBody');
    if (!tbody) return;
    if (!data.referrals || data.referrals.length === 0) {
      tbody.innerHTML = '<tr><td class="empty-td" colspan="4">No referrals yet. Share your link to start earning!</td></tr>';
    } else {
      tbody.innerHTML = data.referrals.map(r => {
        const isPaid    = r.rebate_status === 'paid';
        const date      = r.joined_at ? r.joined_at.split('T')[0] : r.joined_at;
        const acStatus  = r.referred_status === 'active' ? '<span class="badge badge-active">Active</span>' : '<span class="badge badge-pending">Pending</span>';
        const rebateBadge = isPaid
          ? `<span class="badge badge-active">$${r.rebate_amount} Paid ✓</span>`
          : `<span class="badge badge-pending">$${r.rebate_amount} Pending</span>`;
        return `<tr>
          <td><strong>${r.referred_name}</strong><br><small style="color:var(--txt-3)">${r.referred_email}</small></td>
          <td>${date}</td>
          <td>${acStatus}</td>
          <td>${rebateBadge}</td>
        </tr>`;
      }).join('');
    }

    // ── WITHDRAWAL UI ──
    const earned    = data.referral_earnings || 0;
    const minWd     = data.min_withdrawal || 50;
    const canWd     = data.can_withdraw;
    const hasPending = (data.pending_withdrawals || 0) > 0;

    // Progress bar
    const pct = Math.min(100, (earned / minWd) * 100);
    const bar = document.getElementById('withdrawProgressBar');
    const lbl = document.getElementById('withdrawProgressLabel');
    if (bar) bar.style.width = pct + '%';
    if (lbl) lbl.textContent = `$${earned.toFixed(2)} / $${minWd}`;

    // Show/hide locked vs unlocked
    const locked   = document.getElementById('withdrawLocked');
    const unlocked = document.getElementById('withdrawUnlocked');
    const pending  = document.getElementById('withdrawPending');

    if (hasPending) {
      if (locked)   locked.style.display   = 'none';
      if (unlocked) unlocked.style.display = 'none';
      if (pending)  pending.style.display  = 'block';
    } else if (canWd) {
      if (locked)   locked.style.display   = 'none';
      if (unlocked) unlocked.style.display = 'block';
      if (pending)  pending.style.display  = 'none';
      const availEl = document.getElementById('withdrawAvailAmt');
      if (availEl) availEl.textContent = `$${earned.toFixed(2)}`;
    } else {
      if (locked)   locked.style.display   = 'block';
      if (unlocked) unlocked.style.display = 'none';
      if (pending)  pending.style.display  = 'none';
    }

    // Load withdrawal history
    loadWithdrawalHistory();

  } catch (err) { console.error('Referral load error:', err); }
}

async function loadWithdrawalHistory() {
  try {
    const res  = await fetch('/api/referral/withdrawals', { credentials: 'include' });
    const data = await res.json();
    const tbody = document.getElementById('withdrawHistoryBody');
    if (!tbody || !data.success) return;
    if (!data.withdrawals || data.withdrawals.length === 0) {
      tbody.innerHTML = '<tr><td class="empty-td" colspan="4">No withdrawal history yet.</td></tr>';
      return;
    }
    tbody.innerHTML = data.withdrawals.map(w => {
      const date = w.requested_at ? w.requested_at.split('T')[0] : '—';
      const wallet = w.wallet_address ? (w.wallet_address.length > 16 ? w.wallet_address.slice(0,16)+'...' : w.wallet_address) : '—';
      let badge = '';
      if (w.status === 'pending')  badge = '<span class="badge badge-pending">⏳ Pending</span>';
      if (w.status === 'approved') badge = '<span class="badge badge-active">✅ Approved</span>';
      if (w.status === 'rejected') badge = '<span class="badge" style="background:rgba(239,68,68,0.15);color:#EF4444">❌ Rejected</span>';
      return `<tr>
        <td>${date}</td>
        <td style="color:var(--gold);font-weight:700">$${w.amount.toFixed(2)}</td>
        <td><small style="font-family:monospace;color:var(--txt-2)">${wallet}</small></td>
        <td>${badge}</td>
      </tr>`;
    }).join('');
  } catch (err) { console.error('Withdrawal history error:', err); }
}

async function submitWithdrawal() {
  const wallet = document.getElementById('withdrawWallet')?.value?.trim();
  if (!wallet) { showToast('Error', 'Please enter your USDT TRC20 wallet address.', 'error'); return; }

  const btn = document.getElementById('withdrawBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Processing...'; }

  try {
    const res  = await fetch('/api/referral/withdraw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ wallet_address: wallet })
    });
    const data = await res.json();
    if (data.success) {
      // Show 24-hour notice alert
      const notice = document.getElementById('withdrawalNotice');
      if (notice) notice.style.display = 'block';
      showToast('✅ Request Submitted', '24 ghanton mein aapka withdrawal approve ho jayega. Pareshan na hon!', 'success');
      setTimeout(() => loadReferral(), 1500);
    } else {
      showToast('Error', data.message, 'error');
    }
  } catch (err) {
    showToast('Error', 'Network error. Please try again.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💸 REQUEST WITHDRAWAL'; }
  }
}

function copyRefLink() {
  const link = document.getElementById('refLinkDisplay')?.textContent;
  if (!link || link === 'Loading...') return;
  navigator.clipboard.writeText(link).then(() => showToast('Copied!', 'Referral link copied to clipboard.'));
}
function copyRefCode() {
  const code = document.getElementById('refCodeDisplay')?.textContent;
  if (!code || code === '—') return;
  navigator.clipboard.writeText(code).then(() => showToast('Copied!', 'Referral code copied!'));
}

// ===================== INIT =====================
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  const themeBtn = document.getElementById('dashThemeToggle');
  if (themeBtn) themeBtn.addEventListener('click', toggleTheme);
  await loadDashboard();
  initTabs();
  initUpload();
  initLogout();
  initNotifBtn();
  setDate();
});

function setDate() {
  const el = document.getElementById('overviewDate');
  if (el) el.textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

// ===================== LOAD DASHBOARD =====================
async function loadDashboard() {
  try {
    const res = await fetch('/api/user/dashboard', { credentials: 'include' });
    const data = await res.json();
    if (!data.success) { window.location.href = '/'; return; }

    currentUser = data.user;
    currentPayments = data.payments || [];
    currentBroker = data.broker;
    renderUser(data.user);
    renderPayments(data.payments);
    renderBrokerStatus(data.broker);
    checkOnboarding(data.user);
    renderChecklist(data.user, data.payments, data.broker);

    // Settings
    if (data.settings) {
      const usdtEl = document.getElementById('usdtAddr');
      const binEl = document.getElementById('binanceId');
      if (usdtEl && data.settings.usdt_address) usdtEl.textContent = data.settings.usdt_address;
      if (binEl && data.settings.binance_id) binEl.textContent = data.settings.binance_id;
    }

    // Unread notifs
    if (data.unread_notifications > 0) {
      const cnt = document.getElementById('notifCount');
      if (cnt) { cnt.textContent = data.unread_notifications; cnt.style.display = 'flex'; }
    }
  } catch (e) {
    window.location.href = '/';
  }
}

function renderUser(user) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '—'; };
  const initials = user.full_name.split(' ').map(n => n[0]).join('').substr(0, 2).toUpperCase();
  set('dashName', user.full_name);
  set('dashMemberId', 'ID: ' + user.member_id);
  const av = document.getElementById('dashAvatar'); if (av) av.textContent = initials;

  set('ov_member_id', user.member_id);
  set('ov_name', user.full_name);
  set('ov_email', user.email);
  set('ov_phone', user.phone || 'Not provided');
  set('ov_joined', new Date(user.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }));

  const statusEl = document.getElementById('overviewStatus');
  if (statusEl) statusEl.innerHTML = getBadge(user.status);
  const eaEl = document.getElementById('overviewEAStatus');
  if (eaEl) eaEl.innerHTML = getEABadge(user.ea_status);

  // Profile fields
  const pfn = document.getElementById('pf_name'); if (pfn) pfn.value = user.full_name;
  const pfp = document.getElementById('pf_phone'); if (pfp) pfp.value = user.phone || '';
}

function getPlanLabel(amount, stored) {
  if (stored && stored !== 'undefined' && stored !== 'null' && stored !== '') return stored;
  const a = parseFloat(amount);
  if (a <= 50)  return '1 Month';
  if (a <= 120) return '3 Months';
  if (a <= 250) return '6 Months';
  return '12 Months';
}

function renderPayments(payments) {
  // Support both old tbody and new card container
  const container = document.getElementById('paymentsCardContainer');
  const tbody     = document.getElementById('paymentsBody');

  if (!payments || payments.length === 0) {
    const empty = '<div style="text-align:center;padding:60px 20px;color:var(--txt-3)"><div style="font-size:40px;margin-bottom:12px">💳</div><div style="font-size:15px;font-weight:600;color:var(--txt-2)">No payments yet</div><div style="font-size:13px;margin-top:8px">Make your first payment to get started!</div></div>';
    if (container) container.innerHTML = empty;
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="empty-row">No payments yet.</td></tr>';
    return;
  }

  const cards = payments.map((p, i) => {
    const plan       = getPlanLabel(p.amount, p.plan_label);
    const submDate   = p.submitted_at ? new Date(p.submitted_at).toLocaleDateString('en-GB', {day:'2-digit',month:'short',year:'numeric'}) : '—';
    const verDate    = p.verified_at  ? new Date(p.verified_at).toLocaleDateString('en-GB',  {day:'2-digit',month:'short',year:'numeric'}) : null;

    // Status config
    const statusCfg = {
      pending:  { color:'#f59e0b', bg:'rgba(245,158,11,0.1)',  border:'rgba(245,158,11,0.25)',  icon:'⏳', label:'Pending Review' },
      verified: { color:'#22c55e', bg:'rgba(34,197,94,0.1)',   border:'rgba(34,197,94,0.25)',   icon:'✅', label:'Approved' },
      rejected: { color:'#ef4444', bg:'rgba(239,68,68,0.1)',   border:'rgba(239,68,68,0.25)',   icon:'❌', label:'Rejected' }
    };
    const s = statusCfg[p.status] || statusCfg.pending;

    // Screenshot — show thumbnail if available
    const screenshotSection = p.screenshot_name ? `
      <div style="border:1px solid rgba(255,255,255,0.08);border-radius:8px;overflow:hidden">
        <div style="padding:7px 12px;background:rgba(0,0,0,0.25);font-size:10px;font-weight:700;color:var(--txt-3);letter-spacing:1px;border-bottom:1px solid rgba(255,255,255,0.06)">📷 PAYMENT SCREENSHOT</div>
        <div style="padding:10px;font-size:11px;color:var(--txt-3);display:flex;align-items:center;gap:8px">
          <span style="font-size:20px">🖼</span>
          <span style="word-break:break-all">${p.screenshot_name}</span>
        </div>
      </div>` : '';

    // Note from admin
    const noteSection = p.admin_note ? `
      <div style="margin-top:10px;padding:10px 14px;background:rgba(201,168,76,0.07);border:1px solid rgba(201,168,76,0.2);border-radius:8px;font-size:12px;color:var(--txt-2)">
        💬 <strong style="color:var(--gold)">Admin Note:</strong> ${p.admin_note}
      </div>` : '';

    return `
    <div style="background:var(--card,#1a2235);border:1px solid ${s.border};border-left:4px solid ${s.color};border-radius:10px;padding:18px 20px;margin-bottom:14px">
      
      <!-- Top Row: # + Plan/Amount + Status -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:14px">
        
        <!-- Left: Serial + Plan + Amount -->
        <div style="display:flex;align-items:flex-start;gap:14px">
          <div style="width:28px;height:28px;border-radius:50%;background:rgba(201,168,76,0.15);border:1px solid rgba(201,168,76,0.3);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--gold);flex-shrink:0;margin-top:2px">${i+1}</div>
          <div>
            <div style="font-size:22px;font-weight:700;color:var(--gold);line-height:1">$${p.amount}</div>
            <div style="font-size:12px;color:var(--txt-3);margin-top:3px;font-weight:600">${plan}</div>
          </div>
        </div>

        <!-- Right: Status Badge + Dates -->
        <div style="text-align:right">
          <div style="display:inline-flex;align-items:center;gap:6px;padding:5px 14px;background:${s.bg};border:1px solid ${s.border};border-radius:20px;font-size:12px;font-weight:700;color:${s.color}">
            ${s.icon} ${s.label}
          </div>
          <div style="font-size:11px;color:var(--txt-3);margin-top:6px">Submitted: ${submDate}</div>
          ${verDate ? `<div style="font-size:11px;color:#22c55e;margin-top:2px">✅ Approved: ${verDate}</div>` : ''}
        </div>
      </div>

      <!-- Screenshot -->
      ${screenshotSection}

      <!-- Admin Note -->
      ${noteSection}

    </div>`;
  }).join('');

  if (container) container.innerHTML = cards;

  // Also update old tbody if exists (fallback)
  if (tbody) {
    tbody.innerHTML = payments.map((p, i) => {
      const plan = getPlanLabel(p.amount, p.plan_label);
      const date = p.submitted_at ? new Date(p.submitted_at).toLocaleDateString('en-GB') : '—';
      return `<tr><td>${i+1}</td><td><strong style="color:var(--gold)">$${p.amount}</strong><br><span style="font-size:11px;color:var(--txt-3)">${plan}</span></td><td>${p.screenshot_name || '—'}</td><td>${getPaymentBadge(p.status)}</td><td>${p.admin_note||'—'}</td><td>${date}</td><td>${p.verified_at ? new Date(p.verified_at).toLocaleDateString('en-GB') : '—'}</td></tr>`;
    }).join('');
  }
}

function renderBrokerStatus(broker) {
  const formDiv = document.getElementById('brokerForm');
  const submittedDiv = document.getElementById('brokerSubmittedInfo');
  if (!formDiv || !submittedDiv) return;
  if (broker) {
    submittedDiv.style.display = 'block';
    formDiv.style.display = 'none';
    const checkBroker = document.getElementById('checkBrokerIcon');
    if (checkBroker) { checkBroker.textContent = '✓'; checkBroker.classList.add('active'); }
  }
}

function renderChecklist(user, payments, broker) {
  const hasVerifiedPayment = payments && payments.some(p => p.status === 'verified');
  const hasPendingPayment = payments && payments.some(p => p.status === 'pending');

  if (hasVerifiedPayment || hasPendingPayment) {
    const ico = document.getElementById('checkPayIcon');
    if (ico) { ico.textContent = hasVerifiedPayment ? '✓' : '○'; if (hasVerifiedPayment) ico.classList.add('active'); }
  }
  if (user.ea_status === 'active') {
    const ico = document.getElementById('checkEAIcon'); if (ico) { ico.textContent = '✓'; ico.classList.add('active'); }
  }
}

// ===================== TABS =====================
function initTabs() {
  document.querySelectorAll('.sb-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const tab = link.dataset.tab;
      document.querySelectorAll('.sb-link').forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      const pane = document.getElementById('tab-' + tab);
      if (pane) pane.classList.add('active');
      if (tab === 'notifications')    loadNotifications();
      if (tab === 'payments-history') loadPaymentsHistory();
      if (tab === 'referral')         loadReferral();
    });
  });
}

// ===================== FILE UPLOAD =====================
function initUpload() {
  const input = document.getElementById('screenshotInput');
  const area = document.getElementById('uploadArea');
  if (!input) return;

  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    showFilePreview(file);
  });

  ['dragover', 'drop'].forEach(ev => {
    area.addEventListener(ev, e => { e.preventDefault(); });
  });
  area.addEventListener('drop', e => {
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      const dt = new DataTransfer(); dt.items.add(file);
      input.files = dt.files;
      showFilePreview(file);
    }
  });
}

function showFilePreview(file) {
  const preview = document.getElementById('filePreview');
  const thumb = document.getElementById('previewThumb');
  const nameEl = document.getElementById('previewName');
  const sizeEl = document.getElementById('previewSize');
  if (!preview) return;

  const reader = new FileReader();
  reader.onload = e => {
    thumb.innerHTML = `<img src="${e.target.result}" style="width:50px;height:50px;object-fit:cover;">`;
  };
  reader.readAsDataURL(file);

  nameEl.textContent = file.name;
  sizeEl.textContent = (file.size / 1024).toFixed(1) + ' KB';
  preview.style.display = 'flex';
}

function removeFile() {
  const input = document.getElementById('screenshotInput');
  const preview = document.getElementById('filePreview');
  if (input) input.value = '';
  if (preview) preview.style.display = 'none';
}

// ===================== SUBMIT PAYMENT =====================
async function submitPayment() {
  const input = document.getElementById('screenshotInput');
  if (!input || !input.files[0]) {
    showToast('⚠️ Required', 'Please upload your payment screenshot first.', true); return;
  }

  const formData = new FormData();
  formData.append('screenshot', input.files[0]);
  formData.append('plan', selectedPlan.plan);

  try {
    const btn = event.target;
    btn.disabled = true; btn.textContent = 'ANALYZING SCREENSHOT...';

    // --- AI Screenshot Analysis ---
    let aiAmount = null;
    try {
      const reader = new FileReader();
      const base64 = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(input.files[0]);
      });

      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 200,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: input.files[0].type || 'image/jpeg', data: base64 } },
              { type: 'text', text: 'This is a USDT payment screenshot. Extract the total amount paid in USD/USDT. Reply ONLY with a JSON object like: {"amount": 50.00}. If you cannot determine the amount, reply: {"amount": null}' }
            ]
          }]
        })
      });

      const aiData = await aiRes.json();
      const textContent = aiData.content?.find(c => c.type === 'text')?.text || '';
      const cleaned = textContent.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      aiAmount = parsed.amount;
    } catch (aiErr) {
      console.warn('AI analysis failed, proceeding without it:', aiErr);
    }

    if (aiAmount !== null && aiAmount !== undefined) {
      formData.append('ai_detected_amount', aiAmount);
    }

    btn.textContent = 'SUBMITTING...';

    const res = await fetch('/api/payments/submit', {
      method: 'POST', credentials: 'include', body: formData
    });
    const data = await res.json();

    btn.disabled = false; btn.textContent = 'SUBMIT PAYMENT PROOF';

    if (data.success) {
      showToast('✅ Submitted!', 'Payment screenshot submitted. Verification within 24 hours.');
      removeFile();
      await loadDashboard();
    } else {
      showToast('❌ Error', data.message, true);
    }
  } catch (e) {
    showToast('❌ Error', 'Connection error.', true);
  }
}

// ===================== SUBMIT BROKER =====================
async function submitBroker() {
  const broker = document.getElementById('br_broker').value;
  const login = document.getElementById('br_login').value.trim();
  const pass = document.getElementById('br_pass').value;
  const server = document.getElementById('br_server').value.trim();
  const type = document.getElementById('br_type').value;
  const msgEl = document.getElementById('br_msg');

  msgEl.className = 'form-msg'; msgEl.textContent = '';

  if (!broker || !login || !pass || !server) {
    msgEl.className = 'form-msg error'; msgEl.textContent = 'All fields are required.'; return;
  }

  try {
    const res = await fetch('/api/broker/submit', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ broker_name: broker, account_login: login, account_password: pass, server_name: server, account_type: type })
    });
    const data = await res.json();

    if (data.success) {
      msgEl.className = 'form-msg success'; msgEl.textContent = '✅ Broker account submitted successfully!';
      showToast('✅ Saved!', 'Broker account details submitted.');
      await loadDashboard();
    } else {
      msgEl.className = 'form-msg error'; msgEl.textContent = data.message;
    }
  } catch (e) {
    msgEl.className = 'form-msg error'; msgEl.textContent = 'Connection error.';
  }
}

// ===================== LOAD NOTIFICATIONS =====================
async function loadNotifications() {
  const listEl = document.getElementById('notifList');
  if (!listEl) return;
  try {
    const res = await fetch('/api/user/notifications', { credentials: 'include' });
    const data = await res.json();
    if (!data.notifications || data.notifications.length === 0) {
      listEl.innerHTML = '<div class="empty-state">No notifications yet.</div>'; return;
    }
    const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
    listEl.innerHTML = data.notifications.map(n => `
      <div class="notif-item ${n.is_read ? '' : 'unread'}">
        <div class="notif-icon">${icons[n.type] || 'ℹ️'}</div>
        <div>
          <div class="notif-title">${n.title}</div>
          <div class="notif-msg">${n.message}</div>
          <div class="notif-time">${new Date(n.created_at).toLocaleString('en-GB')}</div>
        </div>
      </div>
    `).join('');
    // Mark as read
    await fetch('/api/user/notifications/read', { method: 'POST', credentials: 'include' });
    const cnt = document.getElementById('notifCount');
    if (cnt) cnt.style.display = 'none';
  } catch (e) {
    listEl.innerHTML = '<div class="empty-state">Error loading notifications.</div>';
  }
}

async function markAllRead() {
  await fetch('/api/user/notifications/read', { method: 'POST', credentials: 'include' });
  const cnt = document.getElementById('notifCount');
  if (cnt) cnt.style.display = 'none';
  showToast('✓', 'All notifications marked as read.');
  loadNotifications();
}

function initNotifBtn() {
  const btn = document.getElementById('notifBtn');
  if (btn) btn.addEventListener('click', () => {
    document.querySelectorAll('.sb-link').forEach(l => l.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    const link = document.querySelector('.sb-link[data-tab="notifications"]');
    if (link) link.classList.add('active');
    const pane = document.getElementById('tab-notifications');
    if (pane) pane.classList.add('active');
    loadNotifications();
  });
}

// ===================== LOAD PAYMENTS HISTORY =====================
async function loadPaymentsHistory() {
  try {
    const res = await fetch('/api/payments/my', { credentials: 'include' });
    const data = await res.json();
    renderPayments(data.payments);
  } catch (e) {}
}

// ===================== PROFILE =====================
async function updateProfile() {
  const name = document.getElementById('pf_name').value.trim();
  const phone = document.getElementById('pf_phone').value.trim();
  const msgEl = document.getElementById('pf_msg');

  try {
    const res = await fetch('/api/user/profile/update', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: name, phone })
    });
    const data = await res.json();
    msgEl.className = `form-msg ${data.success ? 'success' : 'error'}`;
    msgEl.textContent = data.message;
    if (data.success) { showToast('✅ Updated', 'Profile updated successfully.'); await loadDashboard(); }
  } catch (e) { msgEl.className = 'form-msg error'; msgEl.textContent = 'Error updating profile.'; }
}

async function changePassword() {
  const current = document.getElementById('cp_current').value;
  const newPass = document.getElementById('cp_new').value;
  const msgEl = document.getElementById('cp_msg');

  if (!current || !newPass) { msgEl.className = 'form-msg error'; msgEl.textContent = 'Both fields required.'; return; }

  try {
    const res = await fetch('/api/user/password/change', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: current, new_password: newPass })
    });
    const data = await res.json();
    msgEl.className = `form-msg ${data.success ? 'success' : 'error'}`;
    msgEl.textContent = data.message;
    if (data.success) { document.getElementById('cp_current').value = ''; document.getElementById('cp_new').value = ''; }
  } catch (e) { msgEl.className = 'form-msg error'; msgEl.textContent = 'Error.'; }
}

// ===================== LOGOUT =====================
function initLogout() {
  const btn = document.getElementById('logoutBtn');
  if (btn) btn.addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    window.location.href = '/';
  });
}

// ===================== COPY =====================
function copyAddr(elId, btn) {
  const text = document.getElementById(elId).textContent;
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = '✅ Copied!';
    setTimeout(() => btn.textContent = '📋 Copy ' + (elId === 'binanceId' ? 'ID' : 'Address'), 2000);
    showToast('📋 Copied', 'Address copied to clipboard.');
  });
}

// ===================== BADGE HELPERS =====================
function getBadge(status) {
  const map = { pending: 'badge-pending', active: 'badge-active', inactive: 'badge-inactive' };
  return `<span class="badge ${map[status] || 'badge-pending'}">${status}</span>`;
}

function getEABadge(status) {
  return status === 'active'
    ? '<span class="badge badge-active">🟢 Running</span>'
    : '<span class="badge badge-inactive">⚫ Inactive</span>';
}

function getPaymentBadge(status) {
  const map = {
    pending: '<span class="badge badge-pending">Pending</span>',
    verified: '<span class="badge badge-verified">Verified</span>',
    rejected: '<span class="badge badge-rejected">Rejected</span>'
  };
  return map[status] || status;
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

// ══════════════════════════════════════════════════
//   ONBOARDING: AGREEMENT + KYC
// ══════════════════════════════════════════════════

let kycFrontFile = null;
let kycBackFile  = null;
let kycTabFrontFile = null;
let kycTabBackFile  = null;

// Called from loadDashboard after user is loaded
function checkOnboarding(user) {
  if (!user) return;

  // Set name in agreement
  const clientNameEls = ['agr_client_name','agr_sig_name','agr_checkbox_name','kyc_name_display','kyc_tab_name'];
  clientNameEls.forEach(id => { const el = document.getElementById(id); if(el) el.textContent = user.full_name || '—'; });

  // Set date
  const dateEl = document.getElementById('agr_date');
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-GB', {day:'2-digit',month:'long',year:'numeric'});

  // Update checklist
  const agrIcon = document.getElementById('checkAgrIcon');
  const kycIcon = document.getElementById('checkKycIcon');
  if (agrIcon) {
    if (user.agreement_signed) { agrIcon.textContent = '✓'; agrIcon.classList.add('active'); }
    else agrIcon.textContent = '○';
  }
  if (kycIcon) {
    if (user.kyc_status === 'verified') { kycIcon.textContent = '✓'; kycIcon.classList.add('active'); }
    else if (user.kyc_status === 'pending') kycIcon.textContent = '⏳';
    else kycIcon.textContent = '○';
  }

  // Update KYC tab status block
  renderKycTabStatus(user);

  // Show onboarding overlay based on verification status
  if (!user.agreement_signed) {
    showOnboarding('agreement');
  } else if (user.kyc_status === 'not_submitted') {
    showOnboarding('kyc');
  } else if (user.kyc_status === 'pending') {
    showOnboarding('kyc_pending');
  } else if (user.kyc_status === 'rejected') {
    showOnboarding('kyc_rejected');
    const reasonEl = document.getElementById('kyc_reject_reason');
    if (reasonEl) {
      reasonEl.textContent = user.kyc_note
        ? '📋 Admin note: ' + user.kyc_note
        : '📋 Documents unclear ya incomplete hain. Clear photos upload karein.';
    }
  }
  // kyc_status === 'verified' → dashboard fully unlocked
}

function showOnboarding(panel) {
  const overlay = document.getElementById('onboardingOverlay');
  if (!overlay) return;
  overlay.style.display = 'block';
  document.body.style.overflow = 'hidden';
  switchObPanel(panel);
}

function hideOnboarding() {
  const overlay = document.getElementById('onboardingOverlay');
  if (overlay) overlay.style.display = 'none';
  document.body.style.overflow = '';
}

function switchObPanel(name) {
  document.querySelectorAll('.ob-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById(`ob_panel_${name}`);
  if (panel) panel.classList.add('active');

  // Update steps
  const steps = ['agreement','kyc','done'];
  const idx = steps.indexOf(name);
  document.querySelectorAll('.ob-step').forEach((s, i) => {
    s.classList.remove('active','done');
    if (i < idx) s.classList.add('done');
    else if (i === idx) s.classList.add('active');
  });
}

// Agreement scroll check
function checkAgreementScroll() {
  const box = document.getElementById('agreementBox');
  if (!box) return;
  const nearBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 40;
  if (nearBottom) {
    const wrap = document.getElementById('agr_check_wrap');
    const hint = document.getElementById('agr_scroll_hint');
    if (wrap) { wrap.style.opacity = '1'; wrap.style.pointerEvents = 'auto'; }
    if (hint) hint.style.display = 'none';
    // Watch checkbox
    const cb = document.getElementById('agr_checkbox');
    if (cb && !cb._listenerAdded) {
      cb.addEventListener('change', () => {
        const btn = document.getElementById('agr_sign_btn');
        if (btn) {
          btn.disabled = !cb.checked;
          btn.style.opacity = cb.checked ? '1' : '0.5';
          btn.style.cursor = cb.checked ? 'pointer' : 'not-allowed';
        }
      });
      cb._listenerAdded = true;
    }
  }
}

// Sign agreement
async function signAgreement() {
  const btn = document.getElementById('agr_sign_btn');
  if (btn) { btn.textContent = 'Signing...'; btn.disabled = true; }
  try {
    const res = await fetch('/api/kyc/agree', {
      method: 'POST', credentials: 'include',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ signature_confirm: true })
    });
    const data = await res.json();
    if (data.success) {
      showToast('✅ Agreement Signed', 'Proceeding to KYC verification.');
      // Update step indicators
      const step1 = document.getElementById('ob_step1');
      if (step1) { step1.classList.remove('active'); step1.classList.add('done'); step1.querySelector('.ob-step-dot').textContent = '✓'; }
      switchObPanel('kyc');
      if (currentUser) currentUser.agreement_signed = 1;
      const agrIcon = document.getElementById('checkAgrIcon');
      if (agrIcon) { agrIcon.textContent = '✓'; agrIcon.classList.add('active'); }
    } else {
      showToast('❌ Error', data.message || 'Could not sign agreement.', true);
      if (btn) { btn.textContent = '✍️ SIGN AGREEMENT & CONTINUE'; btn.disabled = false; }
    }
  } catch(e) {
    showToast('❌ Error', 'Network error.', true);
    if (btn) { btn.textContent = '✍️ SIGN AGREEMENT & CONTINUE'; btn.disabled = false; }
  }
}

// Preview KYC images (onboarding modal)
function previewKYC(side, input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  if (side === 'front') {
    kycFrontFile = file;
    const prev = document.getElementById('kyc_front_preview');
    const zone = document.getElementById('kyc_front_zone');
    if (prev) { prev.src = URL.createObjectURL(file); prev.style.display = 'block'; }
    if (zone) zone.classList.add('has-file');
    // Update zone label
    const lbl = zone?.querySelector('.kyc-zone-hint');
    if (lbl) lbl.textContent = '✓ ' + file.name;
  } else {
    kycBackFile = file;
    const prev = document.getElementById('kyc_back_preview');
    const zone = document.getElementById('kyc_back_zone');
    if (prev) { prev.src = URL.createObjectURL(file); prev.style.display = 'block'; }
    if (zone) zone.classList.add('has-file');
    const lbl = zone?.querySelector('.kyc-zone-hint');
    if (lbl) lbl.textContent = '✓ ' + file.name;
  }
  // Enable submit if both uploaded
  const btn = document.getElementById('kyc_submit_btn');
  if (btn && kycFrontFile && kycBackFile) {
    btn.disabled = false; btn.style.opacity = '1'; btn.style.cursor = 'pointer';
  }
}

// Preview KYC images (dashboard tab)
function previewKYCTab(side, input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  if (side === 'front') {
    kycTabFrontFile = file;
    const prev = document.getElementById('kyc_front_tab_preview');
    const zone = document.getElementById('kyc_tab_front_zone');
    if (prev) { prev.src = URL.createObjectURL(file); prev.style.display = 'block'; }
    if (zone) zone.classList.add('has-file');
    const lbl = zone?.querySelector('.kyc-zone-hint');
    if (lbl) lbl.textContent = '✓ ' + file.name;
  } else {
    kycTabBackFile = file;
    const prev = document.getElementById('kyc_back_tab_preview');
    const zone = document.getElementById('kyc_tab_back_zone');
    if (prev) { prev.src = URL.createObjectURL(file); prev.style.display = 'block'; }
    if (zone) zone.classList.add('has-file');
    const lbl = zone?.querySelector('.kyc-zone-hint');
    if (lbl) lbl.textContent = '✓ ' + file.name;
  }
  const btn = document.getElementById('kyc_tab_submit_btn');
  if (btn && kycTabFrontFile && kycTabBackFile) {
    btn.disabled = false; btn.style.opacity = '1'; btn.style.cursor = 'pointer';
  }
}

// Submit KYC from onboarding modal
async function submitKYC() {
  if (!kycFrontFile || !kycBackFile) return showToast('⚠️ Required', 'Upload both NIC images.', true);
  const btn = document.getElementById('kyc_submit_btn');
  if (btn) { btn.textContent = 'Uploading...'; btn.disabled = true; }
  const fd = new FormData();
  fd.append('nic_front', kycFrontFile);
  fd.append('nic_back', kycBackFile);
  try {
    const res = await fetch('/api/kyc/submit', { method:'POST', credentials:'include', body: fd });
    const data = await res.json();
    if (data.success) {
      showToast('✅ KYC Submitted', 'Documents under review. We will notify you.');
      if (currentUser) currentUser.kyc_status = 'pending';
      hideOnboarding();
      renderKycTabStatus({ kyc_status: 'pending' });
      const kycIcon = document.getElementById('checkKycIcon');
      if (kycIcon) kycIcon.textContent = '⏳';
    } else {
      showToast('❌ Error', data.message || 'Upload failed.', true);
      if (btn) { btn.textContent = '📤 SUBMIT KYC DOCUMENTS'; btn.disabled = false; }
    }
  } catch(e) {
    showToast('❌ Error', 'Network error.', true);
    if (btn) { btn.textContent = '📤 SUBMIT KYC DOCUMENTS'; btn.disabled = false; }
  }
}

// Submit KYC from dashboard tab
async function submitKYCFromTab() {
  if (!kycTabFrontFile || !kycTabBackFile) return showToast('⚠️ Required', 'Upload both NIC images.', true);
  const btn = document.getElementById('kyc_tab_submit_btn');
  if (btn) { btn.textContent = 'Uploading...'; btn.disabled = true; }
  const fd = new FormData();
  fd.append('nic_front', kycTabFrontFile);
  fd.append('nic_back', kycTabBackFile);
  try {
    const res = await fetch('/api/kyc/submit', { method:'POST', credentials:'include', body: fd });
    const data = await res.json();
    if (data.success) {
      showToast('✅ KYC Submitted', 'Documents under review.');
      if (currentUser) currentUser.kyc_status = 'pending';
      renderKycTabStatus({ kyc_status: 'pending' });
      const section = document.getElementById('kyc_tab_upload_section');
      if (section) section.style.display = 'none';
    } else {
      showToast('❌ Error', data.message || 'Upload failed.', true);
      if (btn) { btn.textContent = '📤 SUBMIT KYC DOCUMENTS'; btn.disabled = false; }
    }
  } catch(e) {
    showToast('❌ Error', 'Network error.', true);
    if (btn) { btn.textContent = '📤 SUBMIT KYC DOCUMENTS'; btn.disabled = false; }
  }
}

// Resubmit KYC after rejection - go back to KYC panel
function resubmitKYC() {
  switchObPanel('kyc');
  // Reset KYC form
  const front = document.getElementById('nic_front_input');
  const back  = document.getElementById('nic_back_input');
  const fp    = document.getElementById('kyc_front_preview');
  const bp    = document.getElementById('kyc_back_preview');
  if (front) front.value = '';
  if (back)  back.value  = '';
  if (fp)  { fp.style.display = 'none'; }
  if (bp)  { bp.style.display = 'none'; }
  const submitBtn = document.getElementById('kyc_submit_btn');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.style.opacity = '0.5'; submitBtn.style.cursor = 'not-allowed'; }
  const statusBlock = document.getElementById('kyc_status_existing');
  if (statusBlock) statusBlock.style.display = 'none';
  const uploadForm = document.getElementById('kyc_upload_form');
  if (uploadForm) uploadForm.style.display = 'block';
}

// Render KYC status in the KYC tab
function renderKycTabStatus(user) {
  const block = document.getElementById('kyc_tab_status_block');
  const agrBlock = document.getElementById('agr_tab_status_block');
  const uploadSection = document.getElementById('kyc_tab_upload_section');

  if (block) {
    const statusMap = {
      'not_submitted': { icon:'📋', color:'var(--txt-3)', text:'Not Submitted', sub:'Please upload your NIC documents below.' },
      'pending':       { icon:'⏳', color:'var(--warning,#f59e0b)', text:'Pending Verification', sub:'Admin will verify your documents within 24 hours.' },
      'verified':      { icon:'✅', color:'var(--success,#22c55e)', text:'Identity Verified', sub:'Your account is fully verified.' },
      'rejected':      { icon:'❌', color:'#ef4444', text:'Documents Rejected', sub: user?.kyc_note || 'Please resubmit clear images.' }
    };
    const s = statusMap[user?.kyc_status || 'not_submitted'];
    block.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;padding:14px 18px;background:rgba(0,0,0,0.2);border:1px solid var(--border);border-left:3px solid ${s.color}">
        <span style="font-size:22px">${s.icon}</span>
        <div>
          <div style="font-weight:700;color:${s.color};font-size:14px">${s.text}</div>
          <div style="font-size:12px;color:var(--txt-3);margin-top:2px">${s.sub}</div>
        </div>
      </div>`;
    // Hide upload section if verified or pending
    if (uploadSection) {
      const hide = user?.kyc_status === 'verified' || user?.kyc_status === 'pending';
      uploadSection.style.display = hide ? 'none' : 'block';
    }
  }

  if (agrBlock) {
    const signed = user?.agreement_signed;
    agrBlock.innerHTML = signed
      ? `<div style="display:flex;align-items:center;gap:12px;padding:14px 18px;background:rgba(0,0,0,0.2);border:1px solid var(--border);border-left:3px solid var(--success,#22c55e)"><span style="font-size:22px">✅</span><div><div style="font-weight:700;color:var(--success,#22c55e);font-size:14px">Agreement Signed</div><div style="font-size:12px;color:var(--txt-3);margin-top:2px">Signed on ${user.agreement_signed_at ? new Date(user.agreement_signed_at).toLocaleDateString() : '—'}</div></div></div>`
      : `<div style="display:flex;align-items:center;gap:12px;padding:14px 18px;background:rgba(0,0,0,0.2);border:1px solid var(--border);border-left:3px solid #ef4444"><span style="font-size:22px">⚠️</span><div><div style="font-weight:700;color:#ef4444;font-size:14px">Agreement Not Signed</div><div style="font-size:12px;color:var(--txt-3);margin-top:4px"><button onclick="showOnboarding('agreement')" style="background:var(--gold);color:#000;border:none;padding:6px 14px;cursor:pointer;font-size:11px;letter-spacing:1px;font-weight:700">SIGN NOW</button></div></div></div>`;
  }
}

/* ══════════════════════════════════════════════════════
   MT5 ACCOUNTS — Full Implementation
   Uses MetaApi cloud via backend proxy
══════════════════════════════════════════════════════ */

// Chart.js CDN load
(function loadChartJS() {
  if (window.Chart) return;
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
  document.head.appendChild(s);
})();

const MT5_KEY = 'kt_mt5_accounts'; // localStorage key
let mt5Charts = {}; // store chart instances

/* ── Helpers ── */
function getMT5Accounts() {
  try { return JSON.parse(localStorage.getItem(MT5_KEY) || '[]'); } catch { return []; }
}
function saveMT5Accounts(arr) {
  localStorage.setItem(MT5_KEY, JSON.stringify(arr));
}
function fmtMoney(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return (n >= 0 ? '+' : '') + parseFloat(n).toFixed(2);
}
function fmtPct(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return (n >= 0 ? '+' : '') + parseFloat(n).toFixed(2) + '%';
}

/* ── CONNECT BUTTON ── */
async function connectMT5Account() {
  const login   = document.getElementById('mt5Login').value.trim();
  const pass    = document.getElementById('mt5InvPass').value.trim();
  const server  = document.getElementById('mt5Server').value;
  const msgEl   = document.getElementById('mt5ConnectMsg');
  const btn     = document.getElementById('mt5ConnectBtn');

  if (!login || !pass || !server) {
    msgEl.innerHTML = '<span style="color:#ef4444">⚠ Please fill all fields.</span>';
    return;
  }

  // ── 1 ACCOUNT LIMIT ──
  const existing = getMT5Accounts();
  if (existing.length >= 1) {
    msgEl.innerHTML = '<span style="color:#ef4444">⚠ Only 1 MT5 account can be connected. Remove existing account first.</span>';
    lockMT5Form();
    return;
  }

  // Check duplicate
  if (existing.find(a => a.login === login && a.server === server)) {
    msgEl.innerHTML = '<span style="color:#ef4444">⚠ This account is already connected.</span>';
    return;
  }

  btn.disabled = true;
  btn.textContent = '⏳ Connecting...';
  msgEl.innerHTML = '';

  try {
    const res = await fetch('/api/mt5/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('kt_token') },
      body: JSON.stringify({ login, password: pass, server })
    });
    const data = await res.json();

    if (!res.ok || data.error) {
      msgEl.innerHTML = `<span style="color:#ef4444">❌ ${data.error || 'Connection failed. Check credentials.'}</span>`;
      btn.disabled = false; btn.textContent = '🔗 CONNECT ACCOUNT';
      return;
    }

    // Save account locally
    const accs = getMT5Accounts();
    accs.push({
      login,
      server,
      accountId: data.accountId,
      connectedAt: new Date().toISOString()
    });
    saveMT5Accounts(accs);

    msgEl.innerHTML = '<span style="color:#22c55e">✅ Account connected! Loading data...</span>';
    document.getElementById('mt5Login').value = '';
    document.getElementById('mt5InvPass').value = '';
    document.getElementById('mt5Server').value = '';
    btn.disabled = false; btn.textContent = '🔗 CONNECT ACCOUNT';

    renderMT5AccountsList();
    lockMT5Form(); // Lock form after connecting

  } catch (err) {
    msgEl.innerHTML = `<span style="color:#ef4444">❌ Network error. Try again.</span>`;
    btn.disabled = false; btn.textContent = '🔗 CONNECT ACCOUNT';
  }
}

// Lock MT5 form when 1 account already connected
function lockMT5Form() {
  const section = document.getElementById('mt5ConnectSection');
  if (!section) return;
  const inputs  = section.querySelectorAll('input, select');
  const btn     = document.getElementById('mt5ConnectBtn');

  // Blur/disable all inputs
  inputs.forEach(el => {
    el.disabled = true;
    el.style.opacity = '0.35';
    el.style.filter  = 'blur(2px)';
    el.style.cursor  = 'not-allowed';
    el.style.pointerEvents = 'none';
  });

  // Disable and style the button
  if (btn) {
    btn.disabled = true;
    btn.style.opacity = '0.35';
    btn.style.cursor  = 'not-allowed';
    btn.style.filter  = 'blur(1px)';
  }

  // Show lock overlay message
  const existingLock = document.getElementById('mt5LockNotice');
  if (!existingLock) {
    const notice = document.createElement('div');
    notice.id = 'mt5LockNotice';
    notice.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;padding:14px 18px;background:rgba(201,168,76,0.08);border:1px solid rgba(201,168,76,0.25);border-radius:8px;margin-top:12px">
        <span style="font-size:20px">🔒</span>
        <div>
          <div style="font-weight:700;color:var(--gold,#c9a84c);font-size:13px">1 Account Limit Reached</div>
          <div style="font-size:12px;color:var(--txt-3,#888);margin-top:2px">Remove your existing MT5 account below to connect a different one.</div>
        </div>
      </div>`;
    section.querySelector('.sec-body')?.appendChild(notice);
  }
}

// Unlock MT5 form (called when account removed)
function unlockMT5Form() {
  const section = document.getElementById('mt5ConnectSection');
  if (!section) return;
  const inputs = section.querySelectorAll('input, select');
  const btn    = document.getElementById('mt5ConnectBtn');

  inputs.forEach(el => {
    el.disabled = false;
    el.style.opacity = '';
    el.style.filter  = '';
    el.style.cursor  = '';
    el.style.pointerEvents = '';
  });
  if (btn) {
    btn.disabled = false;
    btn.style.opacity = '';
    btn.style.cursor  = '';
    btn.style.filter  = '';
  }
  const notice = document.getElementById('mt5LockNotice');
  if (notice) notice.remove();
  const msgEl = document.getElementById('mt5ConnectMsg');
  if (msgEl) msgEl.innerHTML = '';
}

/* ── RENDER ALL ACCOUNTS ── */
function renderMT5AccountsList() {
  const container = document.getElementById('mt5AccountsList');
  if (!container) return;
  const accounts = getMT5Accounts();

  if (!accounts.length) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = '';
  accounts.forEach((acc, idx) => {
    const card = document.createElement('div');
    card.className = 'mt5-account-card';
    card.id = `mt5card_${idx}`;
    card.innerHTML = `
      <div class="mt5-account-header">
        <div>
          <div class="mt5-account-title">Account #${acc.login}</div>
          <div class="mt5-account-server">🖥 ${acc.server}</div>
        </div>
        <span class="mt5-badge-live" id="mt5badge_${idx}">● LIVE</span>
      </div>
      <div class="mt5-loading" id="mt5loading_${idx}">
        <span class="mt5-spinner"></span> Fetching account data...
      </div>
      <div id="mt5data_${idx}" style="display:none">
        <div class="mt5-stats-grid">
          <div class="mt5-stat">
            <div class="mt5-stat-label">Balance</div>
            <div class="mt5-stat-value gold" id="mt5bal_${idx}">—</div>
          </div>
          <div class="mt5-stat">
            <div class="mt5-stat-label">Equity</div>
            <div class="mt5-stat-value" id="mt5eq_${idx}">—</div>
          </div>
          <div class="mt5-stat">
            <div class="mt5-stat-label">Total Deposit</div>
            <div class="mt5-stat-value" id="mt5dep_${idx}">—</div>
          </div>
          <div class="mt5-stat">
            <div class="mt5-stat-label">Total Withdrawal</div>
            <div class="mt5-stat-value" id="mt5wdw_${idx}">—</div>
          </div>
          <div class="mt5-stat">
            <div class="mt5-stat-label">Total Gain %</div>
            <div class="mt5-stat-value" id="mt5gain_${idx}">—</div>
          </div>
          <div class="mt5-stat">
            <div class="mt5-stat-label">Floating P&L</div>
            <div class="mt5-stat-value" id="mt5float_${idx}">—</div>
          </div>
        </div>

        <!-- EQUITY GRAPH -->
        <div style="background:rgba(0,0,0,0.2);border:1px solid var(--border);padding:16px;margin-bottom:4px">
          <div style="font-size:10px;letter-spacing:2px;color:var(--txt-3);font-weight:700;margin-bottom:12px;text-transform:uppercase">📊 Equity History (Last 30 Days)</div>
          <div class="mt5-graph-wrap">
            <canvas id="mt5chart_${idx}"></canvas>
          </div>
        </div>

        <!-- OPEN TRADES -->
        <div class="mt5-open-trades">
          <div class="mt5-open-trades-title">⚡ Open Positions</div>
          <div id="mt5trades_${idx}"><span style="color:var(--txt-3);font-size:12px">No open positions</span></div>
        </div>
      </div>

      <div class="mt5-actions">
        <button class="mt5-btn-refresh" onclick="refreshMT5Account(${idx})">🔄 Refresh</button>
        <button class="mt5-btn-remove" onclick="removeMT5Account(${idx})">🗑 Remove</button>
      </div>
    `;
    container.appendChild(card);
    fetchMT5Data(idx, acc.accountId);
  });
}

/* ── FETCH DATA FOR ONE ACCOUNT ── */
async function fetchMT5Data(idx, accountId) {
  const loadEl  = document.getElementById(`mt5loading_${idx}`);
  const dataEl  = document.getElementById(`mt5data_${idx}`);
  const badgeEl = document.getElementById(`mt5badge_${idx}`);

  try {
    const res = await fetch(`/api/mt5/account/${accountId}`, {
      credentials: 'include',
      headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('kt_token') || '') }
    });
    const d = await res.json();

    if (!d.success || d.error) {
      if (loadEl) loadEl.innerHTML = `<span style="color:#ef4444;font-size:12px">❌ ${d.error || 'Failed to load data'}</span>`;
      if (badgeEl) { badgeEl.textContent = 'OFFLINE'; badgeEl.className = 'mt5-badge-error'; }
      return;
    }

    if (loadEl) loadEl.style.display = 'none';
    if (dataEl) dataEl.style.display = 'block';

    const m   = d.metrics || {};
    const acc = d.account || {};

    // Connection status badge
    if (badgeEl) {
      const st = acc.connectionStatus || acc.state || '';
      const connected = st.includes('connected') || st === 'deployed';
      badgeEl.textContent = connected ? '● LIVE' : '⚫ CONNECTING';
      badgeEl.className   = connected ? 'mt5-badge-live' : 'mt5-badge-error';
    }

    const fmt  = v => v != null ? '$' + parseFloat(v).toFixed(2) : '—';
    const fmtN = v => v != null ? parseFloat(v).toFixed(2) : '—';
    const fmtP = v => v != null ? parseFloat(v).toFixed(2) + '%' : '—';
    const col  = v => v == null ? '' : v >= 0 ? 'positive' : 'negative';

    // ── Main Stats ──
    const fields = {
      [`mt5bal_${idx}`]:   { val: fmt(m.balance),      cls: '' },
      [`mt5eq_${idx}`]:    { val: fmt(m.equity),       cls: '' },
      [`mt5dep_${idx}`]:   { val: fmt(m.deposits),     cls: '' },
      [`mt5wdw_${idx}`]:   { val: fmt(m.withdrawals),  cls: '' },
      [`mt5gain_${idx}`]:  { val: fmtP(m.gain),        cls: col(m.gain) },
      [`mt5float_${idx}`]: { val: fmt(m.profit),       cls: col(m.profit) },
    };

    // Extended stats (if elements exist)
    const extended = {
      [`mt5trades_count_${idx}`]: m.trades      != null ? m.trades      : null,
      [`mt5winrate_${idx}`]:      m.winRate     != null ? fmtP(m.winRate) : null,
      [`mt5profitfactor_${idx}`]: m.profitFactor!= null ? fmtN(m.profitFactor) : null,
      [`mt5maxdd_${idx}`]:        m.maxDrawdown != null ? fmtP(m.maxDrawdown)   : null,
      [`mt5avgwin_${idx}`]:       m.averageWin  != null ? fmt(m.averageWin)     : null,
      [`mt5avgloss_${idx}`]:      m.averageLoss != null ? fmt(m.averageLoss)    : null,
    };

    Object.entries(fields).forEach(([id, {val, cls}]) => {
      const el = document.getElementById(id);
      if (el) { el.textContent = val; if (cls) el.className = 'mt5-stat-value ' + cls; }
    });
    Object.entries(extended).forEach(([id, val]) => {
      if (val == null) return;
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    });

    // ── Equity Chart ──
    if (d.equityHistory && d.equityHistory.length) {
      drawMT5Chart(idx, d.equityHistory);
    } else {
      // No chart data — show placeholder
      const chartWrap = document.getElementById(`mt5chart_${idx}`);
      if (chartWrap) chartWrap.parentElement.innerHTML =
        '<div style="text-align:center;padding:20px;color:var(--txt-3);font-size:12px">📊 Equity history will appear after account syncs (may take a few minutes)</div>';
    }

    // ── Open Positions ──
    // Fetch separately for fresh data
    fetchOpenTrades(idx, accountId);

  } catch (err) {
    console.error('MT5 fetch error:', err);
    if (loadEl) loadEl.innerHTML = `<span style="color:#ef4444;font-size:12px">❌ Network error. Check server.</span>`;
    if (badgeEl) { badgeEl.textContent = 'ERROR'; badgeEl.className = 'mt5-badge-error'; }
  }
}

async function fetchOpenTrades(idx, accountId) {
  try {
    const res  = await fetch(`/api/mt5/open-trades/${accountId}`, { credentials: 'include' });
    const data = await res.json();
    renderOpenTrades(idx, data.positions || []);
  } catch(e) {
    renderOpenTrades(idx, []);
  }
}

/* ── DRAW EQUITY CHART ── */
function drawMT5Chart(idx, history) {
  const canvas = document.getElementById(`mt5chart_${idx}`);
  if (!canvas || !window.Chart) {
    // Retry after Chart.js loads
    setTimeout(() => drawMT5Chart(idx, history), 600);
    return;
  }
  if (mt5Charts[idx]) { mt5Charts[idx].destroy(); }

  const labels = history.map(h => {
    const d = new Date(h.date);
    return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short' });
  });
  const values = history.map(h => parseFloat(h.equity).toFixed(2));

  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)';
  const textColor = isDark ? '#888' : '#555';

  const first = parseFloat(values[0]) || 0;
  const last  = parseFloat(values[values.length - 1]) || 0;
  const lineColor = last >= first ? '#22c55e' : '#ef4444';

  mt5Charts[idx] = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Equity ($)',
        data: values,
        borderColor: lineColor,
        backgroundColor: lineColor + '18',
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 5,
        tension: 0.35,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ' $' + parseFloat(ctx.raw).toFixed(2)
          }
        }
      },
      scales: {
        x: { ticks: { color: textColor, font: { size: 10 } }, grid: { color: gridColor } },
        y: { ticks: { color: textColor, font: { size: 10 }, callback: v => '$'+v }, grid: { color: gridColor } }
      }
    }
  });
}

/* ── OPEN POSITIONS ── */
function renderOpenTrades(idx, positions) {
  const el = document.getElementById(`mt5trades_${idx}`);
  if (!el) return;
  if (!positions.length) {
    el.innerHTML = '<span style="color:var(--txt-3);font-size:12px">No open positions</span>';
    return;
  }
  el.innerHTML = positions.map(p => {
    const profit = parseFloat(p.unrealizedProfit ?? p.profit ?? 0);
    const typeClass = (p.type || '').toLowerCase().includes('buy') ? 'buy' : 'sell';
    const typeLabel = typeClass === 'buy' ? '▲ BUY' : '▼ SELL';
    return `
      <div class="mt5-trade-row">
        <span class="mt5-trade-symbol">${p.symbol || '—'}</span>
        <span class="mt5-trade-type ${typeClass}">${typeLabel}</span>
        <span style="color:var(--txt-2);font-size:11px">${p.volume ?? '—'} lots</span>
        <span class="mt5-trade-profit ${profit >= 0 ? 'positive' : 'negative'}">${fmtMoney(profit)}</span>
      </div>`;
  }).join('');
}

/* ── REFRESH ── */
function refreshMT5Account(idx) {
  const accounts = getMT5Accounts();
  const acc = accounts[idx];
  if (!acc) return;

  const dataEl  = document.getElementById(`mt5data_${idx}`);
  const loadEl  = document.getElementById(`mt5loading_${idx}`);
  if (dataEl)  dataEl.style.display = 'none';
  if (loadEl)  { loadEl.style.display = 'block'; loadEl.innerHTML = '<span class="mt5-spinner"></span> Refreshing...'; }

  fetchMT5Data(idx, acc.accountId);
}

/* ── REMOVE ── */
async function removeMT5Account(idx) {
  if (!confirm('Remove this MT5 account connection?')) return;
  const accounts = getMT5Accounts();
  const acc = accounts[idx];

  // Call backend to disconnect from MetaApi
  try {
    await fetch(`/api/mt5/disconnect/${acc.accountId}`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('kt_token') }
    });
  } catch (e) {}

  accounts.splice(idx, 1);
  saveMT5Accounts(accounts);
  renderMT5AccountsList();
  unlockMT5Form(); // Unlock form after removal
}

/* ── AUTO-LOAD on tab switch ── */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.sb-link').forEach(link => {
    link.addEventListener('click', function(e) {
      if (this.dataset.tab === 'mt5accounts') {
        setTimeout(() => {
          renderMT5AccountsList();
          // Lock form if account already connected
          if (getMT5Accounts().length >= 1) lockMT5Form();
        }, 100);
      }
    });
  });
});

/* ── Auto-refresh every 60s if tab is active ── */
setInterval(() => {
  const tab = document.getElementById('tab-mt5accounts');
  if (tab && tab.classList.contains('active')) {
    const accounts = getMT5Accounts();
    accounts.forEach((acc, idx) => fetchMT5Data(idx, acc.accountId));
  }
}, 60000);
