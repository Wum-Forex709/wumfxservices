// routes/referral.js
const express = require('express');
const router  = express.Router();
const { getDB } = require('../database/db');
const { requireAuth } = require('../middleware/auth');

const MIN_WITHDRAWAL = 50; // Minimum $50 to withdraw

// GET /api/referral/my  — get my referrals + earnings
router.get('/my', requireAuth, (req, res) => {
  const db = getDB();
  const userId = req.session.userId;

  const user = db.prepare('SELECT member_id, referral_code, referral_earnings FROM users WHERE id = ?').get(userId);

  const referrals = db.prepare(`
    SELECT r.*, u.status as referred_status, u.ea_status
    FROM referrals r
    JOIN users u ON r.referred_id = u.id
    WHERE r.referrer_id = ?
    ORDER BY r.joined_at DESC
  `).all(userId);

  const totalReferrals = referrals.length;
  const paidReferrals  = referrals.filter(r => r.rebate_status === 'paid').length;
  const pendingEarnings = referrals.filter(r => r.rebate_status === 'pending').length * 20;
  const totalEarned = user.referral_earnings || 0;

  // Pending withdrawals
  const pendingWithdrawals = db.prepare(`
    SELECT COALESCE(SUM(amount),0) as total FROM withdrawal_requests
    WHERE user_id = ? AND status = 'pending'
  `).get(userId).total;

  // Build referral link from settings
  const settings = db.prepare('SELECT * FROM settings').all();
  const sMap = {};
  settings.forEach(s => sMap[s.key] = s.value);

  res.json({
    success: true,
    referral_code: user.referral_code || user.member_id,
    referral_earnings: totalEarned,
    pending_earnings: pendingEarnings,
    pending_withdrawals: pendingWithdrawals,
    total_referrals: totalReferrals,
    paid_referrals: paidReferrals,
    can_withdraw: totalEarned >= MIN_WITHDRAWAL,
    min_withdrawal: MIN_WITHDRAWAL,
    referrals,
    site_url: sMap.site_url || ''
  });
});

// POST /api/referral/withdraw  — request a withdrawal
router.post('/withdraw', requireAuth, (req, res) => {
  const db = getDB();
  const userId = req.session.userId;
  const { wallet_address } = req.body;

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const balance = user.referral_earnings || 0;

  if (balance < MIN_WITHDRAWAL) {
    return res.status(400).json({ success: false, message: `Minimum $${MIN_WITHDRAWAL} required to withdraw. Your balance: $${balance.toFixed(2)}` });
  }

  // Check no pending withdrawal already
  const existing = db.prepare(`SELECT id FROM withdrawal_requests WHERE user_id=? AND status='pending'`).get(userId);
  if (existing) {
    return res.status(400).json({ success: false, message: 'You already have a pending withdrawal request.' });
  }

  const amount = balance;

  // Deduct from referral_earnings immediately
  db.prepare(`UPDATE users SET referral_earnings = 0 WHERE id = ?`).run(userId);

  // Create withdrawal request
  db.prepare(`
    INSERT INTO withdrawal_requests (user_id, member_id, full_name, amount, wallet_address, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `).run(userId, user.member_id, user.full_name, amount, wallet_address || '');

  // Notify client
  db.prepare(`INSERT INTO notifications (user_id, title, message, type) VALUES (?,?,?,?)`).run(
    userId,
    '⏳ Withdrawal Request Submitted',
    `Your withdrawal request of $${amount.toFixed(2)} has been submitted. Admin will process it shortly.`,
    'info'
  );

  res.json({ success: true, message: `Withdrawal request of $${amount.toFixed(2)} submitted successfully!` });
});

// GET /api/referral/withdrawals  — my withdrawal history
router.get('/withdrawals', requireAuth, (req, res) => {
  const db = getDB();
  const userId = req.session.userId;
  const withdrawals = db.prepare(`
    SELECT * FROM withdrawal_requests WHERE user_id = ? ORDER BY requested_at DESC
  `).all(userId);
  res.json({ success: true, withdrawals });
});

module.exports = router;
