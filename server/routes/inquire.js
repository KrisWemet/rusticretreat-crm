const express = require('express');
const router = express.Router();
const db = require('../db');
const email = require('../services/email');
const rateLimit = require('../middleware/rateLimit');

// ── Public: submit an inquiry ────────────────────────────────────────────────
router.post('/', rateLimit({ windowMs: 3600000, max: 5 }), (req, res) => {
  const {
    partner1_name, partner2_name,
    email: coupleEmail, phone,
    wedding_date, guest_count,
    heard_about, message,
  } = req.body;

  if (!partner1_name || !partner2_name || !coupleEmail) {
    return res.status(400).json({ error: 'Names and email are required' });
  }

  // Check for existing couple with this email
  const existing = db.prepare('SELECT id FROM couples WHERE email = ?').get(coupleEmail);
  if (existing) {
    return res.status(409).json({ error: 'An inquiry with this email already exists. Contact us directly.' });
  }

  const notesParts = [];
  if (heard_about) notesParts.push(`How they heard about us: ${heard_about}`);
  if (message) notesParts.push(message);

  try {
    const result = db.prepare(`
      INSERT INTO couples
        (partner1_name, partner2_name, email, phone, wedding_date, status, notes, budget_total)
      VALUES (?, ?, ?, ?, ?, 'lead', ?, 0)
    `).run(
      partner1_name.trim(),
      partner2_name.trim(),
      coupleEmail.trim().toLowerCase(),
      phone || null,
      wedding_date || null,
      notesParts.join('\n\n') || null,
    );

    const couple = db.prepare('SELECT * FROM couples WHERE id = ?').get(result.lastInsertRowid);

    // Add initial welcome message in the CRM
    db.prepare(`
      INSERT INTO messages (couple_id, sender_type, sender_name, content)
      VALUES (?, 'staff', 'Rustic Retreat', ?)
    `).run(couple.id, `Hi ${partner1_name} & ${partner2_name}! Thank you for your inquiry. We'd love to help make your special day unforgettable at Rustic Retreat. We'll be in touch soon to discuss your vision and answer any questions!`);

    // Notify admin
    email.sendNewLeadAdmin({
      coupleNames: `${partner1_name} & ${partner2_name}`,
      email: coupleEmail,
      phone,
      weddingDate: wedding_date,
      guestCount: guest_count,
      message,
    });

    res.status(201).json({ success: true, message: 'Thank you! We\'ll be in touch soon.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
