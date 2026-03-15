// routes/admin.js
const express = require('express');
const path    = require('path');
const router  = express.Router();
const { getDB } = require('../database/db');
const { requireAdmin } = require('../middleware/auth');

// GET /api/admin/stats
router.get('/stats', requireAdmin, (req, res) => {
  const db = getDB();
  const totalUsers      = db.prepare(`SELECT COUNT(*) as c FROM users WHERE role='user'`).get().c;
  const activeUsers     = db.prepare(`SELECT COUNT(*) as c FROM users WHERE status='active' AND role='user'`).get().c;
  const pendingPayments = db.prepare(`SELECT COUNT(*) as c FROM payments WHERE status='pending'`).get().c;
  const totalPayments   = db.prepare(`SELECT COUNT(*) as c FROM payments WHERE status='verified'`).get().c;
  const totalRevenue    = db.prepare(`SELECT COALESCE(SUM(amount),0) as s FROM payments WHERE status='verified'`).get().s;
  const brokerAccounts  = db.prepare(`SELECT COUNT(*) as c FROM broker_accounts`).get().c;
  const totalReferrals  = db.prepare(`SELECT COUNT(*) as c FROM referrals`).get().c;
  const paidReferrals   = db.prepare(`SELECT COUNT(*) as c FROM referrals WHERE rebate_status='paid'`).get().c;
  const totalRebates    = db.prepare(`SELECT COALESCE(SUM(rebate_amount),0) as s FROM referrals WHERE rebate_status='paid'`).get().s;
  res.json({ success: true, stats: { totalUsers, activeUsers, pendingPayments, totalPayments, totalRevenue, brokerAccounts, totalReferrals, paidReferrals, totalRebates } });
});

// GET /api/admin/users
router.get('/users', requireAdmin, (req, res) => {
  const db = getDB();
  const users = db.prepare(`
    SELECT u.id, u.member_id, u.full_name, u.email, u.phone, u.status, u.ea_status,
           u.referred_by, u.referral_earnings, u.created_at,
           u.kyc_status, u.agreement_signed,
           (SELECT COUNT(*) FROM payments WHERE user_id=u.id AND status='verified') as verified_payments,
           (SELECT COUNT(*) FROM referrals WHERE referrer_id=u.id) as total_referrals
    FROM users u WHERE u.role='user' ORDER BY u.created_at DESC
  `).all();
  res.json({ success: true, users });
});

// POST /api/admin/users/:id/status
router.post('/users/:id/status', requireAdmin, (req, res) => {
  const { status, ea_status } = req.body;
  const db = getDB();
  if (status)    db.prepare('UPDATE users SET status=? WHERE id=?').run(status, req.params.id);
  if (ea_status) db.prepare('UPDATE users SET ea_status=? WHERE id=?').run(ea_status, req.params.id);
  if (status === 'active' || ea_status === 'active') {
    db.prepare(`INSERT INTO notifications (user_id,title,message,type) VALUES (?,?,?,?)`)
      .run(req.params.id, '🎉 Account Activated!', 'Your account has been activated. EA is now running on your broker account.', 'success');
  }
  res.json({ success: true, message: 'Status updated.' });
});

// GET /api/admin/payments
router.get('/payments', requireAdmin, (req, res) => {
  const db = getDB();
  const payments = db.prepare(`
    SELECT p.*, u.full_name, u.email FROM payments p
    JOIN users u ON p.user_id=u.id ORDER BY p.submitted_at DESC
  `).all();
  res.json({ success: true, payments });
});

