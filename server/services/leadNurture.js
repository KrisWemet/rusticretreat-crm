const db = require('../db');
const email = require('./email');

// Enquiries nobody has followed up yet.
//
// Couples are never nudged automatically (the owner's choice, Sep 2026): the
// venue is told instead, so every follow-up is personal. An enquiry counts as
// followed up once it has a scheduled or completed tour, a sent proposal, a
// booking, or staff have clicked "Mark contacted".
function needsFollowUp({ minDays = 0 } = {}) {
  return db.prepare(`
    SELECT c.id, c.partner1_name, c.partner2_name, c.email, c.phone, c.status, c.created_at,
           c.nurture_7d_sent,
           CAST(julianday('now') - julianday(c.created_at) AS INTEGER) AS days_old
    FROM couples c
    WHERE c.status IN ('lead', 'inquiry')
      AND c.contacted_at IS NULL
      AND c.archived_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM tours t WHERE t.couple_id = c.id AND t.status IN ('scheduled', 'completed'))
      AND NOT EXISTS (SELECT 1 FROM proposals p WHERE p.couple_id = c.id AND p.status IN ('sent', 'accepted'))
      AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.couple_id = c.id)
      AND julianday('now') - julianday(c.created_at) >= ?
    ORDER BY c.created_at ASC
  `).all(minDays);
}

// Once an enquiry is a week old with no follow-up, email the venue (once).
async function checkFollowUps() {
  const waiting = needsFollowUp();
  let alerted = 0;
  for (const lead of waiting) {
    if (lead.days_old < 7 || lead.nurture_7d_sent) continue;
    const r = await email.sendColdLeadAdmin({
      coupleNames: `${lead.partner1_name} & ${lead.partner2_name}`,
      email: lead.email,
      phone: lead.phone,
      daysOld: lead.days_old,
      coupleId: lead.id,
    });
    if (r && r.delivered) {
      db.prepare('UPDATE couples SET nurture_7d_sent = 1 WHERE id = ?').run(lead.id);
      alerted++;
    }
  }
  console.log(`[FollowUp] ${waiting.length} enquiries need a follow-up, sent ${alerted} staff alerts`);
  return { waiting: waiting.length, alerted };
}

module.exports = { needsFollowUp, checkFollowUps };
