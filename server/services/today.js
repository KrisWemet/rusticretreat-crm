// What the venue needs to know today and this week — one list shared by the
// dashboard panel and the 7 am summary email, so the two never disagree.
const db = require('../db');
const { needsFollowUp } = require('./leadNurture');
const { defaultEndDate } = require('./bookingRules');

function addDays(day, n) {
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const names = r => [r.partner1_name, r.partner2_name].filter(Boolean).join(' & ');

function todaySummary(today) {
  const weekEnd = addDays(today, 6);
  const live = "c.archived_at IS NULL AND c.status != 'cancelled'";

  // Tour times are entered as Alberta local time ("2026-10-03T10:00").
  const tours = db.prepare(`
    SELECT t.id, t.couple_id, t.name, t.scheduled_at, t.email, t.phone
    FROM tours t LEFT JOIN couples c ON c.id = t.couple_id
    WHERE t.status = 'scheduled' AND substr(t.scheduled_at, 1, 10) BETWEEN ? AND ?
      AND (c.id IS NULL OR c.archived_at IS NULL)
    ORDER BY t.scheduled_at
  `).all(today, weekEnd);
  const tourRequests = db.prepare(`
    SELECT COUNT(*) AS n FROM tours t LEFT JOIN couples c ON c.id = t.couple_id
    WHERE t.status = 'requested' AND (c.id IS NULL OR c.archived_at IS NULL)
  `).get().n;

  const tasks = db.prepare(`
    SELECT t.id, t.title, t.due_date, t.priority, t.couple_id, c.partner1_name, c.partner2_name
    FROM tasks t LEFT JOIN couples c ON c.id = t.couple_id
    WHERE t.completed = 0 AND t.due_date IS NOT NULL AND t.due_date <= ?
      AND (c.id IS NULL OR c.archived_at IS NULL)
    ORDER BY t.due_date, CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END
  `).all(today);

  const payments = db.prepare(`
    SELECT i.*, c.partner1_name, c.partner2_name
    FROM invoices i JOIN couples c ON c.id = i.couple_id
    WHERE i.paid = 0 AND i.due_date IS NOT NULL AND i.due_date <= ? AND ${live}
    ORDER BY i.due_date
  `).all(addDays(today, 7)).map(require('./ledger').invoiceView).map(i => ({ ...i, amount: i.balance }));

  const contracts = db.prepare(`
    SELECT ct.id, ct.title, ct.couple_id, ct.sent_at, ct.signing_expires_at, c.partner1_name, c.partner2_name,
      (SELECT s.name FROM contract_signers s WHERE s.contract_id = ct.id AND s.status != 'signed' ORDER BY s.sign_order LIMIT 1) AS waiting_on
    FROM contracts ct JOIN couples c ON c.id = ct.couple_id
    WHERE ct.status = 'sent' AND ${live}
    ORDER BY ct.sent_at
  `).all();

  const forms = db.prepare(`
    SELECT fa.id, fa.couple_id, fa.link_sent_at, f.title, c.partner1_name, c.partner2_name
    FROM form_assignments fa JOIN forms f ON f.id = fa.form_id JOIN couples c ON c.id = fa.couple_id
    WHERE fa.status = 'pending' AND fa.link_sent_at IS NOT NULL AND ${live}
    ORDER BY fa.link_sent_at
  `).all();

  const weddings = db.prepare(`
    SELECT b.id, b.couple_id, b.event_date, b.end_date, b.package_name, b.guest_count, c.partner1_name, c.partner2_name
    FROM bookings b JOIN couples c ON c.id = b.couple_id
    WHERE b.event_date IS NOT NULL AND b.event_date <= ? AND ${live}
    ORDER BY b.event_date
  `).all(weekEnd).map(b => ({ ...b, end_date: b.end_date || defaultEndDate(b.event_date, b.package_name) || b.event_date }))
    .filter(b => b.end_date >= today);

  return {
    today, week_end: weekEnd,
    failed_emails:db.prepare("SELECT j.id,j.couple_id,j.kind,j.status,j.error,c.partner1_name,c.partner2_name FROM email_jobs j LEFT JOIN couples c ON c.id=j.couple_id WHERE j.status IN ('failed','unknown','sending') AND (c.id IS NULL OR (c.archived_at IS NULL AND c.status!='cancelled')) ORDER BY j.id DESC").all().map(e=>({...e,couple_names:names(e)})),
    next_actions: db.prepare(`SELECT id AS couple_id, partner1_name, partner2_name, next_action, next_action_due, next_action_owner FROM couples WHERE next_action IS NOT NULL AND next_action_due <= ? AND archived_at IS NULL AND status != 'cancelled' ORDER BY next_action_due`).all(today).map(c => ({ ...c, couple_names: names(c) })),
    tours_today: tours.filter(t => t.scheduled_at.slice(0, 10) === today),
    tours_week: tours.filter(t => t.scheduled_at.slice(0, 10) !== today),
    tour_requests: tourRequests,
    tasks_due: tasks.map(t => ({ ...t, couple_names: t.couple_id ? names(t) : null, overdue: t.due_date < today })),
    payments_due: payments.map(p => ({ ...p, couple_names: names(p), overdue: p.due_date < today })),
    follow_ups: needsFollowUp().map(c => ({ ...c, couple_names: names(c) })),
    contracts_waiting: contracts.map(c => ({ ...c, couple_names: names(c) })),
    forms_waiting: forms.map(f => ({ ...f, couple_names: names(f) })),
    weddings_week: weddings.map(w => ({ ...w, couple_names: names(w), on_site: w.event_date <= today })),
  };
}

// How many things are in the summary (weddings and tours count as news too).
function itemCount(s) {
  return (s.next_actions?.length || 0) + s.tours_today.length + s.tours_week.length + s.tasks_due.length + s.payments_due.length +
    s.follow_ups.length + s.contracts_waiting.length + s.forms_waiting.length + s.weddings_week.length;
}

module.exports = { todaySummary, itemCount, addDays };
