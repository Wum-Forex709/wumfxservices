// middleware/auth.js — JWT based
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'KnightTradersJWT2025Secret';

function getToken(req) {
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

function requireAuth(req, res, next) {
  const token = getToken(req);
  if (!token) return res.status(401).json({ success: false, message: 'Please login first.' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.session = { userId: decoded.userId, memberId: decoded.memberId, role: decoded.role };
    next();
  } catch(e) {
    return res.status(401).json({ success: false, message: 'Session expired. Please login again.' });
  }
}

function requireAdmin(req, res, next) {
  const token = getToken(req);
  if (!token) return res.status(403).json({ success: false, message: 'Admin access required.' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'admin') return res.status(403).json({ success: false, message: 'Admin access required.' });
    req.session = { userId: decoded.userId, memberId: decoded.memberId, role: decoded.role };
    next();
  } catch(e) {
    return res.status(403).json({ success: false, message: 'Admin access required.' });
  }
}

function signToken(user) {
  return jwt.sign(
    { userId: user.id, memberId: user.member_id, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

module.exports = { requireAuth, requireAdmin, signToken };
