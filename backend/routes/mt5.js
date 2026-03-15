// routes/mt5.js — MetaApi REST Integration (no npm package needed)
// Docs: https://metaapi.cloud/docs/client/restApi/
const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getDB } = require('../database/db');

const META_API_TOKEN  = process.env.META_API_TOKEN || '';
const META_API_BASE   = 'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai';
const META_STATS_BASE = 'https://metastats-api-v1.london.agiliumtrade.ai';

// ── Helper: MetaApi REST call ─────────────────────────────────────────────────
async function metaApi(method, url, body = null) {
  const opts = {
    method,
    headers: { 'auth-token': META_API_TOKEN, 'Content-Type': 'application/json' }
  };
  if (body) opts.body = JSON.stringify(body);
  const res  = await fetch(url, opts);
  const text = await res.text();
  try { return { ok: res.ok, status: res.status, data: JSON.parse(text) }; }
  catch(e) { return { ok: false, status: res.status, data: { message: text } }; }
}

// ── POST /api/mt5/connect ─────────────────────────────────────────────────────
router.post('/connect', requireAuth, async (req, res) => {
  const { login, password, server } = req.body;

  if (!login || !password || !server)
    return res.json({ success: false, error: 'Login, password and server are required.' });

  if (!META_API_TOKEN || META_API_TOKEN === 'your_metaapi_token_here')
    return res.json({ success: false, error: 'MetaApi token not configured. Add META_API_TOKEN to backend/.env' });

  try {
    // Provision account on MetaApi
    const provision = await metaApi('POST', `${META_API_BASE}/users/current/accounts`, {
      login: String(login),
      password,
      name:   `KT-${login}`,
      server,
      platform: 'mt5',
      magic:    0,
      type:     'cloud',
      application: 'MetaApi',
      synchronizationMode: 'user'
    });

    if (!provision.ok) {
      const msg = provision.data?.message || provision.data?.error || 'Failed to connect. Check credentials.';
      return res.json({ success: false, error: msg });
    }

    const accountId = provision.data.id;

    // Deploy the account
    await metaApi('POST', `${META_API_BASE}/users/current/accounts/${accountId}/deploy`);

    // Save accountId in DB
    const db = getDB();
    db.prepare(`UPDATE users SET mt5_account_id=? WHERE id=?`).run(accountId, req.session.userId);

    return res.json({ success: true, accountId });

  } catch(e) {
    console.error('MT5 connect error:', e);
    return res.json({ success: false, error: 'Server error connecting to MetaApi.' });
  }
});

// ── GET /api/mt5/account/:accountId ──────────────────────────────────────────
router.get('/account/:accountId', requireAuth, async (req, res) => {
  const { accountId } = req.params;

  if (!META_API_TOKEN || META_API_TOKEN === 'your_metaapi_token_here')
    return res.json({ success: false, error: 'MetaApi token not configured.' });

  try {
    // Fetch in parallel: account info + metrics + equity chart
    const from = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

    const [infoRes, statsRes, chartRes] = await Promise.all([
      metaApi('GET', `${META_API_BASE}/users/current/accounts/${accountId}`),
      metaApi('GET', `${META_STATS_BASE}/users/current/accounts/${accountId}/metrics`),
      metaApi('GET', `${META_STATS_BASE}/users/current/accounts/${accountId}/equity-chart?startTime=${encodeURIComponent(from)}`)
    ]);

    const info  = infoRes.ok  ? infoRes.data  : {};
    const stats = statsRes.ok ? statsRes.data : {};
    const chart = chartRes.ok && Array.isArray(chartRes.data) ? chartRes.data : [];

    const equityHistory = chart.map(p => ({
      date:   (p.brokerTime || p.time || '').split(' ')[0],
      equity: p.equity || 0
    }));

    return res.json({
      success: true,
      account: {
        login:             info.login             || req.params.accountId,
        server:            info.server            || '',
        state:             info.state             || 'unknown',
        connectionStatus:  info.connectionStatus  || 'unknown',
        broker:            info.broker            || 'Exness',
        currency:          info.currency          || 'USD',
        leverage:          info.leverage          || null,
        type:              info.type              || '',
      },
      metrics: {
        balance:       stats.balance       ?? null,
        equity:        stats.equity        ?? null,
        profit:        stats.profit        ?? null,
        deposits:      stats.deposits      ?? null,
        withdrawals:   stats.withdrawals   ?? null,
        gain:          stats.gain          ?? null,
        absoluteGain:  stats.absoluteGain  ?? null,
        trades:        stats.trades        ?? null,
        wonTrades:     stats.wonTrades     ?? null,
        lostTrades:    stats.lostTrades    ?? null,
        winRate:       stats.winRate       ?? null,
        pips:          stats.pips          ?? null,
        averageWin:    stats.averageWin    ?? null,
        averageLoss:   stats.averageLoss   ?? null,
        maxDrawdown:   stats.maxDrawdown   ?? null,
        profitFactor:  stats.profitFactor  ?? null,
      },
      equityHistory
    });

  } catch(e) {
    console.error('MT5 fetch error:', e);
    return res.json({ success: false, error: 'Could not fetch account data.' });
  }
});

// ── GET /api/mt5/open-trades/:accountId ──────────────────────────────────────
router.get('/open-trades/:accountId', requireAuth, async (req, res) => {
  try {
    const r = await metaApi('GET',
      `${META_API_BASE}/users/current/accounts/${req.params.accountId}/positions`);
    return res.json({ success: true, positions: r.ok ? (r.data || []) : [] });
  } catch(e) {
    return res.json({ success: false, positions: [] });
  }
});

// ── DELETE /api/mt5/disconnect/:accountId ────────────────────────────────────
router.delete('/disconnect/:accountId', requireAuth, async (req, res) => {
  try {
    if (META_API_TOKEN && META_API_TOKEN !== 'your_metaapi_token_here') {
      await metaApi('POST',   `${META_API_BASE}/users/current/accounts/${req.params.accountId}/undeploy`);
      await metaApi('DELETE', `${META_API_BASE}/users/current/accounts/${req.params.accountId}`);
    }
    getDB().prepare(`UPDATE users SET mt5_account_id=NULL WHERE id=?`).run(req.session.userId);
    return res.json({ success: true });
  } catch(e) {
    return res.json({ success: true });
  }
});

module.exports = router;