// POST /api/admin/payments/:id/verify  — also credits referral rebate
router.post('/payments/:id/verify', requireAdmin, (req, res) => {
  const { action, note } = req.body;
  const db = getDB();
  const payment = db.prepare('SELECT * FROM payments WHERE id=?').get(req.params.id);
  if (!payment) return res.json({ success: false, message: 'Payment not found.' });

  const newStatus = action === 'verify' ? 'verified' : action === 'unverify' ? 'pending' : 'rejected';
  const verifiedAt = action === 'unverify' ? null : "datetime('now')";
  if (action === 'unverify') {
    db.prepare(`UPDATE payments SET status='pending', admin_note='', verified_at=NULL WHERE id=?`).run(req.params.id);
  } else {
    db.prepare(`UPDATE payments SET status=?, admin_note=?, verified_at=datetime('now') WHERE id=?`)
      .run(newStatus, note || '', req.params.id);
  }

  if (action === 'unverify') {
    db.prepare(`UPDATE users SET status='inactive' WHERE id=?`).run(payment.user_id);
    db.prepare(`INSERT INTO notifications (user_id,title,message,type) VALUES (?,?,?,?)`)
      .run(payment.user_id, '⏳ Payment Pending', `Your payment verification has been reset to pending. Please contact support if needed.`, 'info');
    return res.json({ success: true, message: 'Payment set to pending.' });
  }

  if (action === 'verify') {
    db.prepare(`UPDATE users SET status='active' WHERE id=?`).run(payment.user_id);
    db.prepare(`INSERT INTO notifications (user_id,title,message,type) VALUES (?,?,?,?)`)
      .run(payment.user_id, '✅ Payment Verified!', `Your $${payment.amount} payment for ${payment.plan_label||'1 Month'} plan is verified. Submit broker details to activate EA.`, 'success');

    // Credit referral rebate to referrer
    const referral = db.prepare(`
      SELECT * FROM referrals WHERE referred_id=? AND rebate_status='pending'
    `).get(payment.user_id);

    if (referral) {
      const rebate10pct = Math.round(payment.amount * 0.10 * 100) / 100;
      db.prepare(`UPDATE referrals SET rebate_status='paid', paid_at=datetime('now'), rebate_amount=? WHERE id=?`)
        .run(rebate10pct, referral.id);
      db.prepare(`UPDATE users SET referral_earnings=referral_earnings+? WHERE id=?`)
        .run(rebate10pct, referral.referrer_id);
      db.prepare(`INSERT INTO notifications (user_id,title,message,type) VALUES (?,?,?,?)`)
        .run(referral.referrer_id, '💰 Referral Rebate Credited!', `$${rebate10pct} has been credited to your account (10% of $${payment.amount} payment) for referring ${referral.referred_name}.`, 'success');
    }
  } else {
    db.prepare(`INSERT INTO notifications (user_id,title,message,type) VALUES (?,?,?,?)`)
      .run(payment.user_id, '❌ Payment Rejected', `Your payment was rejected. Reason: ${note || 'Please contact support.'}`, 'error');
  }
  res.json({ success: true, message: `Payment ${newStatus}.` });
});

// GET /api/admin/brokers
router.get('/brokers', requireAdmin, (req, res) => {
  const db = getDB();
  const accounts = db.prepare(`
    SELECT b.*, u.full_name, u.email, u.status as user_status
    FROM broker_accounts b JOIN users u ON b.user_id=u.id ORDER BY b.submitted_at DESC
  `).all();
  res.json({ success: true, accounts });
});

// POST /api/admin/brokers/:id/ea-activate
router.post('/brokers/:id/ea-activate', requireAdmin, (req, res) => {
  const { ea_status } = req.body;
  const db = getDB();
  const broker = db.prepare('SELECT * FROM broker_accounts WHERE id=?').get(req.params.id);
  if (!broker) return res.json({ success: false, message: 'Account not found.' });
  db.prepare('UPDATE broker_accounts SET status=? WHERE id=?').run(ea_status, req.params.id);
  db.prepare('UPDATE users SET ea_status=? WHERE id=?').run(ea_status === 'ea_running' ? 'active' : 'inactive', broker.user_id);
  if (ea_status === 'ea_running') {
    db.prepare(`INSERT INTO notifications (user_id,title,message,type) VALUES (?,?,?,?)`)
      .run(broker.user_id, '🚀 EA Activated!', 'Expert Advisor is now running on your broker account. Expected returns: 30-40% monthly.', 'success');
  }
  res.json({ success: true, message: 'EA status updated.' });
});

