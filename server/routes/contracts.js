const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { authenticateToken } = require('../middleware/auth');
const email = require('../services/email');
const rateLimit = require('../middleware/rateLimit');

// Public signing endpoints share one limiter: generous enough for normal
// reading/signing, tight enough to stop token brute-forcing.
const signLimiter = rateLimit({ windowMs: 60000, max: 20 });

// ── helpers ───────────────────────────────────────────────────────────────────

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function generatePassword(len = 10) {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ── Admin: list all contracts ────────────────────────────────────────────────
router.get('/', authenticateToken, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT c.*, co.partner1_name, co.partner2_name, co.email AS couple_email
      FROM contracts c
      JOIN couples co ON co.id = c.couple_id
      ORDER BY c.created_at DESC
    `).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: get single contract ───────────────────────────────────────────────
router.get('/:id', authenticateToken, (req, res) => {
  try {
    const row = db.prepare(`
      SELECT c.*, co.partner1_name, co.partner2_name, co.email AS couple_email
      FROM contracts c JOIN couples co ON co.id = c.couple_id
      WHERE c.id = ?
    `).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Contract not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: create contract ───────────────────────────────────────────────────
router.post('/', authenticateToken, (req, res) => {
  const {
    couple_id, title, content,
    wedding_date, start_time, end_time, guest_count,
    ceremony_location, reception_location, package_name, total_price,
  } = req.body;
  if (!couple_id || !title || !content) {
    return res.status(400).json({ error: 'couple_id, title and content are required' });
  }
  try {
    const result = db.prepare(`
      INSERT INTO contracts
        (couple_id, title, content, wedding_date, start_time, end_time,
         guest_count, ceremony_location, reception_location, package_name, total_price)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      couple_id, title, content,
      wedding_date || null, start_time || null, end_time || null,
      guest_count || null, ceremony_location || null, reception_location || null,
      package_name || null, total_price || null,
    );
    const contract = db.prepare(`
      SELECT c.*, co.partner1_name, co.partner2_name, co.email AS couple_email
      FROM contracts c JOIN couples co ON co.id = c.couple_id
      WHERE c.id = ?
    `).get(result.lastInsertRowid);
    res.status(201).json(contract);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: update contract (title / content, only if not signed) ─────────────
router.put('/:id', authenticateToken, (req, res) => {
  const { title, content } = req.body;
  try {
    const existing = db.prepare('SELECT * FROM contracts WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (existing.status === 'signed') {
      return res.status(400).json({ error: 'Cannot edit a signed contract' });
    }
    db.prepare('UPDATE contracts SET title = ?, content = ? WHERE id = ?')
      .run(title ?? existing.title, content ?? existing.content, req.params.id);
    res.json(db.prepare('SELECT * FROM contracts WHERE id = ?').get(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: delete contract ───────────────────────────────────────────────────
router.delete('/:id', authenticateToken, (req, res) => {
  try {
    db.prepare('DELETE FROM contracts WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: send contract (generate signing link) ─────────────────────────────
router.post('/:id/send', authenticateToken, (req, res) => {
  try {
    const contract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(req.params.id);
    if (!contract) return res.status(404).json({ error: 'Not found' });
    if (contract.status === 'signed') {
      return res.status(400).json({ error: 'Contract already signed' });
    }
    const token = generateToken();
    db.prepare(`
      UPDATE contracts SET signing_token = ?, status = 'sent', sent_at = datetime('now')
      WHERE id = ?
    `).run(token, req.params.id);

    // Email signing link to couple
    const couple = db.prepare('SELECT * FROM couples WHERE id = ?').get(contract.couple_id);
    email.sendContractLink({
      to: couple.email,
      coupleNames: `${couple.partner1_name} & ${couple.partner2_name}`,
      contractTitle: contract.title,
      signingUrl: `/sign/${token}`,
    });

    res.json({ token, signing_url: `/sign/${token}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Public: get contract for signing (no auth) ───────────────────────────────
router.get('/sign/:token', signLimiter, (req, res) => {
  try {
    const contract = db.prepare(`
      SELECT c.id, c.title, c.content, c.status, c.signer_name, c.signed_at,
             co.partner1_name, co.partner2_name, co.email AS couple_email
      FROM contracts c JOIN couples co ON co.id = c.couple_id
      WHERE c.signing_token = ?
    `).get(req.params.token);

    if (!contract) return res.status(404).json({ error: 'Invalid or expired signing link' });
    if (contract.status === 'signed') {
      return res.json({ ...contract, already_signed: true });
    }
    res.json(contract);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Public: submit signature ─────────────────────────────────────────────────
router.post('/sign/:token', signLimiter, (req, res) => {
  const { signer_name, signature_data } = req.body;
  if (!signer_name || !signature_data) {
    return res.status(400).json({ error: 'Signer name and signature are required' });
  }

  try {
    const contract = db.prepare(`
      SELECT c.*, co.partner1_name, co.partner2_name, co.email, co.password_hash
      FROM contracts c JOIN couples co ON co.id = c.couple_id
      WHERE c.signing_token = ?
    `).get(req.params.token);

    if (!contract) return res.status(404).json({ error: 'Invalid signing link' });
    if (contract.status === 'signed') {
      return res.status(400).json({ error: 'Contract already signed' });
    }

    const signer_ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';

    // Mark signed
    db.prepare(`
      UPDATE contracts
      SET status = 'signed', signed_at = datetime('now'),
          signer_name = ?, signer_email = ?, signature_data = ?, signer_ip = ?,
          portal_credentials_sent = 1
      WHERE signing_token = ?
    `).run(signer_name, contract.email, signature_data, signer_ip, req.params.token);

    // Update couple: status → booked, and sync event details from contract
    db.prepare(`
      UPDATE couples SET
        status = CASE WHEN status IN ('lead','inquiry') THEN 'booked' ELSE status END,
        wedding_date   = COALESCE(?, wedding_date),
        venue_package  = COALESCE(?, venue_package)
      WHERE id = ?
    `).run(contract.wedding_date || null, contract.package_name || null, contract.couple_id);

    // Upsert booking with event details from the signed contract
    if (contract.wedding_date) {
      const existing = db.prepare(
        'SELECT id FROM bookings WHERE couple_id = ? ORDER BY id LIMIT 1'
      ).get(contract.couple_id);

      if (existing) {
        db.prepare(`
          UPDATE bookings SET
            event_date          = COALESCE(?, event_date),
            start_time          = COALESCE(?, start_time),
            end_time            = COALESCE(?, end_time),
            guest_count         = COALESCE(?, guest_count),
            ceremony_location   = COALESCE(?, ceremony_location),
            reception_location  = COALESCE(?, reception_location),
            package_name        = COALESCE(?, package_name),
            total_price         = COALESCE(?, total_price)
          WHERE id = ?
        `).run(
          contract.wedding_date, contract.start_time, contract.end_time,
          contract.guest_count, contract.ceremony_location, contract.reception_location,
          contract.package_name, contract.total_price, existing.id,
        );
      } else {
        db.prepare(`
          INSERT INTO bookings
            (couple_id, event_date, start_time, end_time, guest_count,
             ceremony_location, reception_location, package_name, total_price)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          contract.couple_id, contract.wedding_date,
          contract.start_time || null, contract.end_time || null,
          contract.guest_count || null, contract.ceremony_location || null,
          contract.reception_location || null, contract.package_name || null,
          contract.total_price || null,
        );
      }
    }

    // Create / reveal portal credentials
    let plain_password = null;
    let is_new_account = false;

    if (!contract.password_hash) {
      // First-time: generate credentials
      plain_password = generatePassword();
      const hashed = bcrypt.hashSync(plain_password, 10);
      db.prepare('UPDATE couples SET password_hash = ? WHERE id = ?')
        .run(hashed, contract.couple_id);
      is_new_account = true;
    }

    const coupleNames = `${contract.partner1_name} & ${contract.partner2_name}`;
    const signedAt = new Date().toLocaleString();

    // Confirmation email to couple
    email.sendContractSignedCouple({
      to: contract.email,
      coupleNames,
      contractTitle: contract.title,
    });

    // Notification email to admin
    email.sendContractSignedAdmin({
      coupleNames,
      contractTitle: contract.title,
      signerName: signer_name,
      signedAt,
    });

    res.json({
      success: true,
      message: 'Contract signed successfully!',
      couple_name: coupleNames,
      portal_email: contract.email,
      portal_password: is_new_account ? plain_password : null,
      is_new_account,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
