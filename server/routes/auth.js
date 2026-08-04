const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { JWT_SECRET, authenticateToken } = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');

// Both login endpoints were unlimited while the public inquiry and contract
// routes were limited — an omission, not a policy. bcrypt throttles throughput
// but nothing capped attempts, so a known email could be guessed indefinitely.
const loginLimiter = rateLimit({ windowMs: 900000, max: 10, name: 'staff-login' });
const coupleLoginLimiter = rateLimit({ windowMs: 900000, max: 10, name: 'couple-login' });

// Staff/Admin login
router.post('/login', loginLimiter, (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // A null hash means the account was disabled (see the credential bootstrap in
  // db.js). bcrypt.compareSync would throw on null rather than return false.
  if (!user.password_hash) {
    return res.status(401).json({ error: 'This account has been disabled. Contact an administrator.' });
  }

  const validPassword = bcrypt.compareSync(password, user.password_hash);
  if (!validPassword) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { userId: user.id, email: user.email, name: user.name, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    }
  });
});

// Couple portal login
router.post('/couple-login', coupleLoginLimiter, (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const couple = db.prepare('SELECT * FROM couples WHERE email = ?').get(email);

  if (!couple) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  if (!couple.password_hash) {
    return res.status(401).json({ error: 'Portal access not set up yet. Please contact your venue coordinator.' });
  }

  const validPassword = bcrypt.compareSync(password, couple.password_hash);
  if (!validPassword) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    {
      coupleId: couple.id,
      email: couple.email,
      partner1_name: couple.partner1_name,
      partner2_name: couple.partner2_name
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({
    token,
    couple: {
      id: couple.id,
      partner1_name: couple.partner1_name,
      partner2_name: couple.partner2_name,
      email: couple.email,
      wedding_date: couple.wedding_date,
      venue_package: couple.venue_package,
      status: couple.status
    }
  });
});

// Get current user info
router.get('/me', authenticateToken, (req, res) => {
  const user = db.prepare('SELECT id, name, email, role, created_at FROM users WHERE id = ?').get(req.user.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

module.exports = router;
