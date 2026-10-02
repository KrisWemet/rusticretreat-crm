const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { JWT_SECRET, authenticateToken, requireAdmin } = require('../middleware/auth');
const { logActivity } = require('../services/activity');
const rateLimit = require('../middleware/rateLimit');
const crypto = require('crypto');
const email = require('../services/email');

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

  // Logins are saved lowercased (see POST /users), so the lookup must ignore
  // case too. An exact match turned "Shannon@…" into "Invalid credentials" for
  // a login that existed as "shannon@…".
  const user = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(String(email).trim().toLowerCase());

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

// ── Sign-up invites ──────────────────────────────────────────────────────────
// The admin invites someone by name and email; they open the private link and
// choose their own password. There is no open sign-up — the CRM is publicly
// reachable, so a sign-up page anyone could use would hand out logins.
const INVITE_DAYS = 7;
const inviteLimiter = rateLimit({ windowMs: 900000, max: 30, name: 'staff-invite' });
const hashToken = t => crypto.createHash('sha256').update(String(t)).digest('hex');
const inviteUrl = token => `${(process.env.BASE_URL || 'http://localhost:5173').replace(/\/+$/, '')}/signup/${token}`;
const emailTaken = e => db.prepare('SELECT 1 FROM users WHERE LOWER(email) = ?').get(e);

// An unused, unexpired invite for this token, or null.
function openInvite(token) {
  if (!/^[a-f0-9]{48}$/.test(String(token || ''))) return null;
  return db.prepare("SELECT * FROM user_invites WHERE token_hash = ? AND used_at IS NULL AND expires_at > datetime('now')")
    .get(hashToken(token)) || null;
}

router.get('/invites', authenticateToken, requireAdmin, (req, res) => {
  res.json(db.prepare(`SELECT id, name, email, role, user_id, created_at, expires_at FROM user_invites
                       WHERE used_at IS NULL AND expires_at > datetime('now') ORDER BY created_at DESC`).all());
});

router.post('/invites', authenticateToken, requireAdmin, async (req, res) => {
  const { name, email: rawEmail, role, send_email } = req.body || {};
  const cleanName = String(name || '').trim();
  const cleanEmail = String(rawEmail || '').trim().toLowerCase();
  if (!cleanName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return res.status(400).json({ error: 'A name and a valid email are required.' });
  }
  if (emailTaken(cleanEmail)) {
    return res.status(409).json({ error: 'Someone already logs in with that email.' });
  }
  const cleanRole = role === 'admin' ? 'admin' : 'staff';
  // A new invite replaces any earlier one for the same email, so only the
  // latest link works.
  db.prepare('DELETE FROM user_invites WHERE LOWER(email) = ? AND used_at IS NULL').run(cleanEmail);
  const token = crypto.randomBytes(24).toString('hex');
  const id = db.prepare(`INSERT INTO user_invites (token_hash, name, email, role, created_by, expires_at)
                         VALUES (?, ?, ?, ?, ?, datetime('now', ?))`)
    .run(hashToken(token), cleanName, cleanEmail, cleanRole, req.user.userId, `+${INVITE_DAYS} days`).lastInsertRowid;
  const url = inviteUrl(token);
  logActivity(req, { action: 'user.invited', entity: 'user_invite', entityId: id, summary: `Invited ${cleanName} (${cleanEmail}) to sign up as ${cleanRole}` });

  let emailed = null;
  if (send_email) {
    emailed = await email.sendStaffInvite({ to: cleanEmail, name: cleanName, invitedBy: req.user.name || 'The Rustic Retreat admin', url, expiresDays: INVITE_DAYS });
  }
  res.status(201).json({ id, name: cleanName, email: cleanEmail, role: cleanRole, url, expires_days: INVITE_DAYS, emailed });
});

