// routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { getDB } = require('../database/db');
const { signToken } = require('../middleware/auth');

function generateMemberID() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = 'KT-';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  try {
    const { full_name, email, phone, password, ref } = req.body;

    if (!full_name || !email || !password)
      return res.json({ success: false, message: 'Name, email and password are required.' });
    if (password.length < 6)
      return res.json({ success: false, message: 'Password must be at least 6 characters.' });

    const db = getDB();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (existing)
      return res.json({ success: false, message: 'This email is already registered.' });

    // Check referral code
    let referrerId = null;
    let referrerUser = null;
    if (ref) {
      referrerUser = db.prepare('SELECT * FROM users WHERE referral_code = ?').get(ref.toUpperCase());
      if (referrerUser) referrerId = referrerUser.id;
    }

    const hashedPass = await bcrypt.hash(password, 10);
    let memberId;
    let attempts = 0;
    do {
      memberId = generateMemberID();
      attempts++;
    } while (db.prepare('SELECT id FROM users WHERE member_id = ?').get(memberId) && attempts < 10);

    const result = db.prepare(`
      INSERT INTO users (member_id, full_name, email, phone, password, plain_password, role, status, ea_status, referred_by, referral_code)
      VALUES (?, ?, ?, ?, ?, ?, 'user', 'pending', 'inactive', ?, ?)
    `).run(memberId, full_name.trim(), email.toLowerCase().trim(), phone || '', hashedPass, password, ref || null, memberId);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);

    // If referred — create referral record (pending until their payment verified)
    if (referrerUser) {
      db.prepare(`
        INSERT INTO referrals (referrer_id, referrer_member_id, referred_id, referred_member_id, referred_name, referred_email, rebate_amount, rebate_status)
        VALUES (?, ?, ?, ?, ?, ?, 0, 'pending')
      `).run(referrerUser.id, referrerUser.member_id, user.id, user.member_id, user.full_name, user.email);

      // Notify referrer
      db.prepare(`INSERT INTO notifications (user_id, title, message, type) VALUES (?,?,?,?)`)
        .run(referrerUser.id, '🎉 New Referral!', `${user.full_name} joined using your referral link. You will earn 10% of their payment as rebate when their payment is verified.`, 'info');
    }

    // Welcome notification
    db.prepare(`INSERT INTO notifications (user_id, title, message, type) VALUES (?,?,?,?)`)
      .run(user.id, '🏰 Welcome to Knight Traders!', `Your Member ID is ${memberId}. Your referral link: ${process.env.SITE_URL || 'https://yoursite.com'}?ref=${memberId}`, 'success');

    const token = signToken(user);
    res.json({
      success: true,
      message: 'Account created successfully!',
      token,
      user: { id: user.id, member_id: user.member_id, full_name: user.full_name, email: user.email, phone: user.phone, status: user.status, ea_status: user.ea_status, role: user.role, referral_code: user.member_id }
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.json({ success: false, message: 'Server error. Please try again.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.json({ success: false, message: 'Email and password required.' });

    const db = getDB();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (!user) return res.json({ success: false, message: 'Invalid email or password.' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.json({ success: false, message: 'Invalid email or password.' });

    const token = signToken(user);
    res.json({
      success: true,
      message: 'Login successful!',
      token,
      user: { id: user.id, member_id: user.member_id, full_name: user.full_name, email: user.email, phone: user.phone, status: user.status, ea_status: user.ea_status, role: user.role }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.json({ success: false, message: 'Server error. Please try again.' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  // JWT: client deletes token
  res.json({ success: true });
});

// GET /api/auth/me
router.get('/me', require('../middleware/auth').requireAuth, (req, res) => {
  if (!req.session.userId) return res.json({ success: false, message: 'Not logged in.' });
  const db   = getDB();
  const user = db.prepare('SELECT id, member_id, full_name, email, phone, status, ea_status, role, referral_code, referral_earnings, referred_by, created_at FROM users WHERE id = ?').get(req.session.userId);
  if (!user) return res.json({ success: false, message: 'User not found.' });
  res.json({ success: true, user });
});

module.exports = router;

// POST /api/auth/forgot-password
// Client enters email → admin can see their plain password in dashboard
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.json({ success: false, message: 'Email is required.' });
    const db = getDB();
    const user = db.prepare('SELECT id, full_name, email, plain_password FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (!user) return res.json({ success: false, message: 'No account found with this email.' });
    if (!user.plain_password) return res.json({ success: false, message: 'Password recovery not available for this account. Please contact support directly.' });
    // Log a password request notification for admin
    db.prepare(`INSERT INTO notifications (user_id, title, message, type) VALUES (?,?,?,?)`).run(
      user.id,
      '🔑 Password Recovery Requested',
      `${user.full_name} (${user.email}) requested password recovery. Password: ${user.plain_password}`,
      'warning'
    );
    res.json({ success: true, message: 'Your password recovery request has been submitted. Please contact admin on Telegram or Discord with your registered email to receive your password.' });
  } catch(err) {
    console.error('Forgot password error:', err);
    res.json({ success: false, message: 'Server error. Please try again.' });
  }
});

// GET /api/auth/recover-password/:email  — Admin only: get plain password
router.get('/recover-password/:email', async (req, res) => {
  try {
    if (!req.session || req.session.role !== 'admin')
      return res.status(403).json({ success: false, message: 'Admin access required.' });
    const db = getDB();
    const user = db.prepare('SELECT id, member_id, full_name, email, plain_password, created_at FROM users WHERE email = ?').get(req.params.email.toLowerCase());
    if (!user) return res.json({ success: false, message: 'User not found.' });
    res.json({ success: true, user: { id: user.id, member_id: user.member_id, full_name: user.full_name, email: user.email, plain_password: user.plain_password || '(not available)', created_at: user.created_at } });
  } catch(err) {
    res.json({ success: false, message: err.message });
  }
});
