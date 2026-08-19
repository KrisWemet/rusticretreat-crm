const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Use JWT_SECRET from env when provided. Otherwise generate one and persist
// it to a gitignored file so tokens survive restarts but can't be forged
// with a known hardcoded default.
function loadSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const secretPath = path.join(__dirname, '..', '.jwt-secret');
  try {
    return fs.readFileSync(secretPath, 'utf8').trim();
  } catch (_) {
    const secret = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(secretPath, secret, { mode: 0o600 });
    return secret;
  }
}

const JWT_SECRET = loadSecret();

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const user = jwt.verify(token, JWT_SECRET);
    // Staff tokens carry userId; reject couple tokens on staff routes
    if (!user.userId) {
      return res.status(403).json({ error: 'Staff access required' });
    }
    req.user = user;
    next();
  } catch (err) {
    // 401, not 403: the token is unusable, so the caller is not authenticated at
    // all. The client ends the session on 401 and merely reports a 403, so
    // conflating them leaves a signed-out user staring at a dashboard whose
    // every request fails, with nothing telling them to log in again.
    return res.status(401).json({ error: 'Invalid or expired token', session_expired: true });
  }
}

function authenticateCouple(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const couple = jwt.verify(token, JWT_SECRET);
    if (!couple.coupleId) {
      return res.status(403).json({ error: 'Invalid couple token' });
    }
    req.couple = couple;
    next();
  } catch (err) {
    // 401, not 403: the token is unusable, so the caller is not authenticated at
    // all. The client ends the session on 401 and merely reports a 403, so
    // conflating them leaves a signed-out user staring at a dashboard whose
    // every request fails, with nothing telling them to log in again.
    return res.status(401).json({ error: 'Invalid or expired token', session_expired: true });
  }
}

// Accepts either a staff or couple token. Sets req.auth with the decoded
// claims. Routes using this MUST check req.auth.coupleId ownership for
// couple tokens before touching couple-scoped data.
function authenticateAny(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded.userId && !decoded.coupleId) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.auth = decoded;
    next();
  } catch (err) {
    // 401, not 403: the token is unusable, so the caller is not authenticated at
    // all. The client ends the session on 401 and merely reports a 403, so
    // conflating them leaves a signed-out user staring at a dashboard whose
    // every request fails, with nothing telling them to log in again.
    return res.status(401).json({ error: 'Invalid or expired token', session_expired: true });
  }
}

module.exports = { authenticateToken, authenticateCouple, authenticateAny, JWT_SECRET };
