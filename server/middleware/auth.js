const jwt = require('jsonwebtoken');

if (!process.env.JWT_SECRET) {
  throw new Error("FATAL: JWT_SECRET environment variable is not defined!");
}
const JWT_SECRET = process.env.JWT_SECRET;

function authenticateToken(req, res, next) {
  // Try to read token from cookies first (secure httpOnly), then fall back to Authorization header
  let token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.split(' ')[1]
    : null;

  if (!token && req.cookies) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { id: userId, email: userEmail, name: userName }
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token.' });
  }
}

module.exports = {
  authenticateToken,
  JWT_SECRET
};