// GET /api/admin/referrals  — all referral records
router.get('/referrals', requireAdmin, (req, res) => {
  const db = getDB();
  const referrals = db.prepare(`
    SELECT r.*,
      ru.full_name as referrer_name, ru.email as referrer_email,
      eu.full_name as referred_full_name, eu.status as referred_account_status
    FROM referrals r
    JOIN users ru ON r.referrer_id=ru.id
    JOIN users eu ON r.referred_id=eu.id
    ORDER BY r.joined_at DESC
  `).all();
  // Group by referrer
  const byReferrer = {};
  referrals.forEach(r => {
    if (!byReferrer[r.referrer_member_id]) {
      byReferrer[r.referrer_member_id] = {
        referrer_member_id: r.referrer_member_id,
        referrer_name: r.referrer_name,
        referrer_email: r.referrer_email,
        total: 0, paid: 0, pending: 0,
        total_earned: 0,
        referrals: []
      };
    }
    byReferrer[r.referrer_member_id].total++;
    if (r.rebate_status === 'paid') { byReferrer[r.referrer_member_id].paid++; byReferrer[r.referrer_member_id].total_earned += r.rebate_amount; }
    else byReferrer[r.referrer_member_id].pending++;
    byReferrer[r.referrer_member_id].referrals.push(r);
  });
  res.json({ success: true, referrals, byReferrer: Object.values(byReferrer), total: referrals.length });
});

// GET /api/admin/screenshot/:filename
router.get('/screenshot/:filename', requireAdmin, (req, res) => {
  const fp = path.join(__dirname, '../uploads/payments', req.params.filename);
  res.sendFile(fp, err => { if (err) res.status(404).json({ success: false, message: 'File not found.' }); });
});

// GET /api/admin/kyc-image/:filename  — serve KYC images (admin only, protected)
router.get('/kyc-image/:filename', requireAdmin, (req, res) => {
  // Prevent path traversal attacks
  const filename = path.basename(req.params.filename);
  const fp = path.join(__dirname, '../uploads/kyc', filename);
  res.sendFile(fp, err => {
    if (err) res.status(404).json({ success: false, message: 'KYC image not found.' });
  });
});

// POST /api/admin/settings
router.post('/settings', requireAdmin, (req, res) => {
  const { usdt_address, binance_id, monthly_fee, quarterly_fee, sixmonth_fee, yearly_fee,
          referral_link, account_title, discord_invite, telegram_id, referral_rebate } = req.body;
  const db = getDB();
  const set = db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)');
  if (usdt_address)    set.run('usdt_address',    usdt_address);
  if (binance_id)      set.run('binance_id',       binance_id);
  if (monthly_fee)     set.run('monthly_fee',      monthly_fee);
  if (quarterly_fee)   set.run('quarterly_fee',    quarterly_fee);
  if (sixmonth_fee)    set.run('sixmonth_fee',     sixmonth_fee);
  if (yearly_fee)      set.run('yearly_fee',       yearly_fee);
  if (referral_link)   set.run('referral_link',    referral_link);
  if (account_title)   set.run('account_title',    account_title);
  if (discord_invite)  set.run('discord_invite',   discord_invite);
  if (telegram_id)     set.run('telegram_id',      telegram_id);
  if (referral_rebate) set.run('referral_rebate',  referral_rebate);
  res.json({ success: true, message: 'Settings updated.' });
});

// GET /api/admin/settings
router.get('/settings', requireAdmin, (req, res) => {
  const db = getDB();
  const rows = db.prepare('SELECT * FROM settings').all();
  const s = {};
  rows.forEach(r => s[r.key] = r.value);
  res.json({ success: true, settings: s });
});

