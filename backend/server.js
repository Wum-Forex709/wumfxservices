// server.js - Knight Traders Main Server
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors    = require('cors');
const path    = require('path');
const rateLimit = require('express-rate-limit');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: true, credentials: true }));

const limiter     = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
app.use('/api/', limiter);
app.use('/api/auth/', authLimiter);

app.use(session({
  secret: process.env.SESSION_SECRET || 'KnightTradersSecret2025',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure upload directories exist on startup
['uploads/payments', 'uploads/kyc'].forEach(dir => {
  const fullPath = path.join(__dirname, dir);
  if (!require('fs').existsSync(fullPath)) require('fs').mkdirSync(fullPath, { recursive: true });
});

// ══════════════════════════════════════════════════════════════════
// AUTO-DELETE: Verified KYC + Payment screenshots ke 24 ghante baad
// file server se delete ho jati hai — lekin status ACTIVE rehta hai
// ══════════════════════════════════════════════════════════════════
function runAutoDeleteVerifiedFiles() {
  const fs = require('fs');
  const { getDB } = require('./database/db');

  try {
    const db = getDB();
    const DELETE_AFTER_MS = 24 * 60 * 60 * 1000; // 24 hours
    const now = Date.now();

    // ── 1. KYC Screenshots ──────────────────────────────────────
    // Jin users ka kyc_status = 'verified' hai aur 24h guzar gaye
    const verifiedKyc = db.prepare(`
      SELECT id, member_id, nic_front, nic_back, kyc_verified_at
      FROM users
      WHERE kyc_status = 'verified'
        AND kyc_verified_at IS NOT NULL
        AND (nic_front IS NOT NULL OR nic_back IS NOT NULL)
    `).all();

    for (const user of verifiedKyc) {
      const verifiedTime = new Date(user.kyc_verified_at).getTime();
      if (isNaN(verifiedTime)) continue;
      const ageMs = now - verifiedTime;

      if (ageMs >= DELETE_AFTER_MS) {
        let deleted = false;

        // Front image delete
        if (user.nic_front) {
          const filePath = path.join(__dirname, 'uploads', 'kyc', user.nic_front);
          if (fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); deleted = true; } catch(e) {}
          }
          // DB mein path NULL karo — status nahi badlega
          db.prepare(`UPDATE users SET nic_front = NULL WHERE id = ?`).run(user.id);
        }

        // Back image delete
        if (user.nic_back) {
          const filePath = path.join(__dirname, 'uploads', 'kyc', user.nic_back);
          if (fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); deleted = true; } catch(e) {}
          }
          // DB mein path NULL karo — status nahi badlega
          db.prepare(`UPDATE users SET nic_back = NULL WHERE id = ?`).run(user.id);
        }

        if (deleted) {
          console.log(`🗑️  [AutoDelete] KYC images deleted for ${user.member_id} (verified 24h+ ago, status: verified ✅)`);
        }
      }
    }

    // ── 2. Payment Screenshots ──────────────────────────────────
    // Jin payments ka status = 'verified' hai aur 24h guzar gaye
    const verifiedPayments = db.prepare(`
      SELECT id, member_id, screenshot_path, verified_at
      FROM payments
      WHERE status = 'verified'
        AND verified_at IS NOT NULL
        AND screenshot_path IS NOT NULL
    `).all();

    for (const payment of verifiedPayments) {
      const verifiedTime = new Date(payment.verified_at).getTime();
      if (isNaN(verifiedTime)) continue;
      const ageMs = now - verifiedTime;

      if (ageMs >= DELETE_AFTER_MS) {
        const filePath = path.join(__dirname, 'uploads', 'payments', payment.screenshot_path);
        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
            console.log(`🗑️  [AutoDelete] Payment screenshot deleted for ${payment.member_id} (verified 24h+ ago, status: verified ✅)`);
          } catch(e) {}
        }
        // DB mein path NULL karo — payment status nahi badlega
        db.prepare(`UPDATE payments SET screenshot_path = NULL, screenshot_name = NULL WHERE id = ?`).run(payment.id);
      }
    }

  } catch(e) {
    console.error('AutoDelete error:', e.message);
  }
}

