// middleware/auth.js
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  return res.status(401).json({ success: false, message: 'Please login first.' });
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.role === 'admin') {
    return next();
  }
  return res.status(403).json({ success: false, message: 'Admin access required.' });
}

module.exports = { requireAuth, requireAdmin };
