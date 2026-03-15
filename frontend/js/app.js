const API = 'https://backend-production-93d4.up.railway.app';
/* app.js — Knight Traders Landing Page */

/* ── MOBILE MENU GLOBAL (called from inline onclick) ── */
function closeMobileMenu() {
  const mobileMenu = document.getElementById('mobileMenu');
  const burgerIcon = document.getElementById('burgerIcon');
  const burger     = document.getElementById('burger');
  if (!mobileMenu) return;
  mobileMenu.classList.remove('open');
  if (burgerIcon) burgerIcon.textContent = '☰';
  if (burger) burger.setAttribute('aria-expanded', 'false');
  setTimeout(() => { if (!mobileMenu.classList.contains('open')) mobileMenu.style.display = 'none'; }, 380);
}

/* ── THEME ── */
(function initTheme() {
  const t = localStorage.getItem('kt_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', t);
  setThemeIcons(t);
})();

function setThemeIcons(t) {
  const ico = t === 'dark' ? '☀️' : '🌙';
  document.querySelectorAll('#themeToggle, #themeFab').forEach(b => {
    if (b) { b.textContent = ico; b.title = t === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'; }
  });
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  const nxt = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', nxt);
  localStorage.setItem('kt_theme', nxt);
  setThemeIcons(nxt);
}

/* ── CURSOR ── */
function initCursor() {
  const c = document.getElementById('cur');
  const t = document.getElementById('trail');
  if (!c) return;
  document.addEventListener('mousemove', e => {
    c.style.left = (e.clientX - 6.5) + 'px';
    c.style.top  = (e.clientY - 6.5) + 'px';
    setTimeout(() => {
      t.style.left = (e.clientX - 2.5) + 'px';
      t.style.top  = (e.clientY - 2.5) + 'px';
    }, 90);
  });
  document.querySelectorAll('a, button, .feat-card, .con-card, .story-card, .price-card').forEach(el => {
    el.addEventListener('mouseenter', () => c.classList.add('hovered'));
    el.addEventListener('mouseleave', () => c.classList.remove('hovered'));
  });
}

/* ── SCROLL HELPER ── */
function scroll2(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth' });
}

/* ── NAVBAR SCROLL ── */
window.addEventListener('scroll', () => {
  const nav = document.getElementById('nav');
  if (nav) nav.classList.toggle('scrolled', window.scrollY > 70);
});

/* ── REVEAL ON SCROLL ── */
const ro = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('in'); });
}, { threshold: 0.1 });

/* ── MODALS ── */
function openModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.add('on'); document.body.style.overflow = 'hidden'; }
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.remove('on'); document.body.style.overflow = ''; }
}
function switchMod(close, open) {
  closeModal(close);
  setTimeout(() => openModal(open), 200);
}

function openWithPlan(plan) {
  const inp  = document.getElementById('su_plan');
  const banner = document.getElementById('planBanner');
  if (inp) inp.value = plan;
  const labels = {
    monthly:   '📅 Monthly Plan — $50 / month',
    quarterly: '⭐ Quarterly Plan — $120 / 3 months (Save $30!)',
    yearly:    '🏆 Annual Plan — $500 / year (Save $100!)'
  };
  if (banner) { banner.textContent = '✓ Selected: ' + labels[plan]; banner.style.display = 'block'; }
  openModal('signupModal');
}

/* ── SIGNUP ── */
async function doSignup() {
  const name  = document.getElementById('su_name').value.trim();
  const email = document.getElementById('su_email').value.trim();
  const phone = document.getElementById('su_phone').value.trim();
  const pass  = document.getElementById('su_pass').value;
  const plan  = document.getElementById('su_plan').value || 'monthly';
  const msgEl = document.getElementById('su_msg');
  const btn   = document.getElementById('su_btn');

  // Capture ?ref= from URL
  const urlRef = new URLSearchParams(window.location.search).get('ref') || '';

  msgEl.className = 'fmsg'; msgEl.textContent = '';
  if (!name || !email || !pass) { msgEl.className = 'fmsg err'; msgEl.textContent = '⚠️ Please fill all required fields.'; return; }
  if (!email.includes('@'))    { msgEl.className = 'fmsg err'; msgEl.textContent = '⚠️ Enter a valid email address.'; return; }
  if (pass.length < 6)        { msgEl.className = 'fmsg err'; msgEl.textContent = '⚠️ Password must be at least 6 characters.'; return; }

  btn.disabled = true; btn.textContent = 'Creating account…';
  try {
    const res  = await fetch('/api/auth/signup', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: name, email, phone, password: pass, selected_plan: plan, ref: urlRef })
    });
    const data = await res.json();
    if (data.success) {
      showToast('🎉 Welcome!', `Account created! Member ID: ${data.user.member_id}`);
      setTimeout(() => { window.location.href = '/dashboard.html'; }, 1200);
    } else {
      msgEl.className = 'fmsg err'; msgEl.textContent = '❌ ' + data.message;
      btn.disabled = false; btn.textContent = 'CREATE ACCOUNT';
    }
  } catch {
    msgEl.className = 'fmsg err'; msgEl.textContent = '❌ Connection error. Is the server running?';
    btn.disabled = false; btn.textContent = 'CREATE ACCOUNT';
  }
}