// GET /api/admin/kyc  — list all KYC submissions
router.get('/kyc', requireAdmin, (req, res) => {
  const db = getDB();
  const list = db.prepare(`
    SELECT id, member_id, full_name, email,
           kyc_status, nic_front, nic_back,
           kyc_submitted_at, kyc_verified_at, kyc_note
    FROM users WHERE kyc_status != 'not_submitted'
    ORDER BY kyc_submitted_at DESC
  `).all();
  res.json({ success: true, kyc: list });
});

// POST /api/admin/kyc/:id/verify
router.post('/kyc/:id/verify', requireAdmin, (req, res) => {
  const db = getDB();
  const { action, note } = req.body;  // action: 'approve' | 'reject'
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.json({ success: false, message: 'User not found.' });

  if (action === 'approve') {
    db.prepare(`UPDATE users SET kyc_status='verified', kyc_verified_at=datetime('now'), kyc_note=? WHERE id=?`)
      .run(note || '', req.params.id);
    db.prepare(`INSERT INTO notifications (user_id, title, message, type) VALUES (?,?,?,?)`)
      .run(user.id, '✅ KYC Verified!', 'Your identity has been verified. Your account is now fully activated.', 'success');
  } else {
    db.prepare(`UPDATE users SET kyc_status='rejected', kyc_note=? WHERE id=?`)
      .run(note || 'Documents unclear. Please resubmit.', req.params.id);
    db.prepare(`INSERT INTO notifications (user_id, title, message, type) VALUES (?,?,?,?)`)
      .run(user.id, '❌ KYC Rejected', `Your KYC documents were rejected. Reason: ${note || 'Documents unclear. Please resubmit.'}`, 'error');
  }
  res.json({ success: true, message: `KYC ${action}d.` });
});

// ─── REFERRAL WITHDRAWAL REQUESTS ───────────────────────────────────────────

// GET /api/admin/withdrawals  — list all withdrawal requests
router.get('/withdrawals', requireAdmin, (req, res) => {
  const db = getDB();
  const withdrawals = db.prepare(`
    SELECT w.*, u.email, u.phone
    FROM withdrawal_requests w
    JOIN users u ON w.user_id = u.id
    ORDER BY w.requested_at DESC
  `).all();
  const pending = withdrawals.filter(w => w.status === 'pending').length;
  res.json({ success: true, withdrawals, pending_count: pending });
});

// POST /api/admin/withdrawals/:id/process  — approve or reject
router.post('/withdrawals/:id/process', requireAdmin, (req, res) => {
  const { action, note } = req.body; // action: 'approve' | 'reject'
  const db = getDB();
  const wr = db.prepare('SELECT * FROM withdrawal_requests WHERE id=?').get(req.params.id);
  if (!wr) return res.json({ success: false, message: 'Request not found.' });
  if (wr.status !== 'pending') return res.json({ success: false, message: 'Request already processed.' });

  if (action === 'approve') {
    db.prepare(`UPDATE withdrawal_requests SET status='approved', admin_note=?, processed_at=datetime('now') WHERE id=?`)
      .run(note || '', req.params.id);
    db.prepare(`INSERT INTO notifications (user_id, title, message, type) VALUES (?,?,?,?)`)
      .run(wr.user_id, '✅ Withdrawal Approved!', `Your withdrawal of $${wr.amount.toFixed(2)} has been approved and will be sent to your wallet shortly.`, 'success');
  } else {
    // Refund the amount back to user's referral_earnings
    db.prepare(`UPDATE users SET referral_earnings = referral_earnings + ? WHERE id=?`).run(wr.amount, wr.user_id);
    db.prepare(`UPDATE withdrawal_requests SET status='rejected', admin_note=?, processed_at=datetime('now') WHERE id=?`)
      .run(note || '', req.params.id);
    db.prepare(`INSERT INTO notifications (user_id, title, message, type) VALUES (?,?,?,?)`)
      .run(wr.user_id, '❌ Withdrawal Rejected', `Your withdrawal request of $${wr.amount.toFixed(2)} was rejected. Reason: ${note || 'Contact support'}. Amount refunded to your balance.`, 'error');
  }
  res.json({ success: true, message: `Withdrawal ${action}d.` });
});

module.exports = router;
