// ═══════════════════════════════════════════════════════════════
//  routes/myfxbook.js  —  Knight Traders Myfxbook Records
// ═══════════════════════════════════════════════════════════════
const express = require('express');
const router  = express.Router();
const https   = require('https');
const http    = require('http');
const { getDB, saveDB } = require('../database/db');

function adminOnly(req, res, next) {
  if (req.session && req.session.role === 'admin') {
    return next();
  }
  return res.status(403).json({ success: false, message: 'Admin access required.' });
}

function initMyfxbookTable() {
  try {
    const db = getDB();
    db.exec(`
      CREATE TABLE IF NOT EXISTS myfxbook_records (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        display_name  TEXT    NOT NULL,
        myfxbook_url  TEXT    NOT NULL UNIQUE,
        custom_quote  TEXT,
        location      TEXT,
        plan_type     TEXT,
        gain          REAL,
        drawdown      REAL,
        trades        INTEGER,
        account_type  TEXT,
        currency      TEXT,
        balance       REAL,
        broker        TEXT,
        started       TEXT,
        raw_data      TEXT,
        last_updated  DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_active     INTEGER  DEFAULT 1
      )
    `);
    try { db.exec(`ALTER TABLE myfxbook_records ADD COLUMN location TEXT`); } catch(e) {}
    try { db.exec(`ALTER TABLE myfxbook_records ADD COLUMN plan_type TEXT`); } catch(e) {}
    console.log('[Myfxbook] Table ready.');
  } catch(err) {
    console.error('[Myfxbook] Table init error:', err.message);
  }
}
setTimeout(initMyfxbookTable, 500);

// ── Scraper ──────────────────────────────────────────────────────
function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      timeout: 15000
    }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) return fetchPage(res.headers.location).then(resolve).catch(reject);
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function parseMyfxbook(html, url) {
  const r = { source: url };
  for (const p of [/id="gGain"[^>]*>([^<]+)</i, /"gain"\s*:\s*"?([+-]?\d+\.?\d*)"?/i]) {
    const m = html.match(p); if (m) { r.gain = parseFloat(m[1]); break; }
  }
  for (const p of [/drawdown[^>]*>([0-9]+\.?[0-9]*)\s*%/i, /"drawdown"\s*:\s*"?([0-9]+\.?[0-9]*)"?/i]) {
    const m = html.match(p); if (m) { r.drawdown = parseFloat(m[1]); break; }
  }
  for (const p of [/Trades<\/[^>]+>\s*<[^>]+>(\d+)</i, /"trades"\s*:\s*(\d+)/i]) {
    const m = html.match(p); if (m) { r.trades = parseInt(m[1]); break; }
  }
  r.account_type = /\bLive\b/i.test(html) ? 'Live' : 'Demo';
  const cm = html.match(/Currency\s*<\/[^>]+>\s*<[^>]+>\s*([A-Z]{3})/i); if (cm) r.currency = cm[1];
  const bm = html.match(/[Bb]roker\s*<\/[^>]+>\s*<[^>]+>\s*([^<]+)</i); if (bm) r.broker = bm[1].trim();
  return r;
}

async function scrapeMyfxbook(url) {
  try {
    const html = await fetchPage(url);
    const data = parseMyfxbook(html, url);
    const ok = data.gain != null || data.trades != null || data.drawdown != null;
    return { success: ok, data };
  } catch(err) { return { success: false, error: err.message, data: {} }; }
}

// ── PUBLIC ────────────────────────────────────────────────────────
router.get('/records', (req, res) => {
  try {
    const rows = getDB().prepare(`
      SELECT id, display_name, myfxbook_url, custom_quote, location, plan_type,
             gain, drawdown, trades, account_type, currency, balance, broker, last_updated
      FROM myfxbook_records WHERE is_active = 1 ORDER BY id ASC
    `).all();
    res.json({ success: true, records: rows || [] });
  } catch(e) { res.json({ success: false, message: e.message, records: [] }); }
});

// ── ADMIN ─────────────────────────────────────────────────────────
router.get('/', adminOnly, (req, res) => {
  try {
    const rows = getDB().prepare(`SELECT * FROM myfxbook_records ORDER BY id DESC`).all();
    res.json({ success: true, records: rows || [] });
  } catch(e) { res.json({ success: false, message: e.message }); }
});

