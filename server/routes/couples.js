const express = require('express');
const router = express.Router();
const db = require('../db');
const publicCouple = c => ({ ...c, email: c.email?.startsWith('phone:') ? '' : c.email, password_hash: undefined });
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const ledger = require('../services/ledger');
const { logActivity, recentActivity } = require('../services/activity');

// The sales-board column for a status (see PATCH /:id/stage for the reverse).
function stageForStatus(status, currentStage) {
  if (status === 'booked' || status === 'completed') return 'booked';
  if (status === 'cancelled') return 'lost';
  if (status === 'inquiry') return ['tour', 'proposal'].includes(currentStage) ? currentStage : 'tour';
  if (status === 'lead') return 'inquiry';
  return currentStage || 'inquiry';
}

// Get all couples
router.get('/', authenticateToken, (req, res) => {
  const { status, search, archived } = req.query;
  let query = 'SELECT * FROM couples';
  const params = [];
  // Archived couples are hidden unless asked for (?archived=1 lists only them).
  const conditions = [archived === '1' ? 'archived_at IS NOT NULL' : 'archived_at IS NULL'];

  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }

  if (search) {
    conditions.push('(partner1_name LIKE ? OR partner2_name LIKE ? OR email LIKE ? OR partner2_email LIKE ? OR phone LIKE ? OR partner2_phone LIKE ? OR wedding_date LIKE ? OR EXISTS (SELECT 1 FROM bookings b WHERE b.couple_id = couples.id AND (b.event_date LIKE ? OR b.end_date LIKE ?)))');
    params.push(...Array(9).fill(`%${search}%`));
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY created_at DESC';

  const couples = db.prepare(query).all(...params);
  res.json(couples.map(publicCouple));
});

// Enquiries nobody has followed up yet (see services/leadNurture.js)
router.get('/follow-ups', authenticateToken, (req, res) => {
  res.json(require('../services/leadNurture').needsFollowUp());
});

// Get single couple
router.get('/:id', authenticateToken, (req, res) => {
  const couple = db.prepare('SELECT * FROM couples WHERE id = ?').get(req.params.id);
  if (!couple) return res.status(404).json({ error: 'Couple not found' });
  res.json(publicCouple(couple));
});

