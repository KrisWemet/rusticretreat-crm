const express = require('express');
const router = express.Router();
const db = require('../db');
const email = require('../services/email');
const rateLimit = require('../middleware/rateLimit');

// Rustic Retreat hosts weddings June through September only.
const SEASON_MONTHS = [6, 7, 8, 9];

// Add a YYYY-MM-DD date string to a set, offset by N days.
function shiftDate(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Build the set of unavailable dates: every day inside a booking span, the
// full weekend (Fri–Sun) around each booked day (one wedding per weekend),
// plus any manually blocked dates.
function buildUnavailableDates() {
  const unavailable = new Set();

  const bookings = db.prepare('SELECT event_date, end_date FROM bookings WHERE event_date IS NOT NULL').all();
  for (const b of bookings) {
    const start = b.event_date;
    const end = b.end_date || b.event_date;
    let cursor = start;
    let guard = 0;
    while (cursor <= end && guard < 60) {
      unavailable.add(cursor);
      // Block the surrounding weekend (Fri/Sat/Sun) — one wedding per weekend.
      const dow = new Date(cursor + 'T00:00:00').getDay(); // 0 Sun … 6 Sat
      unavailable.add(shiftDate(cursor, 5 - dow));  // Friday
      unavailable.add(shiftDate(cursor, 6 - dow));  // Saturday
      unavailable.add(shiftDate(cursor, 7 - dow));  // Sunday
      cursor = shiftDate(cursor, 1);
      guard++;
    }
  }

  for (const row of db.prepare('SELECT date FROM blocked_dates').all()) {
    unavailable.add(row.date);
  }

  return [...unavailable].sort();
}

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