/* ── LOGIN ── */
async function doLogin() {
  const email = document.getElementById('li_email').value.trim();
  const pass  = document.getElementById('li_pass').value;
  const msgEl = document.getElementById('li_msg');
  const btn   = document.getElementById('li_btn');

  msgEl.className = 'fmsg'; msgEl.textContent = '';
  if (!email || !pass) { msgEl.className = 'fmsg err'; msgEl.textContent = '⚠️ Enter your email and password.'; return; }

  btn.disabled = true; btn.textContent = 'Logging in…';
  try {
    const res  = await fetch('/api/auth/login', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass })
    });
    const data = await res.json();
    if (data.success) {
      showToast('✓ Welcome back', `Hello, ${data.user.full_name.split(' ')[0]}!`);
      setTimeout(() => { window.location.href = data.user.role === 'admin' ? '/admin.html' : '/dashboard.html'; }, 800);
    } else {
      msgEl.className = 'fmsg err'; msgEl.textContent = '❌ ' + data.message;
      btn.disabled = false; btn.textContent = 'ACCESS DASHBOARD';
    }
  } catch {
    msgEl.className = 'fmsg err'; msgEl.textContent = '❌ Connection error.';
    btn.disabled = false; btn.textContent = 'ACCESS DASHBOARD';
  }
}

/* ── TOAST ── */
let toastTmr;
function showToast(title, msg, isErr = false) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  document.getElementById('tTitle').textContent = title;
  document.getElementById('tMsg').textContent   = msg;
  toast.style.borderLeftColor = isErr ? '#EF4444' : '#FBBF24';
  toast.classList.add('show');
  clearTimeout(toastTmr);
  toastTmr = setTimeout(() => toast.classList.remove('show'), 4000);
}

/* ── SESSION CHECK ── */
async function checkSession() {
  try {
    const res  = await fetch('/api/auth/me', { credentials: 'include' });
    const data = await res.json();
    if (data.success) window.location.href = data.user.role === 'admin' ? '/admin.html' : '/dashboard.html';
  } catch { /* not logged in */ }
}

/* ── ENTER KEY ── */
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (document.getElementById('signupModal')?.classList.contains('on')) doSignup();
  if (document.getElementById('loginModal')?.classList.contains('on'))  doLogin();
});

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', () => {
  initCursor();

  /* Theme toggles */
  document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);
  document.getElementById('themeFab')?.addEventListener('click', toggleTheme);

  /* Modal triggers */
  document.getElementById('loginBtn')?.addEventListener('click', () => openModal('loginModal'));
  document.getElementById('signupBtn')?.addEventListener('click', () => openWithPlan('monthly'));
  document.getElementById('heroBtn')?.addEventListener('click', () => openWithPlan('monthly'));
  document.getElementById('fLogin')?.addEventListener('click', e => { e.preventDefault(); openModal('loginModal'); });
  document.getElementById('fSignup')?.addEventListener('click', e => { e.preventDefault(); openWithPlan('monthly'); });

  /* Close modal on overlay click or X button */
  document.querySelectorAll('.overlay').forEach(m =>
    m.addEventListener('click', e => { if (e.target === m) closeModal(m.id); })
  );
  document.querySelectorAll('[data-close]').forEach(btn =>
    btn.addEventListener('click', () => closeModal(btn.dataset.close))
  );

  /* ── MOBILE MENU ── */
  const burger     = document.getElementById('burger');
  const mobileMenu = document.getElementById('mobileMenu');
  const burgerIcon = document.getElementById('burgerIcon');

  function toggleMobileMenu() {
    const isOpen = mobileMenu.classList.contains('open');
    if (isOpen) {
      closeMobileMenu();
    } else {
      mobileMenu.style.display = 'block';
      requestAnimationFrame(() => mobileMenu.classList.add('open'));
      burgerIcon.textContent = '✕';
      burger.setAttribute('aria-expanded', 'true');
    }
  }

  if (burger && mobileMenu) {
    burger.addEventListener('click', toggleMobileMenu);
    // Close on outside tap
    document.addEventListener('click', e => {
      if (!burger.contains(e.target) && !mobileMenu.contains(e.target)) {
        closeMobileMenu();
      }
    });
  }

  /* Reveal observer */
  document.querySelectorAll('.reveal').forEach(el => ro.observe(el));

  /* Session check */
  checkSession();

  /* If ref code in URL — show banner and open signup */
  const urlRef = new URLSearchParams(window.location.search).get('ref');
  if (urlRef) {
    const banner = document.getElementById('planBanner');
    if (banner) {
      banner.textContent = `🔗 You were referred by a Knight Traders member! Sign up now to get started.`;
      banner.style.display = 'block';
    }
    setTimeout(() => openWithPlan('monthly'), 600);
  }
});
