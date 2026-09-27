const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { JWT_SECRET, authenticateToken, requireAdmin } = require('../middleware/auth');
const { logActivity } = require('../services/activity');
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

// Staff names, for the "Assigned To" choice on tasks.
router.get('/staff', authenticateToken, (req, res) => {
  res.json(db.prepare('SELECT id, name FROM users ORDER BY name').all());
});

// Get current user info
router.get('/me', authenticateToken, (req, res) => {
  const user = db.prepare('SELECT id, name, email, role, created_at FROM users WHERE id = ?').get(req.user.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// ── Staff accounts ───────────────────────────────────────────────────────────
const MIN_PASSWORD = 10;
const publicUser = u => ({ id: u.id, name: u.name, email: u.email, role: u.role, created_at: u.created_at, disabled: !u.password_hash });

// Change your own password (any staff login).
router.post('/change-password', authenticateToken, (req, res) => {
  const { current_password, new_password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.userId);
  if (!user || !user.password_hash || !bcrypt.compareSync(String(current_password || ''), user.password_hash)) {
    return res.status(400).json({ error: 'Your current password is not right.' });
  }
  if (String(new_password || '').length < MIN_PASSWORD) {
    return res.status(400).json({ error: `Use at least ${MIN_PASSWORD} characters for the new password.` });
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(String(new_password), 10), user.id);
  logActivity(req, { action: 'user.password_changed', entity: 'user', entityId: user.id, summary: `${user.name} changed their password` });
  res.json({ success: true });
});

// The admin manages who can log in.
router.get('/users', authenticateToken, requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM users ORDER BY role, name').all().map(publicUser));
});

router.post('/users', authenticateToken, requireAdmin, (req, res) => {
  const { name, email, role, password } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!String(name || '').trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return res.status(400).json({ error: 'A name and a valid email are required.' });
  }
  if (String(password || '').length < MIN_PASSWORD) {
    return res.status(400).json({ error: `Use at least ${MIN_PASSWORD} characters for their password.` });
  }
  if (db.prepare('SELECT 1 FROM users WHERE LOWER(email) = ?').get(cleanEmail)) {
    return res.status(409).json({ error: 'Someone already logs in with that email.' });
  }
  const id = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run(String(name).trim(), cleanEmail, bcrypt.hashSync(String(password), 10), role === 'admin' ? 'admin' : 'staff').lastInsertRowid;
  logActivity(req, { action: 'user.created', entity: 'user', entityId: id, summary: `Added ${role === 'admin' ? 'admin' : 'staff'} login for ${String(name).trim()} (${cleanEmail})` });
  res.status(201).json(publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)));
});

router.patch('/users/:id/password', authenticateToken, requireAdmin, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (String(req.body?.password || '').length < MIN_PASSWORD) {
    return res.status(400).json({ error: `Use at least ${MIN_PASSWORD} characters.` });
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(String(req.body.password), 10), user.id);
  logActivity(req, { action: 'user.password_reset', entity: 'user', entityId: user.id, summary: `Reset the password for ${user.name}` });
  res.json({ success: true });
});

router.delete('/users/:id', authenticateToken, requireAdmin, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.id === req.user.userId) return res.status(400).json({ error: 'You cannot remove your own login.' });
  if (user.role === 'admin' && db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get().n <= 1) {
    return res.status(400).json({ error: 'The last admin cannot be removed.' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  logActivity(req, { action: 'user.removed', entity: 'user', entityId: user.id, summary: `Removed the login for ${user.name} (${user.email})` });
  res.json({ success: true });
});

module.exports = router;
