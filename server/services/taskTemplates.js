// Checklists: staff to-do lists timed from a date on the couple's record.
// Applying one turns each item into a real task with a due date; applying it
// again adds only what is missing. These are reminders for the venue and
// never send anything to the couple.

const db = require('../db');
const { defaultEndDate } = require('./bookingRules');
const { addDays } = require('./planning');
const { albertaToday } = require('./schedule');

const ANCHORS = {
  checkin: 'check-in day',
  checkout: 'check-out day',
  booked: 'the day they booked',
  enquiry: 'the day they enquired',
};

// SQLite timestamps are UTC; the day that matters is Alberta's.
const albertaDayOf = (ts) => (ts ? albertaToday(new Date(String(ts).replace(' ', 'T') + (String(ts).includes('Z') ? '' : 'Z'))) : null);

function anchorDates(coupleId) {
  const couple = db.prepare('SELECT id, wedding_date, venue_package, created_at FROM couples WHERE id = ?').get(coupleId);
  if (!couple) return null;
  const booking = db.prepare('SELECT event_date, end_date, package_name, created_at FROM bookings WHERE couple_id = ? ORDER BY event_date DESC, id DESC').get(coupleId);
  const checkin = booking?.event_date || couple.wedding_date || null;
  const checkout = booking?.end_date || (checkin ? defaultEndDate(checkin, booking?.package_name || couple.venue_package) : null) || checkin;
  return { checkin, checkout, booked: booking ? albertaDayOf(booking.created_at) : null, enquiry: albertaDayOf(couple.created_at) };
}

function applyTemplate(templateId, coupleId) {
  const tpl = db.prepare('SELECT * FROM task_templates WHERE id = ?').get(templateId);
  if (!tpl) throw Object.assign(new Error('Checklist not found'), { status: 404 });
  const anchors = anchorDates(coupleId);
  if (!anchors) throw Object.assign(new Error('Couple not found'), { status: 404 });
  const items = db.prepare('SELECT * FROM task_template_items WHERE template_id = ? ORDER BY order_index, id').all(templateId);
  const exists = db.prepare('SELECT 1 FROM tasks WHERE couple_id = ? AND template_item_id = ?');
  const insert = db.prepare(`INSERT INTO tasks (title, description, assigned_to, couple_id, due_date, priority, template_item_id)
                             VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const created = [], skipped = [];
  db.transaction(() => {
    for (const it of items) {
      if (exists.get(coupleId, it.id)) { skipped.push({ title: it.title, reason: 'already on their tasks' }); continue; }
      const base = anchors[it.anchor];
      if (!base) {
        skipped.push({ title: it.title, reason: ['checkin', 'checkout'].includes(it.anchor) ? 'no wedding date yet' : 'not booked yet' });
        continue;
      }
      const due = addDays(base, it.offset_days);
      const r = insert.run(it.title, it.description || null, it.assigned_to || null, coupleId, due, it.priority, it.id);
      created.push({ id: r.lastInsertRowid, title: it.title, due_date: due });
    }
  })();
  return { template: tpl.name, created, skipped };
}

// Called where couples enquire or book. Never throws: a checklist is a
// convenience and must not undo the enquiry or booking that triggered it.
function autoApply(coupleId, trigger) {
  try {
    return db.prepare('SELECT id FROM task_templates WHERE auto_apply = ?').all(trigger)
      .map(t => applyTemplate(t.id, coupleId));
  } catch (err) {
    console.error(`[checklists] could not apply ${trigger} checklists to couple ${coupleId}: ${err.message}`);
    return [];
  }
}

module.exports = { ANCHORS, anchorDates, applyTemplate, autoApply };
