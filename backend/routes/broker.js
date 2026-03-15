// routes/broker.js
const express = require('express');
const router = express.Router();
const { getDB } = require('../database/db');
const { requireAuth } = require('../middleware/auth');

// POST /api/broker/submit
router.post('/submit', requireAuth, (req, res) => {
  try {
    const { broker_name, account_login, account_password, server_name, account_type } = req.body;

    if (!broker_name || !account_login || !account_password || !server_name) {
      return res.json({ success: false, message: 'All broker fields are required.' });
    }

    const db = getDB();
    const userId = req.session.userId;
    const memberId = req.session.memberId;

    // Update or insert broker account
    const existing = db.prepare('SELECT id FROM broker_accounts WHERE user_id = ?').get(userId);
    if (existing) {
      db.prepare(`
        UPDATE broker_accounts SET broker_name=?, account_login=?, account_password=?, server_name=?, account_type=?, status='submitted', submitted_at=datetime('now')
        WHERE user_id=?
      `).run(broker_name, account_login, account_password, server_name, account_type || 'standard', userId);
    } else {
      db.prepare(`
        INSERT INTO broker_accounts (user_id, member_id, broker_name, account_login, account_password, server_name, account_type)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(userId, memberId, broker_name, account_login, account_password, server_name, account_type || 'standard');
    }

    db.prepare(`
      INSERT INTO notifications (user_id, title, message, type)
      VALUES (?, ?, ?, ?)
    `).run(userId, 'Broker Account Submitted', 'Your broker account details have been saved. EA will be activated after payment verification.', 'info');

    res.json({ success: true, message: 'Broker account details saved successfully.' });
  } catch (err) {
    console.error('Broker error:', err);
    res.json({ success: false, message: 'Server error.' });
  }
});

// GET /api/broker/my
router.get('/my', requireAuth, (req, res) => {
  const db = getDB();
  const account = db.prepare(`
    SELECT id, broker_name, account_login, server_name, account_type, status, submitted_at
    FROM broker_accounts WHERE user_id = ?
  `).get(req.session.userId);
  res.json({ success: true, account: account || null });
});

module.exports = router;