// Create couple
router.post('/', authenticateToken, (req, res) => {
  const {
    partner1_name, partner2_name, email, partner2_email, phone, wedding_date,
    venue_package, status, notes, budget_total, referral_source
  } = req.body;

  if (!String(partner1_name || '').trim() || (!email && !phone)) return res.status(400).json({ error: 'Enter a name and an email address or phone number' });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return res.status(400).json({ error: 'Enter a valid email address' });
  if (partner2_email && partner2_email.trim().toLowerCase() === String(email || '').trim().toLowerCase()) return res.status(400).json({ error: 'Each signer needs a different email address' });
  if (['booked', 'completed'].includes(status)) return res.status(400).json({ error: 'Save the enquiry first, then create its reservation' });
  const contactEmail = email ? email.trim().toLowerCase() : `phone:${require('crypto').randomBytes(12).toString('hex')}`;

  try {
    const result = db.prepare(`
      INSERT INTO couples (partner1_name, partner2_name, email, partner2_email, phone, wedding_date, venue_package, status, notes, budget_total, referral_source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(partner1_name.trim(), partner2_name || '', contactEmail, partner2_email || null, phone || null, wedding_date || null,
      venue_package || null, status || 'lead', notes || null, budget_total || 0, referral_source || null);

    const couple = db.prepare('SELECT * FROM couples WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(publicCouple(couple));
  } catch (err) {
    if (err.message.includes('UNIQUE constraint')) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    throw err;
  }
});

// Update couple
router.put('/:id', authenticateToken, (req, res) => {
  const couple = db.prepare('SELECT * FROM couples WHERE id = ?').get(req.params.id);
  if (!couple) return res.status(404).json({ error: 'Couple not found' });

  const {
    partner1_name, partner2_name, email, partner2_email, phone, wedding_date,
    venue_package, status, notes, budget_total, referral_source
  } = req.body;

  if (couple.status === 'cancelled' && status && status !== 'cancelled') return res.status(409).json({ error: 'Rebook through a new checked reservation before reopening a cancelled event' });
  const nextEmail = (email || couple.email).trim().toLowerCase();
  if (['booked', 'completed'].includes(status) && !db.prepare('SELECT 1 FROM bookings WHERE couple_id = ?').get(couple.id)) return res.status(409).json({ error: 'Create a reservation before marking this couple booked' });
  if (status === 'cancelled' && couple.status === 'booked') return res.status(409).json({ error: 'Use Cancel reservation with a reason to release the dates' });
  if (status && ['lead','inquiry'].includes(status) && db.prepare('SELECT 1 FROM bookings WHERE couple_id = ?').get(couple.id)) return res.status(409).json({ error: 'This couple has a reservation; use the cancellation workflow to release dates' });
  const nextP2 = partner2_email !== undefined ? partner2_email : couple.partner2_email;
  if (nextP2 && nextP2.trim().toLowerCase() === nextEmail) {
    return res.status(400).json({
      error: 'Each partner needs a different email address so their signatures are separately attributable.',
    });
  }

  try {
    db.prepare(`
      UPDATE couples SET
        partner1_name = ?, partner2_name = ?, email = ?, partner2_email = ?, phone = ?,
        wedding_date = ?, venue_package = ?, status = ?, notes = ?, budget_total = ?,
        referral_source = ?
      WHERE id = ?
    `).run(
      partner1_name || couple.partner1_name,
      partner2_name || couple.partner2_name,
      email || couple.email,
      // undefined means "not in this request"; empty string means "clear it".
      partner2_email !== undefined ? (partner2_email || null) : couple.partner2_email,
      phone !== undefined ? phone : couple.phone,
      wedding_date !== undefined ? wedding_date : couple.wedding_date,
      venue_package !== undefined ? venue_package : couple.venue_package,
      status || couple.status,
      notes !== undefined ? notes : couple.notes,
      budget_total !== undefined ? budget_total : couple.budget_total,
      referral_source !== undefined ? (referral_source || null) : couple.referral_source,
      req.params.id
    );

    // Keep the sales-board column in step when the status is changed here, as
    // the board keeps the status in step when a card is moved.
    if (status && status !== couple.status) {
      const stage = stageForStatus(status, couple.pipeline_stage);
      if (stage !== couple.pipeline_stage) db.prepare('UPDATE couples SET pipeline_stage = ? WHERE id = ?').run(stage, req.params.id);
    }

    const updated = db.prepare('SELECT * FROM couples WHERE id = ?').get(req.params.id);
    res.json(publicCouple(updated));
  } catch (err) {
    if (err.message.includes('UNIQUE constraint')) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    throw err;
  }
});

// Update a couple's pipeline stage (used by the sales-board drag & drop)
const PIPELINE_STAGES = ['inquiry', 'tour', 'proposal', 'booked', 'lost'];

router.patch('/:id/stage', authenticateToken, (req, res) => {
  const { pipeline_stage, stage_order } = req.body;
  const couple = db.prepare('SELECT * FROM couples WHERE id = ?').get(req.params.id);
  if (!couple) return res.status(404).json({ error: 'Couple not found' });
  if(couple.status==='completed')return res.status(409).json({error:'Completed weddings cannot be moved on the sales pipeline'});
  if (pipeline_stage && !PIPELINE_STAGES.includes(pipeline_stage)) {
    return res.status(400).json({ error: 'Invalid pipeline stage' });
  }

  // Keep the coarse status in sync so the rest of the app stays consistent.
  const stageToStatus = { inquiry: 'lead', tour: 'inquiry', proposal: 'inquiry', booked: 'booked', lost: 'cancelled' };
  const newStage = pipeline_stage || couple.pipeline_stage;
  const reservation = db.prepare('SELECT 1 FROM bookings WHERE couple_id = ?').get(couple.id);
  if (newStage === 'booked' && !reservation) return res.status(409).json({ error: 'Create the booking first; a sales stage does not reserve dates' });
  if (couple.status === 'cancelled' && newStage !== 'lost') return res.status(409).json({ error: 'A cancelled reservation must be rebooked with availability checked' });
  if (reservation && couple.status !== 'cancelled' && !['booked'].includes(newStage)) return res.status(409).json({ error: 'This couple has a reservation. Use the cancellation workflow to release dates' });
  // Don't downgrade a completed couple back to booked.
  const newStatus = couple.status === 'completed' ? 'completed' : (stageToStatus[newStage] || couple.status);

  db.prepare('UPDATE couples SET pipeline_stage = ?, stage_order = ?, status = ? WHERE id = ?').run(
    newStage,
    stage_order != null ? stage_order : couple.stage_order,
    newStatus,
    req.params.id
  );
  res.json(publicCouple(db.prepare('SELECT * FROM couples WHERE id = ?').get(req.params.id)));
});

// A reservation is released deliberately, with a recorded reason; documents and money stay.
router.post('/:id/cancel', authenticateToken, (req, res) => {
  const couple = db.prepare('SELECT * FROM couples WHERE id = ?').get(req.params.id);
  if (!couple) return res.status(404).json({ error: 'Couple not found' });
  const reason = String(req.body.reason || '').trim();
  if (!reason) return res.status(400).json({ error: 'Explain why the reservation is being cancelled' });
  db.prepare("UPDATE couples SET status = 'cancelled', pipeline_stage = 'lost' WHERE id = ?").run(couple.id);
  logActivity(req, { action: 'reservation.cancelled', entity: 'couple', entityId: couple.id, coupleId: couple.id, summary: `Reservation cancelled: ${reason}`, detail: { reason } });
  res.json({ cancelled: true });
});
router.post('/:id/rebook', authenticateToken, (req,res) => {
  const couple = db.prepare('SELECT * FROM couples WHERE id = ?').get(req.params.id);
  if (!couple || couple.status !== 'cancelled') return res.status(409).json({ error: 'Choose a cancelled reservation' });
  const booking = db.prepare('SELECT * FROM bookings WHERE couple_id = ? ORDER BY id DESC LIMIT 1').get(couple.id);
  if (!booking) return res.status(409).json({ error: 'Create a new couple record and reservation for this enquiry' });
  const reason = String(req.body.reason || '').trim();
  if (!reason) return res.status(400).json({ error: 'Explain why this reservation is being reopened' });
  try {
    db.transaction(() => {
      require('../services/bookingRules').assertBookable(db, booking, { excludeBookingId: booking.id });
      db.prepare("UPDATE couples SET status = 'booked', pipeline_stage = 'booked', archived_at = NULL WHERE id = ?").run(couple.id);
      require('../services/operations').ensureTasks(couple.id, couple.wedding_date || booking.event_date, { reschedule: true });
      logActivity(req, { action: 'reservation.rebooked', entity: 'couple', entityId: couple.id, coupleId: couple.id, summary: `Reopened reservation after checking availability: ${reason}` });
    })();
    res.json(publicCouple(db.prepare('SELECT * FROM couples WHERE id = ?').get(couple.id)));
  } catch (err) { res.status(err.status || 400).json({error:err.message}); }
});
router.patch('/:id/next-action', authenticateToken, (req,res) => {
  const couple = db.prepare('SELECT * FROM couples WHERE id = ?').get(req.params.id);
  if (!couple) return res.status(404).json({ error: 'Couple not found' });
  const { title, due_date, owner } = req.body;
  if ((title && !due_date) || (due_date && (!/^\d{4}-\d{2}-\d{2}$/.test(due_date) || !Number.isFinite(Date.parse(due_date)) || new Date(due_date).toISOString().slice(0,10) !== due_date))) return res.status(400).json({ error: 'Enter a valid due date' });
  db.prepare('UPDATE couples SET next_action = ?, next_action_due = ?, next_action_owner = ?, nurture_7d_sent = 0 WHERE id = ?').run(String(title || '').trim() || null, due_date || null, owner || null, couple.id);
  logActivity(req, { action: 'couple.next-action', entity: 'couple', entityId: couple.id, coupleId: couple.id, summary: title ? `Next action: ${title}` : 'Cleared next action', detail: req.body });
  res.json(publicCouple(db.prepare('SELECT * FROM couples WHERE id = ?').get(couple.id)));
});

// Mark an enquiry as personally followed up (or undo it)
router.patch('/:id/contacted', authenticateToken, (req, res) => {
  const couple = db.prepare('SELECT id FROM couples WHERE id = ?').get(req.params.id);
  if (!couple) return res.status(404).json({ error: 'Couple not found' });
  const contacted = req.body?.contacted !== false;
  db.prepare(`UPDATE couples SET contacted_at = ${contacted ? "datetime('now')" : 'NULL'} WHERE id = ?`).run(req.params.id);
  res.json(publicCouple(db.prepare('SELECT * FROM couples WHERE id = ?').get(req.params.id)));
});

// Archive a couple: hidden from lists, but every record is kept and they can
// be restored. This is what "Delete" does for everyone.
router.delete('/:id', authenticateToken, (req, res) => {
  const couple = db.prepare('SELECT * FROM couples WHERE id = ?').get(req.params.id);
  if (!couple) return res.status(404).json({ error: 'Couple not found' });

  if (req.query.permanent === '1') return deletePermanently(req, res, couple);

  db.prepare("UPDATE couples SET archived_at = datetime('now') WHERE id = ?").run(couple.id);
  logActivity(req, { action: 'couple.archived', entity: 'couple', entityId: couple.id, coupleId: couple.id,
    summary: `Archived ${couple.partner1_name} & ${couple.partner2_name}` });
  res.json({ message: 'Couple archived', archived: true });
});

router.patch('/:id/restore', authenticateToken, (req, res) => {
  const couple = db.prepare('SELECT * FROM couples WHERE id = ?').get(req.params.id);
  if (!couple) return res.status(404).json({ error: 'Couple not found' });
  db.prepare('UPDATE couples SET archived_at = NULL WHERE id = ?').run(couple.id);
  logActivity(req, { action: 'couple.restored', entity: 'couple', entityId: couple.id, coupleId: couple.id,
    summary: `Restored ${couple.partner1_name} & ${couple.partner2_name}` });
  res.json(publicCouple(db.prepare('SELECT * FROM couples WHERE id = ?').get(couple.id)));
});

// Permanent delete removes the couple and everything they own. Admin only,
// only once archived, and never while they have a signed contract or a paid
// invoice: those are records the business has to keep.
function deletePermanently(req, res, couple) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Only an admin can delete a couple permanently' });
  if (!couple.archived_at) return res.status(409).json({ error: 'Archive the couple first' });
  const signed = db.prepare("SELECT COUNT(*) AS n FROM contracts WHERE couple_id = ? AND (status = 'signed' OR locked_at IS NOT NULL)").get(couple.id).n;
  const paid = db.prepare('SELECT COUNT(*) AS n FROM invoices WHERE couple_id = ? AND paid = 1').get(couple.id).n;
  const history = db.prepare('SELECT 1 FROM payment_entries pe JOIN invoices i ON i.id = pe.invoice_id WHERE i.couple_id = ?').get(couple.id);
  const operationalHistory=db.prepare('SELECT 1 FROM damage_deposit_entries WHERE couple_id=? UNION SELECT 1 FROM event_inspections WHERE couple_id=? LIMIT 1').get(couple.id,couple.id);
  if (signed || paid || history || operationalHistory) {
    return res.status(409).json({
      error: `This couple has ${[signed && `${signed} signed or locked contract${signed > 1 ? 's' : ''}`, (paid || history) && 'payment history', operationalHistory && 'deposit or inspection history'].filter(Boolean).join(' and ')}, so they stay archived rather than deleted.`,
    });
  }
  const { password_hash, ...snapshot } = couple;
  db.prepare('DELETE FROM couples WHERE id = ?').run(couple.id);
  logActivity(req, { action: 'couple.deleted', entity: 'couple', entityId: couple.id, coupleId: couple.id,
    summary: `Permanently deleted ${couple.partner1_name} & ${couple.partner2_name}`, detail: snapshot });
  res.json({ message: 'Couple deleted permanently' });
}

// Everything about one couple in one request, for their client page: bookings,
// payments and balance, contracts with signing progress, tasks, tours, the
// emails the CRM sent them and what staff have done on their record.
router.get('/:id/overview', authenticateToken, (req, res) => {
  const id = Number(req.params.id);
  const couple = db.prepare('SELECT id FROM couples WHERE id = ?').get(id);
  if (!couple) return res.status(404).json({ error: 'Couple not found' });
  const today = require('../services/schedule').albertaToday();

  const invoices = db.prepare('SELECT * FROM invoices WHERE couple_id = ? ORDER BY due_date IS NULL, due_date, id').all(id).map(ledger.invoiceView);
  const total = invoices.reduce((t, i) => t + Number(i.amount || 0), 0);
  const paid = invoices.reduce((t, i) => t + Number(i.amount_paid || 0), 0);

  const contracts = db.prepare(`
    SELECT id, title, status, source, sent_at, signed_at, signing_expires_at, wedding_date, package_name, total_price, created_at
    FROM contracts WHERE couple_id = ? ORDER BY created_at DESC`).all(id)
    .map(c => ({ ...c, signers: db.prepare('SELECT role, name, status, signed_at FROM contract_signers WHERE contract_id = ? ORDER BY sign_order').all(c.id) }));

  res.json({
    today,
    bookings: db.prepare('SELECT * FROM bookings WHERE couple_id = ? ORDER BY event_date').all(id).map(ledger.bookingView),
    invoices: invoices.map(i => ({ ...i, overdue: i.balance > 0 && i.due_date && i.due_date < today })),
    balance: ledger.statement(id),
    contracts,
    tasks: db.prepare('SELECT * FROM tasks WHERE couple_id = ? ORDER BY completed, due_date IS NULL, due_date, id').all(id),
    tours: db.prepare('SELECT * FROM tours WHERE couple_id = ? ORDER BY COALESCE(scheduled_at, preferred_date, created_at) DESC').all(id),
    emails: db.prepare('SELECT id, at, kind, to_addr, subject, delivered, error FROM email_log WHERE couple_id = ? ORDER BY at DESC, id DESC LIMIT 50').all(id),
    activity: recentActivity({ coupleId: id, limit: 50 }),
    messages: db.prepare('SELECT COUNT(*) AS n FROM messages WHERE couple_id = ?').get(id).n,
  });
});

// A printable handover assembled from existing records; no duplicate data entry.
router.get('/:id/event-sheet', authenticateToken, (req, res) => {
  const couple = db.prepare('SELECT * FROM couples WHERE id = ?').get(req.params.id);
  if (!couple) return res.status(404).json({ error: 'Couple not found' });
  const bookings = db.prepare('SELECT * FROM bookings WHERE couple_id = ? ORDER BY event_date').all(couple.id).map(ledger.bookingView);
  const tasks = db.prepare('SELECT * FROM tasks WHERE couple_id = ? ORDER BY due_date, id').all(couple.id);
  const forms = db.prepare(`SELECT f.title, ff.label, r.value FROM form_assignments a JOIN forms f ON f.id=a.form_id JOIN form_responses r ON r.assignment_id=a.id JOIN form_fields ff ON ff.id=r.field_id WHERE a.couple_id=? ORDER BY a.id,ff.order_index`).all(couple.id);
  const contracts = db.prepare('SELECT title,status,wedding_date FROM contracts WHERE couple_id=?').all(couple.id);
  const esc = require('../services/email').esc;
  const names = [couple.partner1_name, couple.partner2_name].filter(Boolean).join(' & ');
  const row = (k,v) => `<tr><th>${esc(k)}</th><td>${esc(String(v ?? '—'))}</td></tr>`;
  const ops=JSON.parse(db.prepare('SELECT details FROM event_operations WHERE couple_id=?').get(couple.id)?.details||'{}');
  const dep=require('./venueOperations').deposit(couple.id);
  const inspections=db.prepare('SELECT stage,notes,created_at FROM event_inspections WHERE couple_id=? ORDER BY id').all(couple.id);
  const operationSheet=`<h2>Preparation and closeout</h2><table>${Object.entries(ops).filter(([k])=>k!=='camping').map(([k,v])=>row(k.replaceAll('_',' '),v)).join('')}</table><h2>Nightly camping</h2><table>${(ops.camping||[]).map(n=>row(n.date,`${n.guests} guests · ${n.tents} tents · ${n.rvs} RVs`)).join('')}</table><h2>Damage deposit</h2><p>Held $${esc(dep.held)} · returned $${esc(dep.returned)} · retained $${esc(dep.retained)}</p><h2>Inspections</h2><table>${inspections.map(i=>row(`${i.stage} · ${i.created_at}`,i.notes)).join('')}</table>`;
  const st = ledger.statement(couple.id);
  res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><title>Event handover — ${esc(names)}</title><style>body{font:14px system-ui;color:#1e293b;max-width:850px;margin:30px auto;padding:20px}table{width:100%;border-collapse:collapse;margin-bottom:24px}th,td{text-align:left;border-bottom:1px solid #ddd;padding:8px;white-space:pre-wrap;overflow-wrap:anywhere}th{width:30%}h1{font-size:24px}h2{font-size:18px}@media print{button{display:none}}</style></head><body><button onclick="window.print()">Print</button><h1>${esc(names)} — Event handover</h1><p>Generated ${esc(require('../services/schedule').albertaToday())}; verify details before the event.</p><table>${row('Wedding / ceremony',couple.wedding_date)}${row('Phone',couple.phone)}${row('Email',couple.email?.startsWith('phone:') ? '' : couple.email)}${row('Next action',couple.next_action)}${row('Notes',couple.notes)}</table><h2>Stay and arrangements</h2>${bookings.map(b => `<table>${['event_date','end_date','package_name','guest_count','ceremony_location','reception_location','catering_type','special_requests','add_ons'].map(k=>row(k.replaceAll('_',' '),b[k])).join('')}</table>`).join('') || '<p>No reservation</p>'}<h2>Payment check</h2><table>${row('Received', '$'+st.paid.toFixed(2))}${row('Balance', '$'+st.balance.toFixed(2))}</table><h2>Agreements</h2><ul>${contracts.map(c=>`<li>${esc(c.title)} — ${esc(c.status)}</li>`).join('')}</ul><h2>Tasks</h2><ul>${tasks.map(t=>`<li>${t.completed ? 'Done' : 'Open'} — ${esc(t.title)} · ${esc(t.due_date || 'No due date')}</li>`).join('')}</ul><h2>Submitted planning answers</h2><p>Answers are shown as supplied; reviewed changes belong in the stay details above.</p><table>${forms.map(f=>row(f.title+' · '+f.label,f.value)).join('')}</table>${operationSheet}</body></html>`);
});

// What has happened on this couple's record, newest first
router.get('/:id/activity', authenticateToken, (req, res) => {
  res.json(recentActivity({ coupleId: Number(req.params.id) }));
});

// Get couple stats
router.get('/:id/stats', authenticateToken, (req, res) => {
  const couple = db.prepare('SELECT * FROM couples WHERE id = ?').get(req.params.id);
  if (!couple) return res.status(404).json({ error: 'Couple not found' });

  const guestStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN rsvp_status = 'accepted' THEN 1 ELSE 0 END) as accepted,
      SUM(CASE WHEN rsvp_status = 'declined' THEN 1 ELSE 0 END) as declined,
      SUM(CASE WHEN rsvp_status = 'pending' THEN 1 ELSE 0 END) as pending
    FROM guests WHERE couple_id = ?
  `).get(req.params.id);

  const budgetStats = db.prepare(`
    SELECT
      SUM(estimated_cost) as total_estimated,
      SUM(actual_cost) as total_actual
    FROM budget_items WHERE couple_id = ?
  `).get(req.params.id);

  const checklistStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) as completed
    FROM checklist_items WHERE couple_id = ?
  `).get(req.params.id);

  res.json({
    guests: guestStats,
    budget: budgetStats,
    checklist: checklistStats
  });
});

