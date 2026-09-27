const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const ledger = require('../services/ledger');
const { logActivity } = require('../services/activity');
const { assertCeremonyDate, assertBookable, sendRuleError } = require('../services/bookingRules');

// Get all bookings
router.get('/', authenticateToken, (req, res) => {
  const bookings = db.prepare(`
    SELECT b.*, c.partner1_name, c.partner2_name, c.email as couple_email, c.phone as couple_phone,
           c.wedding_date, c.status AS couple_status, c.archived_at AS couple_archived_at,
           (SELECT COALESCE(SUM(amount), 0) FROM invoices i WHERE i.couple_id = b.couple_id) AS invoiced_total,
           (SELECT COALESCE(SUM(amount), 0) FROM invoices i WHERE i.couple_id = b.couple_id AND i.paid = 1) AS paid_total,
           (SELECT COUNT(*) FROM invoices i WHERE i.couple_id = b.couple_id AND i.paid = 0 AND i.due_date < ?) AS overdue_count
    FROM bookings b
    JOIN couples c ON b.couple_id = c.id
    ORDER BY b.event_date ASC
  `).all(require('../services/schedule').albertaToday());
  res.json(bookings.map(ledger.bookingView));
});

// Get booking by id
router.get('/:id', authenticateToken, (req, res) => {
  const booking = db.prepare(`
    SELECT b.*, c.partner1_name, c.partner2_name, c.email as couple_email, c.wedding_date
    FROM bookings b
    JOIN couples c ON b.couple_id = c.id
    WHERE b.id = ?
  `).get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  res.json(ledger.bookingView(booking));
});

// Get bookings for a couple
router.get('/couple/:coupleId', authenticateToken, (req, res) => {
  const bookings = db.prepare('SELECT * FROM bookings WHERE couple_id = ? ORDER BY event_date ASC').all(req.params.coupleId);
  res.json(bookings.map(ledger.bookingView));
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
      assertBookable(db, { couple_id, event_date, end_date, package_name, guest_count });
      assertCeremonyDate(req.body.wedding_date, { event_date, end_date, package_name });
      const couple = db.prepare('SELECT * FROM couples WHERE id = ?').get(couple_id);
      if (!couple || couple.archived_at || couple.status === 'cancelled') throw Object.assign(new Error('Choose an active couple'), { status: 400 });
      if (db.prepare('SELECT 1 FROM bookings WHERE couple_id = ?').get(couple_id)) throw Object.assign(new Error('This couple already has a reservation. Edit the existing stay.'), { status: 409 });
      const inserted = db.prepare(`
        INSERT INTO bookings (couple_id, event_date, end_date, start_time, end_time, package_name, guest_count,
          ceremony_location, reception_location, catering_type, special_requests,
          payment_status, deposit_paid, total_price, add_ons)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(couple_id, event_date, end_date || null, start_time || null, end_time || null, package_name || null,
        guest_count || null, ceremony_location || null, reception_location || null,
        catering_type || null, special_requests || null, payment_status || 'pending',
        deposit_paid || 0, total_price || 0, add_ons || null);
      db.prepare("UPDATE couples SET status = 'booked', pipeline_stage = 'booked', wedding_date = COALESCE(?, wedding_date, ?), venue_package = ? WHERE id = ?").run(req.body.wedding_date || null, event_date, package_name || null, couple_id);
      db.prepare("UPDATE date_holds SET released_at=datetime('now') WHERE couple_id=? AND released_at IS NULL").run(couple_id);
      require('../services/operations').ensureTasks(couple_id, req.body.wedding_date || couple.wedding_date || event_date);
      return inserted;
    })();
  } catch (err) {
    if (sendRuleError(res, err)) return;
    if (err.status) return res.status(err.status).json({error:err.message});
    throw err;
  }

  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(ledger.bookingView(booking));
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
    couple_id: booking.couple_id,
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
      const ceremonyDate=req.body.wedding_date || db.prepare('SELECT wedding_date FROM couples WHERE id=?').get(booking.couple_id)?.wedding_date;
      if(datesChanged || req.body.wedding_date)assertCeremonyDate(ceremonyDate,next);
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
      if (datesChanged || packageChanged || req.body.wedding_date) db.prepare('UPDATE couples SET wedding_date = COALESCE(?, wedding_date), venue_package = ? WHERE id = ?').run(req.body.wedding_date || null, next.package_name, booking.couple_id);
      if (datesChanged || req.body.wedding_date) require('../services/operations').ensureTasks(booking.couple_id, req.body.wedding_date || db.prepare('SELECT wedding_date FROM couples WHERE id = ?').get(booking.couple_id).wedding_date || next.event_date, { reschedule: true });
      logActivity(req, { action: 'booking.updated', entity: 'booking', entityId: booking.id, coupleId: booking.couple_id, summary: datesChanged ? 'Rescheduled stay; signed agreements retained' : 'Updated booking details', detail: { before: booking, after: next } });
    })();
  } catch (err) {
    if (sendRuleError(res, err)) return;
    throw err;
  }

  const updated = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  res.json(ledger.bookingView(updated));
});

// Delete booking
router.delete('/:id', authenticateToken, (req, res) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  if (db.prepare("SELECT 1 FROM contracts WHERE couple_id = ? AND (status = 'signed' OR locked_at IS NOT NULL)").get(booking.couple_id) || db.prepare('SELECT 1 FROM payment_entries pe JOIN invoices i ON i.id = pe.invoice_id WHERE i.couple_id = ?').get(booking.couple_id)) return res.status(409).json({ error: 'This booking has an agreement or payment history. Cancel the reservation from the couple record instead.' });
  db.transaction(() => {
    db.prepare('DELETE FROM bookings WHERE id = ?').run(req.params.id);
    db.prepare("UPDATE couples SET status='inquiry', pipeline_stage='proposal' WHERE id=? AND status='booked'").run(booking.couple_id);
  })();
  logActivity(req, { action: 'booking.deleted', entity: 'booking', entityId: booking.id, coupleId: booking.couple_id,
    summary: `Deleted booking for ${booking.event_date || 'no date'}${booking.package_name ? ` (${booking.package_name})` : ''}`, detail: booking });
  res.json({ message: 'Booking deleted successfully' });
});

module.exports = router;
