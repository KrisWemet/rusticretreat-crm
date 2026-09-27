const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { logActivity } = require('../services/activity');
const { assertBookable, sendRuleError } = require('../services/bookingRules');

// Get all bookings
router.get('/', authenticateToken, (req, res) => {
  const bookings = db.prepare(`
    SELECT b.*, c.partner1_name, c.partner2_name, c.email as couple_email, c.phone as couple_phone
    FROM bookings b
    JOIN couples c ON b.couple_id = c.id
    ORDER BY b.event_date ASC
  `).all();
  res.json(bookings);
});

// Get booking by id
router.get('/:id', authenticateToken, (req, res) => {
  const booking = db.prepare(`
    SELECT b.*, c.partner1_name, c.partner2_name, c.email as couple_email
    FROM bookings b
    JOIN couples c ON b.couple_id = c.id
    WHERE b.id = ?
  `).get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  res.json(booking);
});

// Get bookings for a couple
router.get('/couple/:coupleId', authenticateToken, (req, res) => {
  const bookings = db.prepare('SELECT * FROM bookings WHERE couple_id = ? ORDER BY event_date ASC').all(req.params.coupleId);
  res.json(bookings);
});

// Create booking
router.post('/', authenticateToken, (req, res) => {
  const {
    couple_id, event_date, end_date, start_time, end_time, package_name,
    guest_count, ceremony_location, reception_location, catering_type,
    special_requests, payment_status, deposit_paid, total_price, add_ons
  } = req.body;

  if (!couple_id || !event_date) {
    return res.status(400).json({ error: 'Couple ID and event date are required' });
  }

  // Check and insert in one transaction so two saves cannot both pass the
  // availability check for the same dates.
  let result;
  try {
    result = db.transaction(() => {
      assertBookable(db, { event_date, end_date, package_name, guest_count });
      return db.prepare(`
        INSERT INTO bookings (couple_id, event_date, end_date, start_time, end_time, package_name, guest_count,
          ceremony_location, reception_location, catering_type, special_requests,
          payment_status, deposit_paid, total_price, add_ons)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(couple_id, event_date, end_date || null, start_time || null, end_time || null, package_name || null,
        guest_count || null, ceremony_location || null, reception_location || null,
        catering_type || null, special_requests || null, payment_status || 'pending',
        deposit_paid || 0, total_price || 0, add_ons || null);
    })();
  } catch (err) {
    if (sendRuleError(res, err)) return;
    throw err;
  }

  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(booking);
});

// Update booking
router.put('/:id', authenticateToken, (req, res) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  const {
    event_date, end_date, start_time, end_time, package_name, guest_count,
    ceremony_location, reception_location, catering_type, special_requests,
    payment_status, deposit_paid, total_price, add_ons
  } = req.body;

  // Only re-check what this edit changes, so a booking made before a rule
  // existed can still have its notes or payments updated.
  const next = {
    event_date: event_date || booking.event_date,
    end_date: end_date !== undefined ? end_date : booking.end_date,
    package_name: package_name !== undefined ? package_name : booking.package_name,
    guest_count: guest_count !== undefined ? guest_count : booking.guest_count,
  };
  const datesChanged = next.event_date !== booking.event_date || (next.end_date || null) !== (booking.end_date || null);
  const packageChanged = (next.package_name || null) !== (booking.package_name || null);
  const guestsChanged = String(next.guest_count ?? '') !== String(booking.guest_count ?? '');

  try {
    db.transaction(() => {
      if (datesChanged || packageChanged || guestsChanged) {
        assertBookable(db, next, {
          excludeBookingId: booking.id,
          checkPackage: datesChanged || packageChanged,
        });
      }
      db.prepare(`
        UPDATE bookings SET
          event_date = ?, end_date = ?, start_time = ?, end_time = ?, package_name = ?,
          guest_count = ?, ceremony_location = ?, reception_location = ?,
          catering_type = ?, special_requests = ?, payment_status = ?,
          deposit_paid = ?, total_price = ?, add_ons = ?
        WHERE id = ?
      `).run(
        event_date || booking.event_date,
        end_date !== undefined ? end_date : booking.end_date,
        start_time !== undefined ? start_time : booking.start_time,
        end_time !== undefined ? end_time : booking.end_time,
        package_name !== undefined ? package_name : booking.package_name,
        guest_count !== undefined ? guest_count : booking.guest_count,
        ceremony_location !== undefined ? ceremony_location : booking.ceremony_location,
        reception_location !== undefined ? reception_location : booking.reception_location,
        catering_type !== undefined ? catering_type : booking.catering_type,
        special_requests !== undefined ? special_requests : booking.special_requests,
        payment_status || booking.payment_status,
        deposit_paid !== undefined ? deposit_paid : booking.deposit_paid,
        total_price !== undefined ? total_price : booking.total_price,
        add_ons !== undefined ? add_ons : booking.add_ons,
        req.params.id
      );
    })();
  } catch (err) {
    if (sendRuleError(res, err)) return;
    throw err;
  }

  const updated = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// Delete booking
router.delete('/:id', authenticateToken, (req, res) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  db.prepare('DELETE FROM bookings WHERE id = ?').run(req.params.id);
  logActivity(req, { action: 'booking.deleted', entity: 'booking', entityId: booking.id, coupleId: booking.couple_id,
    summary: `Deleted booking for ${booking.event_date || 'no date'}${booking.package_name ? ` (${booking.package_name})` : ''}`, detail: booking });
  res.json({ message: 'Booking deleted successfully' });
});

module.exports = router;
