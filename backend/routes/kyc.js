// routes/kyc.js — Agreement Sign + KYC Upload
const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const router  = express.Router();
const { getDB } = require('../database/db');
const { requireAuth } = require('../middleware/auth');

// Multer storage for NIC images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads/kyc');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname);
    const side = file.fieldname === 'nic_front' ? 'front' : 'back';
    cb(null, `kyc_${req.session.memberId}_${side}_${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg','image/jpg','image/png','image/webp'];
    cb(ok.includes(file.mimetype) ? null : new Error('Images only.'), ok.includes(file.mimetype));
  }
});

// POST /api/kyc/agree  — sign agreement
router.post('/agree', requireAuth, (req, res) => {
  const db = getDB();
  const { signature_confirm } = req.body;
  if (!signature_confirm) return res.json({ success: false, message: 'Agreement confirmation required.' });

  db.prepare(`UPDATE users SET agreement_signed=1, agreement_signed_at=datetime('now') WHERE id=?`)
    .run(req.session.userId);

  res.json({ success: true, message: 'Agreement signed successfully.' });
});

// POST /api/kyc/submit  — upload NIC front + back
router.post('/submit', requireAuth, upload.fields([
  { name: 'nic_front', maxCount: 1 },
  { name: 'nic_back',  maxCount: 1 }
]), (req, res) => {
  try {
    const db = getDB();
    if (!req.files?.nic_front || !req.files?.nic_back)
      return res.json({ success: false, message: 'Both NIC front and back images are required.' });

    const frontFile = req.files.nic_front[0].filename;
    const backFile  = req.files.nic_back[0].filename;

    db.prepare(`
      UPDATE users SET nic_front=?, nic_back=?, kyc_status='pending', kyc_submitted_at=datetime('now') WHERE id=?
    `).run(frontFile, backFile, req.session.userId);

    // Notification to user
    db.prepare(`INSERT INTO notifications (user_id, title, message, type) VALUES (?,?,?,?)`)
      .run(req.session.userId, '📋 KYC Submitted', 'Your NIC documents have been submitted. Verification within 24 hours.', 'info');

    res.json({ success: true, message: 'KYC documents submitted successfully.' });
  } catch (err) {
    console.error('KYC error:', err);
    res.json({ success: false, message: err.message || 'Server error.' });
  }
});

// GET /api/kyc/status
router.get('/status', requireAuth, (req, res) => {
  const db = getDB();
  const user = db.prepare(`
    SELECT agreement_signed, agreement_signed_at, kyc_status, kyc_submitted_at, kyc_verified_at, kyc_note
    FROM users WHERE id=?
  `).get(req.session.userId);
  res.json({ success: true, ...user });
});

module.exports = router;
