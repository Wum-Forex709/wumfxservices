// ═══════════════════════════════════════════════════════════════
//  routes/myfxbook.js  —  Knight Traders Myfxbook Records
//  Backend: Node.js + Express + SQLite/MySQL (via db.js)
// ═══════════════════════════════════════════════════════════════
const express = require('express');
const router  = express.Router();
const https   = require('https');
const http    = require('http');
const { db }  = require('../database/db');  // adjust path if needed

// ─── Middleware: admin auth check ───────────────────────────────
function adminOnly(req, res, next) {
  if (!req.session?.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required.' });
  }
  next();
}

// ─── Init table (run on startup) ────────────────────────────────
function initMyfxbookTable() {
  db.run(`
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
  `, err => {
    if (err && !err.message.includes('already exists')) {
      console.error('[Myfxbook] Table init error:', err.message);
    } else {
      // Add new columns if upgrading from old schema
      db.run(`ALTER TABLE myfxbook_records ADD COLUMN location TEXT`, () => {});
      db.run(`ALTER TABLE myfxbook_records ADD COLUMN plan_type TEXT`, () => {});
      console.log('[Myfxbook] Table ready.');
    }
  });
}
initMyfxbookTable();

// ═══════════════════════════════════════════════════════════════
//  SCRAPER — Fetches Myfxbook public portfolio page
//  Extracts: gain, drawdown, trades, account type, currency, balance
// ═══════════════════════════════════════════════════════════════
function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const client  = url.startsWith('https') ? https : http;
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept':     'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      timeout: 15000
    };
    const req = client.get(url, options, res => {
      // Follow redirects
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchPage(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

function parseMyfxbook(html, url) {
  const result = { source: url };

  // ── Gain % ──────────────────────────────────────────────────
  // Multiple possible selectors/patterns
  const gainPatterns = [
    /id="gGain"[^>]*>([^<]+)</i,
    /class="[^"]*gain[^"]*"[^>]*>([+-]?\d+\.?\d*)\s*%/i,
    /"gain"\s*:\s*"?([+-]?\d+\.?\d*)"?/i,
    /Gain<\/[^>]+>\s*<[^>]+>([+-]?\d+\.?\d*)\s*%/i,
    /total gain[^>]*>\s*([+-]?\d+\.?\d*)\s*%/i,
  ];
  for (const p of gainPatterns) {
    const m = html.match(p);
    if (m) { result.gain = parseFloat(m[1]); break; }
  }

  // ── Drawdown % ──────────────────────────────────────────────
  const ddPatterns = [
    /id="[^"]*[Dd]rawdown[^"]*"[^>]*>([^<]+)</,
    /drawdown[^>]*>([0-9]+\.?[0-9]*)\s*%/i,
    /"drawdown"\s*:\s*"?([0-9]+\.?[0-9]*)"?/i,
    /[Dd]rawdown<\/[^>]+>\s*<[^>]+>([0-9]+\.?[0-9]*)\s*%/,
  ];
  for (const p of ddPatterns) {
    const m = html.match(p);
    if (m) { result.drawdown = parseFloat(m[1]); break; }
  }

  // ── Total Trades ─────────────────────────────────────────────
  const tradePatterns = [
    /Trades<\/[^>]+>\s*<[^>]+>(\d+)</i,
    /"trades"\s*:\s*(\d+)/i,
    /total trades[^>]*>\s*(\d+)/i,
    /id="[^"]*[Tt]rades[^"]*"[^>]*>(\d+)</,
  ];
  for (const p of tradePatterns) {
    const m = html.match(p);
    if (m) { result.trades = parseInt(m[1]); break; }
  }

  // ── Account Type (Live/Demo) ──────────────────────────────────
  if (/\bLive\b/i.test(html))  result.account_type = 'Live';
  else if (/\bDemo\b/i.test(html)) result.account_type = 'Demo';
  else result.account_type = 'Live'; // default

  // ── Currency ─────────────────────────────────────────────────
  const currencyM = html.match(/Currency\s*<\/[^>]+>\s*<[^>]+>\s*([A-Z]{3})/i)
    || html.match(/"currency"\s*:\s*"([A-Z]{3})"/i);
  if (currencyM) result.currency = currencyM[1];

  // ── Balance ──────────────────────────────────────────────────
  const balanceM = html.match(/[Bb]alance\s*<\/[^>]+>\s*<[^>]+>\s*\$?([\d,]+\.?\d*)/i)
    || html.match(/"balance"\s*:\s*([\d.]+)/i);
  if (balanceM) result.balance = parseFloat(balanceM[1].replace(/,/g, ''));

  // ── Broker ───────────────────────────────────────────────────
  const brokerM = html.match(/[Bb]roker\s*<\/[^>]+>\s*<[^>]+>\s*([^<]+)</i)
    || html.match(/"broker"\s*:\s*"([^"]+)"/i);
  if (brokerM) result.broker = brokerM[1].trim();

  return result;
}

async function scrapeMyfxbook(url) {
  try {
    const html = await fetchPage(url);
    const data = parseMyfxbook(html, url);
    // If we got at least gain or trades, consider it a success
    const hasData = data.gain != null || data.trades != null || data.drawdown != null;
    return { success: hasData, data, html: hasData ? null : html.substring(0, 2000) };
  } catch(err) {
    return { success: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════
//  PUBLIC ROUTE: GET /api/myfxbook/records
//  Returns all active records for the frontend website
// ═══════════════════════════════════════════════════════════════
router.get('/records', (req, res) => {
  db.all(
    `SELECT id, display_name, myfxbook_url, custom_quote, location, plan_type,
            gain, drawdown, trades, account_type, currency, balance, broker, last_updated
     FROM myfxbook_records
     WHERE is_active = 1
     ORDER BY id ASC`,
    [],
    (err, rows) => {
      if (err) return res.json({ success: false, message: err.message });
      res.json({ success: true, records: rows || [] });
    }
  );
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN ROUTES
// ═══════════════════════════════════════════════════════════════

// GET /api/admin/myfxbook — all records (admin)
router.get('/', adminOnly, (req, res) => {
  db.all(
    `SELECT * FROM myfxbook_records ORDER BY id DESC`,
    [],
    (err, rows) => {
      if (err) return res.json({ success: false, message: err.message });
      res.json({ success: true, records: rows || [] });
    }
  );
});

// GET /api/admin/myfxbook/:id — single record
router.get('/:id', adminOnly, (req, res) => {
  db.get(
    `SELECT * FROM myfxbook_records WHERE id = ?`,
    [req.params.id],
    (err, row) => {
      if (err) return res.json({ success: false, message: err.message });
      if (!row) return res.json({ success: false, message: 'Record not found.' });
      res.json({ success: true, record: row });
    }
  );
});

// POST /api/admin/myfxbook/scrape — scrape preview (no save)
router.post('/scrape', adminOnly, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.json({ success: false, message: 'URL required.' });
  if (!url.includes('myfxbook.com')) return res.json({ success: false, message: 'Must be a Myfxbook URL.' });

  const result = await scrapeMyfxbook(url);
  if (result.success) {
    res.json({ success: true, data: result.data });
  } else {
    // Return partial data even if scrape was incomplete
    res.json({
      success: false,
      message: `Could not fully scrape Myfxbook. You can still save the record manually. Error: ${result.error || 'Parse failed'}`,
      data: result.data || {}
    });
  }
});

// POST /api/admin/myfxbook — add new record
router.post('/', adminOnly, async (req, res) => {
  const { display_name, myfxbook_url, custom_quote, location, plan_type } = req.body;
  if (!display_name || !myfxbook_url) {
    return res.json({ success: false, message: 'Name and URL are required.' });
  }

  // Try to scrape data
  let scraped = {};
  try {
    const result = await scrapeMyfxbook(myfxbook_url);
    if (result.success) scraped = result.data;
  } catch(e) { /* silent – save without stats */ }

  db.run(
    `INSERT INTO myfxbook_records
       (display_name, myfxbook_url, custom_quote, location, plan_type, gain, drawdown, trades,
        account_type, currency, balance, broker, raw_data, last_updated, is_active)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,1)`,
    [
      display_name, myfxbook_url, custom_quote || null, location || null, plan_type || null,
      scraped.gain ?? null, scraped.drawdown ?? null, scraped.trades ?? null,
      scraped.account_type || 'Live', scraped.currency || null,
      scraped.balance ?? null, scraped.broker || null,
      JSON.stringify(scraped)
    ],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE')) return res.json({ success: false, message: 'This Myfxbook URL already exists.' });
        return res.json({ success: false, message: err.message });
      }
      res.json({ success: true, message: 'Record added! It will now appear on the website.', id: this.lastID });
    }
  );
});

// PUT /api/admin/myfxbook/:id — update record
router.put('/:id', adminOnly, async (req, res) => {
  const { display_name, myfxbook_url, custom_quote, location, plan_type } = req.body;
  const id = req.params.id;
  if (!display_name || !myfxbook_url) {
    return res.json({ success: false, message: 'Name and URL are required.' });
  }
  db.run(
    `UPDATE myfxbook_records
     SET display_name=?, myfxbook_url=?, custom_quote=?, location=?, plan_type=?
     WHERE id=?`,
    [display_name, myfxbook_url, custom_quote || null, location || null, plan_type || null, id],
    function(err) {
      if (err) return res.json({ success: false, message: err.message });
      if (this.changes === 0) return res.json({ success: false, message: 'Record not found.' });
      res.json({ success: true, message: 'Record updated.' });
    }
  );
});

// POST /api/admin/myfxbook/:id/refresh — re-scrape and update stats
router.post('/:id/refresh', adminOnly, async (req, res) => {
  const id = req.params.id;
  db.get(`SELECT myfxbook_url FROM myfxbook_records WHERE id=?`, [id], async (err, row) => {
    if (err || !row) return res.json({ success: false, message: 'Record not found.' });

    const result = await scrapeMyfxbook(row.myfxbook_url);
    const s = result.data || {};

    db.run(
      `UPDATE myfxbook_records
       SET gain=?, drawdown=?, trades=?, account_type=?, currency=?,
           balance=?, broker=?, raw_data=?, last_updated=CURRENT_TIMESTAMP
       WHERE id=?`,
      [
        s.gain ?? null, s.drawdown ?? null, s.trades ?? null,
        s.account_type || null, s.currency || null,
        s.balance ?? null, s.broker || null,
        JSON.stringify(s), id
      ],
      function(err2) {
        if (err2) return res.json({ success: false, message: err2.message });
        res.json({
          success: true,
          message: result.success ? 'Stats refreshed from Myfxbook.' : 'Saved with partial data (Myfxbook may have changed layout).',
          data: s
        });
      }
    );
  });
});

// DELETE /api/admin/myfxbook/:id — delete record
router.delete('/:id', adminOnly, (req, res) => {
  db.run(
    `DELETE FROM myfxbook_records WHERE id=?`,
    [req.params.id],
    function(err) {
      if (err) return res.json({ success: false, message: err.message });
      if (this.changes === 0) return res.json({ success: false, message: 'Record not found.' });
      res.json({ success: true, message: 'Record deleted.' });
    }
  );
});

module.exports = router;
