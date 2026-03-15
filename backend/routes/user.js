// routes/user.js
const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { getDB } = require('../database/db');
const { requireAuth } = require('../middleware/auth');

// GET /api/user/dashboard
router.get('/dashboard', requireAuth, (req, res) => {
  const db = getDB();
  const user = db.prepare(`
    SELECT id, member_id, full_name, email, phone, status, ea_status,
           agreement_signed, agreement_signed_at,
           kyc_status, kyc_submitted_at, kyc_verified_at, kyc_note,
           created_at
    FROM users WHERE id = ?
  `).get(req.session.userId);

  const payments = db.prepare(`
    SELECT id, plan, plan_label, amount, currency, screenshot_name, status, admin_note, submitted_at, verified_at
    FROM payments WHERE user_id = ? ORDER BY submitted_at DESC
  `).all(req.session.userId);

  const broker = db.prepare(`
    SELECT broker_name, account_login, server_name, account_type, status
    FROM broker_accounts WHERE user_id = ?
  `).get(req.session.userId);

  const unread = db.prepare(`
    SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0
  `).get(req.session.userId);

  const settings = {};
  const rows = db.prepare('SELECT key, value FROM settings').all();
  rows.forEach(r => settings[r.key] = r.value);

  res.json({
    success: true,
    user,
    payments,
    broker: broker || null,
    unread_notifications: unread.count,
    settings
  });
});

// GET /api/user/notifications
router.get('/notifications', requireAuth, (req, res) => {
  const db = getDB();
  const notifications = db.prepare(`
    SELECT id, title, message, type, is_read, created_at
    FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20
  `).all(req.session.userId);
  res.json({ success: true, notifications });
});

// POST /api/user/notifications/read
router.post('/notifications/read', requireAuth, (req, res) => {
  const db = getDB();
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.session.userId);
  res.json({ success: true });
});

// POST /api/user/profile/update
router.post('/profile/update', requireAuth, (req, res) => {
  try {
    const { full_name, phone } = req.body;
    const db = getDB();
    db.prepare('UPDATE users SET full_name=?, phone=?, updated_at=datetime(\'now\') WHERE id=?')
      .run(full_name, phone, req.session.userId);
    res.json({ success: true, message: 'Profile updated.' });
  } catch (err) {
    res.json({ success: false, message: 'Error updating profile.' });
  }
});

// POST /api/user/password/change
router.post('/password/change', requireAuth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const db = getDB();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
    const match = await bcrypt.compare(current_password, user.password);
    if (!match) return res.json({ success: false, message: 'Current password is incorrect.' });
    if (new_password.length < 6) return res.json({ success: false, message: 'New password must be at least 6 characters.' });
    const hash = await bcrypt.hash(new_password, 10);
    db.prepare('UPDATE users SET password=? WHERE id=?').run(hash, req.session.userId);
    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (err) {
    res.json({ success: false, message: 'Error changing password.' });
  }
});

module.exports = router;