router.get('/:id', adminOnly, (req, res) => {
  try {
    const row = getDB().prepare(`SELECT * FROM myfxbook_records WHERE id = ?`).get(req.params.id);
    if (!row) return res.json({ success: false, message: 'Not found.' });
    res.json({ success: true, record: row });
  } catch(e) { res.json({ success: false, message: e.message }); }
});

router.post('/scrape', adminOnly, async (req, res) => {
  const { url } = req.body;
  if (!url || !url.includes('myfxbook.com')) return res.json({ success: false, message: 'Valid Myfxbook URL required.' });
  const result = await scrapeMyfxbook(url);
  res.json({ success: result.success, data: result.data || {}, message: result.error || '' });
});

router.post('/', adminOnly, async (req, res) => {
  const { display_name, myfxbook_url, custom_quote, location, plan_type } = req.body;
  if (!display_name || !myfxbook_url) return res.json({ success: false, message: 'Name and URL required.' });
  let s = {};
  try { const r = await scrapeMyfxbook(myfxbook_url); if (r.success) s = r.data; } catch(e) {}
  try {
    const result = getDB().prepare(`
      INSERT INTO myfxbook_records (display_name, myfxbook_url, custom_quote, location, plan_type,
        gain, drawdown, trades, account_type, currency, balance, broker, raw_data, last_updated, is_active)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,1)
    `).run(display_name, myfxbook_url, custom_quote||null, location||null, plan_type||null,
           s.gain??null, s.drawdown??null, s.trades??null,
           s.account_type||'Live', s.currency||null, s.balance??null, s.broker||null, JSON.stringify(s));
    saveDB();
    res.json({ success: true, message: 'Record added! Now visible on website.', id: result.lastInsertRowid });
  } catch(e) {
    if (e.message?.includes('UNIQUE')) return res.json({ success: false, message: 'This URL already exists.' });
    res.json({ success: false, message: e.message });
  }
});

router.put('/:id', adminOnly, async (req, res) => {
  const { display_name, myfxbook_url, custom_quote, location, plan_type } = req.body;
  if (!display_name || !myfxbook_url) return res.json({ success: false, message: 'Name and URL required.' });
  try {
    const r = getDB().prepare(`
      UPDATE myfxbook_records SET display_name=?, myfxbook_url=?, custom_quote=?, location=?, plan_type=? WHERE id=?
    `).run(display_name, myfxbook_url, custom_quote||null, location||null, plan_type||null, req.params.id);
    if (r.changes === 0) return res.json({ success: false, message: 'Not found.' });
    saveDB();
    res.json({ success: true, message: 'Updated.' });
  } catch(e) { res.json({ success: false, message: e.message }); }
});

router.post('/:id/refresh', adminOnly, async (req, res) => {
  try {
    const db  = getDB();
    const row = db.prepare(`SELECT myfxbook_url FROM myfxbook_records WHERE id=?`).get(req.params.id);
    if (!row) return res.json({ success: false, message: 'Not found.' });
    const result = await scrapeMyfxbook(row.myfxbook_url);
    const s = result.data || {};
    db.prepare(`
      UPDATE myfxbook_records SET gain=?,drawdown=?,trades=?,account_type=?,currency=?,
        balance=?,broker=?,raw_data=?,last_updated=CURRENT_TIMESTAMP WHERE id=?
    `).run(s.gain??null, s.drawdown??null, s.trades??null, s.account_type||null,
           s.currency||null, s.balance??null, s.broker||null, JSON.stringify(s), req.params.id);
    saveDB();
    res.json({ success: true, message: 'Refreshed.', data: s });
  } catch(e) { res.json({ success: false, message: e.message }); }
});

router.delete('/:id', adminOnly, (req, res) => {
  try {
    const r = getDB().prepare(`DELETE FROM myfxbook_records WHERE id=?`).run(req.params.id);
    if (r.changes === 0) return res.json({ success: false, message: 'Not found.' });
    saveDB();
    res.json({ success: true, message: 'Deleted.' });
  } catch(e) { res.json({ success: false, message: e.message }); }
});

module.exports = router;
