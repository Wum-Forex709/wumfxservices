// routes/community.js - Knight Traders Community Chat
// Auto-cleanup: chat messages delete after 24 hours (runs every hour)
const express   = require('express');
const router    = express.Router();
const { getDB } = require('../database/db');
const { requireAuth } = require('../middleware/auth');

// ── Ensure chat_messages table exists (called after DB is ready) ─
function ensureChatTable() {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL,
      member_id  TEXT NOT NULL,
      full_name  TEXT NOT NULL,
      message    TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
}

// ── AUTO CLEANUP: delete messages older than 24 hours ──────────
function cleanOldMessages() {
  try {
    const db     = getDB();
    const result = db.prepare(`
      DELETE FROM chat_messages
      WHERE created_at < datetime('now', '-24 hours')
    `).run();

    // Reset auto-increment if table empty (keeps DB file small)
    const count = db.prepare(`SELECT COUNT(*) as c FROM chat_messages`).get().c;
    if (count === 0) {
      try { db.exec(`DELETE FROM sqlite_sequence WHERE name='chat_messages'`); } catch(e) {}
    }

    if (result.changes > 0) {
      console.log(`🧹 [Community] Cleaned ${result.changes} old chat messages`);
    }
  } catch (e) {
    console.error('Community cleanup error:', e.message);
  }
}

// ── Called from server.js after initDB() resolves ──────────────
function initCommunity() {
  ensureChatTable();
  cleanOldMessages();
  setInterval(cleanOldMessages, 60 * 60 * 1000); // every 1 hour
  console.log('💬 [Community] Chat module ready — auto-cleanup active (24h)');
}

// ── Helper: check if user is eligible ─────────────────────────
function isChatEligible(userId) {
  const db   = getDB();
  const user = db.prepare(`
    SELECT u.status, u.ea_status,
           (SELECT COUNT(*) FROM payments WHERE user_id=u.id AND status='verified') as vp
    FROM users u WHERE u.id=?
  `).get(userId);
  if (!user) return false;
  return user.status === 'active' && user.ea_status === 'active' && user.vp > 0;
}

// ── GET /api/community/check ───────────────────────────────────
router.get('/check', requireAuth, (req, res) => {
  const eligible = isChatEligible(req.session.userId);
  res.json({ success: true, eligible });
});

// ── GET /api/community/history ─────────────────────────────────
router.get('/history', requireAuth, (req, res) => {
  if (!isChatEligible(req.session.userId)) {
    return res.status(403).json({ success: false, message: 'Access denied.' });
  }
  const db   = getDB();
  const msgs = db.prepare(`
    SELECT id, member_id, full_name, message, created_at
    FROM chat_messages
    ORDER BY created_at DESC
    LIMIT 50
  `).all().reverse();
  res.json({ success: true, messages: msgs });
});

// ── GET /api/community/messages?since= ────────────────────────
router.get('/messages', requireAuth, (req, res) => {
  if (!isChatEligible(req.session.userId)) {
    return res.status(403).json({ success: false, message: 'Access denied.' });
  }
  const db    = getDB();
  const since = req.query.since || '1970-01-01 00:00:00';
  const msgs  = db.prepare(`
    SELECT id, member_id, full_name, message, created_at
    FROM chat_messages
    WHERE created_at > ?
    ORDER BY created_at ASC
    LIMIT 100
  `).all(since);
  res.json({ success: true, messages: msgs });
});

// ── POST /api/community/send ───────────────────────────────────
router.post('/send', requireAuth, (req, res) => {
  if (!isChatEligible(req.session.userId)) {
    return res.status(403).json({ success: false, message: 'Access denied.' });
  }
  const { message } = req.body;
  if (!message || message.trim().length === 0) {
    return res.status(400).json({ success: false, message: 'Message cannot be empty.' });
  }
  if (message.trim().length > 500) {
    return res.status(400).json({ success: false, message: 'Message too long (max 500 chars).' });
  }
  const db   = getDB();
  const user = db.prepare('SELECT member_id, full_name FROM users WHERE id=?').get(req.session.userId);
  db.prepare(`
    INSERT INTO chat_messages (user_id, member_id, full_name, message) VALUES (?,?,?,?)
  `).run(req.session.userId, user.member_id, user.full_name, message.trim());
  res.json({ success: true });
});

// ── GET /api/community/online ──────────────────────────────────
router.get('/online', requireAuth, (req, res) => {
  if (!isChatEligible(req.session.userId)) {
    return res.status(403).json({ success: false, message: 'Access denied.' });
  }
  const db    = getDB();
  const count = db.prepare(`
    SELECT COUNT(DISTINCT user_id) as c FROM chat_messages
    WHERE created_at > datetime('now', '-5 minutes')
  `).get().c;
  res.json({ success: true, online: count });
});

module.exports = router;
module.exports.initCommunity = initCommunity;
