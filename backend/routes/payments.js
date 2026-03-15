// routes/payments.js
const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const router  = express.Router();
const { getDB } = require('../database/db');
const { requireAuth } = require('../middleware/auth');

const PLANS = {
  monthly:   { label: '1 Month',   amount: 50  },
  quarterly: { label: '3 Months',  amount: 120 },
  sixmonth:  { label: '6 Months',  amount: 250 },
  yearly:    { label: '12 Months', amount: 500 },
};

const REFERRAL_COMMISSION_PCT = 10; // 10% of payment amount goes to referrer

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads/payments');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `payment_${req.session.memberId}_${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg','image/jpg','image/png','image/gif','image/webp'];
    cb(ok.includes(file.mimetype) ? null : new Error('Images only.'), ok.includes(file.mimetype));
  }
});

// POST /api/payments/submit
router.post('/submit', requireAuth, upload.single('screenshot'), (req, res) => {
  try {
    if (!req.file) return res.json({ success: false, message: 'Payment screenshot is required.' });

    const db = getDB();
    const userId   = req.session.userId;
    const memberId = req.session.memberId;
    const planKey  = req.body.plan || 'monthly';
    const plan     = PLANS[planKey] || PLANS.monthly;
    const finalAmount = plan.amount;

    // AI-detected amount from frontend analysis
    const aiDetectedAmount = parseFloat(req.body.ai_detected_amount) || null;

    const pending = db.prepare(`SELECT id FROM payments WHERE user_id=? AND status='pending'`).get(userId);
    if (pending) return res.json({ success: false, message: 'You already have a payment under review.' });

    const result = db.prepare(`
      INSERT INTO payments (user_id, member_id, plan, plan_label, amount, screenshot_path, screenshot_name, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(userId, memberId, planKey, plan.label, finalAmount, req.file.filename, req.file.originalname);

    const paymentId = result.lastInsertRowid;

    // --- REFERRAL COMMISSION: 10% of payment amount ---
    const referralRow = db.prepare(`SELECT referrer_id FROM referrals WHERE referred_id = ? LIMIT 1`).get(userId);

    if (referralRow && referralRow.referrer_id) {
      const referrerId = referralRow.referrer_id;

      // Use AI-detected amount if reasonable, else use plan amount
      let commissionBase = finalAmount;
      if (aiDetectedAmount && aiDetectedAmount > 0 && aiDetectedAmount <= finalAmount * 1.5) {
        commissionBase = aiDetectedAmount;
      }

      const commissionAmount = Math.round(commissionBase * REFERRAL_COMMISSION_PCT / 100 * 100) / 100;

      db.prepare(`UPDATE users SET referral_earnings = referral_earnings + ? WHERE id = ?`)
        .run(commissionAmount, referrerId);

      db.prepare(`
        UPDATE referrals SET rebate_status='paid', rebate_amount=rebate_amount+?, paid_at=CURRENT_TIMESTAMP
        WHERE referrer_id=? AND referred_id=?
      `).run(commissionAmount, referrerId, userId);

      db.prepare(`INSERT INTO notifications (user_id, title, message, type) VALUES (?,?,?,?)`)
        .run(
          referrerId,
          '💰 Referral Commission Earned!',
          `Aapke referral ne payment kar di! Aapko $${commissionAmount.toFixed(2)} USDT (${REFERRAL_COMMISSION_PCT}% commission) mili. Referral dashboard check karein.`,
          'success'
        );

      console.log(`[Referral] User ${userId} paid $${commissionBase}. Referrer ${referrerId} gets $${commissionAmount} commission.`);
    }

    db.prepare(`INSERT INTO notifications (user_id, title, message, type) VALUES (?,?,?,?)`)
      .run(userId, '📤 Payment Submitted', `Your $${finalAmount} USDT payment for ${plan.label} plan is under review. Verification within 24 hours.`, 'info');

    res.json({
      success: true,
      message: 'Payment submitted! Verification within 24 hours.',
      payment_id: paymentId,
      ai_detected_amount: aiDetectedAmount,
      final_amount: finalAmount
    });
  } catch (err) {
    console.error('Payment error:', err);
    res.json({ success: false, message: err.message || 'Server error.' });
  }
});

// GET /api/payments/my
router.get('/my', requireAuth, (req, res) => {
  const db = getDB();
  const payments = db.prepare(`
    SELECT id, plan, plan_label, amount, currency, screenshot_name, status, admin_note, submitted_at, verified_at
    FROM payments WHERE user_id=? ORDER BY submitted_at DESC
  `).all(req.session.userId);
  res.json({ success: true, payments });
});

module.exports = router;
