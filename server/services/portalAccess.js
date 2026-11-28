// Couple portal access (owner, Nov 2026: build out the portal).
//
// Couples get in through a one-time setup link: staff send it from the couple's
// page, and it is sent on its own when both partners have signed the agreement.
// The couple chooses their own password; one login per couple, used with either
// partner's email. Nothing here works unless ENABLE_COUPLE_PORTAL=1, so turning
// the portal on or off is one switch in Railway.

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../db');

const INVITE_DAYS = 14;
const enabled = () => process.env.ENABLE_COUPLE_PORTAL === '1';
const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const baseUrl = () => (process.env.BASE_URL || 'http://localhost:5173').replace(/\/+$/, '');
const setupUrl = (token) => `${baseUrl()}/portal/setup/${token}`;

// A new link replaces any unused one for the couple.
function createInvite(coupleId, createdBy = null, days = INVITE_DAYS) {
  const token = crypto.randomBytes(24).toString('hex');
  db.transaction(() => {
    db.prepare('DELETE FROM portal_invites WHERE couple_id = ? AND used_at IS NULL').run(coupleId);
    db.prepare(`INSERT INTO portal_invites (couple_id, token_hash, created_by, expires_at) VALUES (?, ?, ?, datetime('now', ?))`)
      .run(coupleId, hash(token), createdBy, `+${days} days`);
  })();
  return { token, url: setupUrl(token), days };
}

function inviteFor(token) {
  if (!/^[a-f0-9]{48}$/.test(String(token || ''))) return null;
  return db.prepare(`SELECT pi.*, c.partner1_name, c.partner2_name, c.email, c.partner2_email, c.status
    FROM portal_invites pi JOIN couples c ON c.id = pi.couple_id
    WHERE pi.token_hash = ? AND pi.used_at IS NULL AND pi.expires_at > datetime('now')`).get(hash(token)) || null;
}

// Use the link once: set the couple's password.
function completeInvite(token, password) {
  const inv = inviteFor(token);
  if (!inv) return { error: 'This link has expired or has already been used. Ask Rustic Retreat for a new one.', status: 404 };
  if (String(password || '').length < 10) return { error: 'Choose a password of at least 10 characters.', status: 400 };
  db.transaction(() => {
    db.prepare('UPDATE couples SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(String(password), 10), inv.couple_id);
    db.prepare("UPDATE portal_invites SET used_at = datetime('now') WHERE id = ?").run(inv.id);
  })();
  return { coupleId: inv.couple_id };
}

function accessFor(coupleId) {
  const c = db.prepare('SELECT id, password_hash, portal_last_login_at FROM couples WHERE id = ?').get(coupleId);
  if (!c) return null;
  const pending = db.prepare(`SELECT created_at, expires_at FROM portal_invites WHERE couple_id = ? AND used_at IS NULL AND expires_at > datetime('now')
    ORDER BY id DESC`).get(coupleId);
  return { enabled: enabled(), has_login: !!c.password_hash, last_login_at: c.portal_last_login_at || null, invite_pending: pending || null };
}

module.exports = { INVITE_DAYS, enabled, createInvite, inviteFor, completeInvite, accessFor, setupUrl };