// Dashboard stats (admin)
router.get('/admin/dashboard', authenticateToken, (req, res) => {
  const totalCouples = db.prepare('SELECT COUNT(*) as count FROM couples').get();
  const upcomingEvents = db.prepare(`
    SELECT COUNT(*) as count FROM bookings
    WHERE event_date >= date('now') AND event_date <= date('now', '+90 days')
  `).get();
  const newLeads = db.prepare(`
    SELECT COUNT(*) as count FROM couples
    WHERE status IN ('lead', 'inquiry') AND created_at >= date('now', '-30 days')
  `).get();
  const tasksDue = db.prepare(`
    SELECT COUNT(*) as count FROM tasks
    WHERE completed = 0 AND due_date <= date('now', '+7 days')
  `).get();
  const recentCouples = db.prepare(`
    SELECT * FROM couples ORDER BY created_at DESC LIMIT 5
  `).all();
  const upcomingBookings = db.prepare(`
    SELECT b.*, c.partner1_name, c.partner2_name, c.email as couple_email
    FROM bookings b
    JOIN couples c ON b.couple_id = c.id
    WHERE b.event_date >= date('now')
    ORDER BY b.event_date ASC LIMIT 5
  `).all();

  res.json({
    stats: {
      totalCouples: totalCouples.count,
      upcomingEvents: upcomingEvents.count,
      newLeads: newLeads.count,
      tasksDue: tasksDue.count
    },
    recentCouples,
    upcomingBookings
  });
});

module.exports = router;
