// Daily tidy-ups that keep statuses honest without anyone remembering to.
const db = require('../db');
const { defaultEndDate } = require('./bookingRules');
const { logActivity } = require('./activity');

// A booked couple whose stay has ended becomes "completed". Their records are
// untouched; it only moves them out of the upcoming lists.
function completePastWeddings(today) {
  const rows = db.prepare(`
    SELECT c.id, c.partner1_name, c.partner2_name, b.event_date, b.end_date, b.package_name
    FROM couples c JOIN bookings b ON b.couple_id = c.id
    WHERE c.status = 'booked' AND b.event_date IS NOT NULL
  `).all();
  const lastDay = new Map();
  for (const r of rows) {
    const end = r.end_date || defaultEndDate(r.event_date, r.package_name) || r.event_date;
    if (!lastDay.has(r.id) || end > lastDay.get(r.id).end) lastDay.set(r.id, { ...r, end });
  }
  let completed = 0;
  for (const c of lastDay.values()) {
    if (c.end >= today) continue;
    db.prepare("UPDATE couples SET status = 'completed' WHERE id = ? AND status = 'booked'").run(c.id);
    logActivity(null, { action: 'couple.completed', entity: 'couple', entityId: c.id, coupleId: c.id,
      summary: `Marked completed after their stay ended ${c.end}` });
    completed++;
  }
  return { completed };
}

// A sent proposal past its "valid until" date is expired (it was valid through
// that day). The public link already refuses it; this keeps lists accurate.
function expireProposals(today) {
  const r = db.prepare(`UPDATE proposals SET status = 'expired'
                        WHERE status = 'sent' AND valid_until IS NOT NULL AND valid_until < ?`).run(today);
  return { expired: r.changes };
}

module.exports = { completePastWeddings, expireProposals };
