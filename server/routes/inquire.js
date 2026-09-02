const express = require('express');
const router = express.Router();
const db = require('../db');
const email = require('../services/email');
const rateLimit = require('../middleware/rateLimit');

// The season and the unavailable-date rules now live in services/availability
// so the booking endpoints enforce exactly what this form advertises. Before,
// this file was the only place that knew a booking blocks its whole weekend,
// and nothing stopped a booking being written onto a date shown as taken.
const { SEASON_MONTHS, buildUnavailableDates } = require('../services/availability');

// ── Public: availability for the inquiry form ────────────────────────────────
router.get('/availability', rateLimit({ windowMs: 60000, max: 60 }), (req, res) => {
  res.json({
    seasonMonths: SEASON_MONTHS,
    unavailableDates: buildUnavailableDates(),
  });
});

// ── Public: submit an inquiry ────────────────────────────────────────────────
router.post('/', rateLimit({ windowMs: 3600000, max: 5 }), (req, res) => {
  const {
    partner1_name, partner2_name,
    email: coupleEmail, phone,
    wedding_date, guest_count,
    heard_about, message,
    request_tour, tour_date,
  } = req.body;

  if (!partner1_name || !partner2_name || !coupleEmail) {
    return res.status(400).json({ error: 'Names and email are required' });
  }

  // Check for existing couple with this email
  const existing = db.prepare('SELECT id FROM couples WHERE email = ?').get(coupleEmail);
  if (existing) {
    return res.status(409).json({ error: 'An inquiry with this email already exists. Contact us directly.' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO couples
        (partner1_name, partner2_name, email, phone, wedding_date, status, notes, budget_total, referral_source)
      VALUES (?, ?, ?, ?, ?, 'lead', ?, 0, ?)
    `).run(
      partner1_name.trim(),
      partner2_name.trim(),
      coupleEmail.trim().toLowerCase(),
      phone || null,
      wedding_date || null,
      message || null,
      heard_about || null,
    );

    const couple = db.prepare('SELECT * FROM couples WHERE id = ?').get(result.lastInsertRowid);
    const coupleNames = `${partner1_name} & ${partner2_name}`;

    // Add initial welcome message in the CRM
    db.prepare(`
      INSERT INTO messages (couple_id, sender_type, sender_name, content)
      VALUES (?, 'staff', 'Rustic Retreat', ?)
    `).run(couple.id, `Hi ${coupleNames}! Thank you for your inquiry. We'd love to help make your special day unforgettable at Rustic Retreat. We'll be in touch soon to discuss your vision and answer any questions!`);

    // Optional: site tour request
    if (request_tour) {
      db.prepare(`
        INSERT INTO tours (couple_id, name, email, phone, preferred_date, status, notes)
        VALUES (?, ?, ?, ?, ?, 'requested', ?)
      `).run(couple.id, coupleNames, coupleEmail.trim().toLowerCase(), phone || null,
        tour_date || null, 'Tour requested via website inquiry form.');

      email.sendTourRequestAdmin({
        coupleNames,
        email: coupleEmail,
        phone,
        preferredDate: tour_date,
      });
    }

    // Notify admin
    email.sendNewLeadAdmin({
      coupleNames,
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