// A link for an existing login to choose a new password, so the admin never
// has to pick or pass on someone else's password.
router.post('/users/:id/password-link', authenticateToken, requireAdmin, async (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  db.prepare('DELETE FROM user_invites WHERE user_id = ? AND used_at IS NULL').run(user.id);
  const token = crypto.randomBytes(24).toString('hex');
  const id = db.prepare(`INSERT INTO user_invites (token_hash, name, email, role, user_id, created_by, expires_at)
                         VALUES (?, ?, ?, ?, ?, ?, datetime('now', ?))`)
    .run(hashToken(token), user.name, user.email, user.role, user.id, req.user.userId, `+${INVITE_DAYS} days`).lastInsertRowid;
  const url = inviteUrl(token);
  logActivity(req, { action: 'user.password_link', entity: 'user', entityId: user.id, summary: `Created a choose-a-new-password link for ${user.name}` });
  let emailed = null;
  if (req.body?.send_email) {
    emailed = await email.sendStaffInvite({ to: user.email, name: user.name, invitedBy: req.user.name || 'The Rustic Retreat admin', url, expiresDays: INVITE_DAYS, reset: true });
  }
  res.status(201).json({ id, name: user.name, email: user.email, role: user.role, user_id: user.id, url, expires_days: INVITE_DAYS, emailed });
});

router.delete('/invites/:id', authenticateToken, requireAdmin, (req, res) => {
  const r = db.prepare('DELETE FROM user_invites WHERE id = ? AND used_at IS NULL').run(req.params.id);
  if (!r.changes) return res.status(404).json({ error: 'Invite not found' });
  logActivity(req, { action: 'user.invite_cancelled', entity: 'user_invite', entityId: req.params.id, summary: 'Cancelled a sign-up invite' });
  res.json({ success: true });
});

// Public: the sign-up page reads who the invite is for.
router.get('/invite/:token', inviteLimiter, (req, res) => {
  const inv = openInvite(req.params.token);
  if (!inv) return res.status(404).json({ error: 'This sign-up link has expired or has already been used. Ask the admin for a new one.' });
  res.json({ name: inv.name, email: inv.email, role: inv.role, reset: !!inv.user_id, expires_at: inv.expires_at });
});

// Public: choose a password, which creates the login and signs them in.
router.post('/invite/:token', inviteLimiter, (req, res) => {
  const inv = openInvite(req.params.token);
  if (!inv) return res.status(404).json({ error: 'This sign-up link has expired or has already been used. Ask the admin for a new one.' });
  const { name, password } = req.body || {};
  if (String(password || '').length < MIN_PASSWORD) {
    return res.status(400).json({ error: `Use at least ${MIN_PASSWORD} characters for your password.` });
  }
  if (inv.user_id && !db.prepare('SELECT 1 FROM users WHERE id = ?').get(inv.user_id)) {
    return res.status(404).json({ error: 'This login has been removed. Ask the admin for help.' });
  }
  if (!inv.user_id && emailTaken(inv.email.toLowerCase())) {
    return res.status(409).json({ error: 'There is already a login for this email. Try signing in instead.' });
  }
  const cleanName = String(name || '').trim() || inv.name;
  const hash = bcrypt.hashSync(String(password), 10);
  const apply = db.transaction(() => {
    // Marking it used inside the transaction means a double-click cannot
    // create two logins from one link.
    const used = db.prepare("UPDATE user_invites SET used_at = datetime('now') WHERE id = ? AND used_at IS NULL").run(inv.id);
    if (!used.changes) return null;
    if (inv.user_id) {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, inv.user_id);
      return inv.user_id;
    }
    return db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
      .run(cleanName, inv.email.toLowerCase(), hash, inv.role).lastInsertRowid;
  });
  const id = apply();
  if (!id) return res.status(404).json({ error: 'This sign-up link has already been used.' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  logActivity({ user: { userId: user.id, name: user.name } }, inv.user_id
    ? { action: 'user.password_changed', entity: 'user', entityId: user.id, summary: `${user.name} chose a new password from a link` }
    : { action: 'user.signed_up', entity: 'user', entityId: user.id, summary: `${user.name} (${user.email}) set up their login from an invite` });
  const token = jwt.sign({ userId: user.id, email: user.email, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

module.exports = router;