// ── GLOBAL CLEANUP SCHEDULER ───────────────────────────────────
// Runs every 24 hours: cleans temp files & vacuums DB
function runGlobalCleanup() {
  console.log('🧹 [Server] Running global cleanup...');
  const fs = require('fs');

  // 1. Pehle verified files auto-delete chalao
  runAutoDeleteVerifiedFiles();

  // 2. Clean any temp files older than 24h from uploads (orphaned/unlinked)
  //    We only delete files not referenced in DB — safe cleanup
  try {
    const { getDB } = require('./database/db');
    const db = getDB();

    // Get all screenshot paths stored in DB (keep these)
    const knownPaymentFiles = db.prepare(`SELECT screenshot_path FROM payments WHERE screenshot_path IS NOT NULL`).all().map(r => r.screenshot_path);
    const knownKycFront     = db.prepare(`SELECT nic_front FROM users WHERE nic_front IS NOT NULL`).all().map(r => r.nic_front);
    const knownKycBack      = db.prepare(`SELECT nic_back  FROM users WHERE nic_back  IS NOT NULL`).all().map(r => r.nic_back);
    const knownFiles        = new Set([...knownPaymentFiles, ...knownKycFront, ...knownKycBack]);

    ['uploads/payments', 'uploads/kyc'].forEach(dir => {
      const fullDir = path.join(__dirname, dir);
      if (!fs.existsSync(fullDir)) return;
      const files = fs.readdirSync(fullDir);
      let deleted = 0;
      files.forEach(file => {
        const filePath = path.join(fullDir, file);
        const stat     = fs.statSync(filePath);
        const ageHours = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60);
        // Delete if older than 24h AND not referenced in DB
        if (ageHours > 24 && !knownFiles.has(file)) {
          try { fs.unlinkSync(filePath); deleted++; } catch(e) {}
        }
      });
      if (deleted > 0) console.log(`🗑️  [Cleanup] Removed ${deleted} orphaned files from ${dir}`);
    });

    // 3. VACUUM database to reclaim freed space
    db.exec('VACUUM');
    console.log('✅ [Cleanup] Database vacuumed — space reclaimed');

  } catch (e) {
    console.error('Global cleanup error:', e.message);
  }
}

// Run once 30s after startup, then every 1 hour check karta rahega
// (hourly check taake same-day verify hone wali files bhi 24h baad delete hon)
setTimeout(() => {
  runGlobalCleanup();
  setInterval(runGlobalCleanup, 60 * 60 * 1000); // har 1 ghante baad
}, 30 * 1000);

// Start after DB is ready
const { initDB } = require('./database/db');
initDB().then(() => {
  app.use('/api/auth',           require('./routes/auth'));
  app.use('/api/payments',       require('./routes/payments'));
  app.use('/api/broker',         require('./routes/broker'));
  app.use('/api/user',           require('./routes/user'));
  app.use('/api/admin',          require('./routes/admin'));
  app.use('/api/referral',       require('./routes/referral'));
  app.use('/api/kyc',            require('./routes/kyc'));
  app.use('/api/mt5',            require('./routes/mt5'));
  // ── Myfxbook: public testimonials + admin management ──
  app.use('/api/myfxbook',       require('./routes/myfxbook'));
  app.use('/api/admin/myfxbook', require('./routes/myfxbook'));
  const communityRoute = require('./routes/community');
  app.use('/api/community', communityRoute);
  communityRoute.initCommunity();

  app.use(express.static(path.join(__dirname, '../frontend')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
  });

  app.listen(PORT, () => {
    console.log(`\n🏇 Knight Traders Server Running`);
    console.log(`📡 http://localhost:${PORT}`);
    console.log(`🔐 Admin: admin@knighttraders.com / Admin@Knight2025\n`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
