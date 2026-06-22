const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const email = require('../services/email');

// Recompute subtotal/tax/total from a proposal's line items.
function recomputeTotals(proposalId) {
  const p = db.prepare('SELECT tax_rate FROM proposals WHERE id = ?').get(proposalId);
  const row = db.prepare('SELECT COALESCE(SUM(amount), 0) AS subtotal FROM proposal_items WHERE proposal_id = ?').get(proposalId);
  const subtotal = row.subtotal;
  const tax = Math.round(subtotal * (p.tax_rate / 100) * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;
  db.prepare('UPDATE proposals SET subtotal = ?, tax = ?, total = ? WHERE id = ?').run(subtotal, tax, total, proposalId);
  return { subtotal, tax, total };
}

function getFullProposal(id) {
  const proposal = db.prepare(`
    SELECT p.*, c.partner1_name, c.partner2_name, c.email AS couple_email
    FROM proposals p JOIN couples c ON c.id = p.couple_id WHERE p.id = ?
  `).get(id);
  if (!proposal) return null;
  proposal.items = db.prepare('SELECT * FROM proposal_items WHERE proposal_id = ? ORDER BY order_index, id').all(id);
  return proposal;
}

// Replace the item rows for a proposal with the supplied list.
function saveItems(proposalId, items) {
  db.prepare('DELETE FROM proposal_items WHERE proposal_id = ?').run(proposalId);
  const insert = db.prepare(`
    INSERT INTO proposal_items (proposal_id, label, description, quantity, unit_price, amount, kind, order_index)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  (items || []).forEach((it, idx) => {
    const qty = Number(it.quantity) || 1;
    const unit = Number(it.unit_price) || 0;
    const amount = it.amount != null ? Number(it.amount) : Math.round(qty * unit * 100) / 100;
    const kind = ['package', 'addon', 'custom', 'discount'].includes(it.kind) ? it.kind : 'custom';
    insert.run(proposalId, it.label || 'Item', it.description || null, qty, unit, amount, kind, idx);
  });
}

// ── Admin: list proposals ────────────────────────────────────────────────────
router.get('/', authenticateToken, (req, res) => {
  const rows = db.prepare(`
    SELECT p.*, c.partner1_name, c.partner2_name
    FROM proposals p JOIN couples c ON c.id = p.couple_id
    ORDER BY p.created_at DESC
  `).all();
  res.json(rows);
});

// ── Admin: single proposal with items ────────────────────────────────────────
router.get('/:id', authenticateToken, (req, res) => {
  const proposal = getFullProposal(req.params.id);
  if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
  res.json(proposal);
});

// ── Admin: create proposal ───────────────────────────────────────────────────
router.post('/', authenticateToken, (req, res) => {
  const { couple_id, title, package_name, event_date, end_date, guest_count,
    tax_rate, deposit_pct, valid_until, notes, items } = req.body;
  if (!couple_id || !title) return res.status(400).json({ error: 'couple_id and title are required' });

  const result = db.prepare(`
    INSERT INTO proposals (couple_id, title, package_name, event_date, end_date, guest_count,
      tax_rate, deposit_pct, valid_until, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(couple_id, title, package_name || null, event_date || null, end_date || null,
    guest_count || null, tax_rate != null ? tax_rate : 5, deposit_pct != null ? deposit_pct : 25,
    valid_until || null, notes || null);

  saveItems(result.lastInsertRowid, items);
  recomputeTotals(result.lastInsertRowid);
  res.status(201).json(getFullProposal(result.lastInsertRowid));
});

// ── Admin: update proposal ───────────────────────────────────────────────────
router.put('/:id', authenticateToken, (req, res) => {
  const existing = db.prepare('SELECT * FROM proposals WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Proposal not found' });
  const { title, package_name, event_date, end_date, guest_count,
    tax_rate, deposit_pct, valid_until, notes, status, items } = req.body;

  db.prepare(`
    UPDATE proposals SET title = ?, package_name = ?, event_date = ?, end_date = ?, guest_count = ?,
      tax_rate = ?, deposit_pct = ?, valid_until = ?, notes = ?, status = ?
    WHERE id = ?
  `).run(
    title ?? existing.title, package_name ?? existing.package_name,
    event_date ?? existing.event_date, end_date ?? existing.end_date,
    guest_count ?? existing.guest_count,
    tax_rate != null ? tax_rate : existing.tax_rate,
    deposit_pct != null ? deposit_pct : existing.deposit_pct,
    valid_until ?? existing.valid_until, notes ?? existing.notes,
    status ?? existing.status, req.params.id
  );

  if (items) saveItems(req.params.id, items);
  recomputeTotals(req.params.id);
  res.json(getFullProposal(req.params.id));
});

// ── Admin: send proposal to couple (generates public link + email) ───────────
router.post('/:id/send', authenticateToken, async (req, res) => {
  const proposal = getFullProposal(req.params.id);
  if (!proposal) return res.status(404).json({ error: 'Proposal not found' });

  const token = proposal.public_token || crypto.randomBytes(24).toString('hex');
  db.prepare(`UPDATE proposals SET status = 'sent', public_token = ?, sent_at = datetime('now') WHERE id = ?`)
    .run(token, proposal.id);

  // Move the couple forward in the pipeline when a proposal goes out.
  db.prepare(`UPDATE couples SET pipeline_stage = 'proposal' WHERE id = ? AND pipeline_stage IN ('inquiry', 'tour')`)
    .run(proposal.couple_id);

  if (proposal.couple_email) {
    await email.sendProposal({
      to: proposal.couple_email,
      coupleNames: `${proposal.partner1_name} & ${proposal.partner2_name}`,
      title: proposal.title,
      total: proposal.total,
      token,
    });
  }
  res.json(getFullProposal(req.params.id));
});

router.delete('/:id', authenticateToken, (req, res) => {
  db.prepare('DELETE FROM proposals WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── Public: view a proposal by token (no auth) ───────────────────────────────
router.get('/public/:token', (req, res) => {
  const proposal = db.prepare(`
    SELECT p.*, c.partner1_name, c.partner2_name
    FROM proposals p JOIN couples c ON c.id = p.couple_id
    WHERE p.public_token = ?
  `).get(req.params.token);
  if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
  proposal.items = db.prepare('SELECT * FROM proposal_items WHERE proposal_id = ? ORDER BY order_index, id').all(proposal.id);
  // Auto-expire if past the validity date and still pending
  if (proposal.status === 'sent' && proposal.valid_until && new Date(proposal.valid_until) < new Date()) {
    db.prepare(`UPDATE proposals SET status = 'expired' WHERE id = ?`).run(proposal.id);
    proposal.status = 'expired';
  }
  res.json(proposal);
});

// ── Public: accept a proposal → creates booking + payment schedule ───────────
router.post('/public/:token/accept', (req, res) => {
  const { accepted_name } = req.body;
  if (!accepted_name) return res.status(400).json({ error: 'Please type your name to accept' });

  const proposal = db.prepare('SELECT * FROM proposals WHERE public_token = ?').get(req.params.token);
  if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
  if (proposal.status === 'accepted') return res.status(400).json({ error: 'This proposal has already been accepted' });
  if (proposal.status === 'expired') return res.status(400).json({ error: 'This proposal has expired — please contact us for an updated quote' });

  const tx = db.transaction(() => {
    db.prepare(`UPDATE proposals SET status = 'accepted', accepted_at = datetime('now'), accepted_name = ? WHERE id = ?`)
      .run(accepted_name, proposal.id);

    // Move couple to booked in both status + pipeline
    db.prepare(`UPDATE couples SET status = 'booked', pipeline_stage = 'booked', venue_package = ? WHERE id = ?`)
      .run(proposal.package_name, proposal.couple_id);

    // Summarize add-ons for the booking record
    const addOnLabels = db.prepare(
      `SELECT label FROM proposal_items WHERE proposal_id = ? AND kind = 'addon'`
    ).all(proposal.id).map(r => r.label).join(', ');

    const booking = db.prepare(`
      INSERT INTO bookings (couple_id, event_date, end_date, package_name, guest_count, total_price, add_ons, payment_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(proposal.couple_id, proposal.event_date, proposal.end_date, proposal.package_name,
      proposal.guest_count, proposal.total, addOnLabels || null);

    // Build a deposit + balance payment schedule from the accepted total
    const deposit = Math.round(proposal.total * (proposal.deposit_pct / 100) * 100) / 100;
    const balance = Math.round((proposal.total - deposit) * 100) / 100;
    const insertInvoice = db.prepare(`
      INSERT INTO invoices (couple_id, booking_id, description, amount, due_date) VALUES (?, ?, ?, ?, ?)
    `);
    const today = new Date();
    const depositDue = new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10);
    insertInvoice.run(proposal.couple_id, booking.lastInsertRowid,
      `Booking Deposit (${proposal.deposit_pct}%)`, deposit, depositDue);
    // Final balance due 30 days before the event (or in 60 days if no date)
    let balanceDue;
    if (proposal.event_date) {
      balanceDue = new Date(new Date(proposal.event_date).getTime() - 30 * 86400000).toISOString().slice(0, 10);
    } else {
      balanceDue = new Date(today.getTime() + 60 * 86400000).toISOString().slice(0, 10);
    }
    insertInvoice.run(proposal.couple_id, booking.lastInsertRowid,
      'Final Balance — 30 days before event', balance, balanceDue);
  });
  tx();

  // Notify staff that the proposal was accepted (booking + invoices now exist).
  const couple = db.prepare('SELECT partner1_name, partner2_name FROM couples WHERE id = ?').get(proposal.couple_id);
  email.sendProposalAcceptedAdmin({
    coupleNames: couple ? `${couple.partner1_name} & ${couple.partner2_name}` : 'a couple',
    title: proposal.title,
    total: proposal.total,
    acceptedName: accepted_name,
  });

  res.json({ success: true });
});

// ── Public: decline a proposal ───────────────────────────────────────────────
router.post('/public/:token/decline', (req, res) => {
  const proposal = db.prepare('SELECT * FROM proposals WHERE public_token = ?').get(req.params.token);
  if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
  db.prepare(`UPDATE proposals SET status = 'declined' WHERE id = ?`).run(proposal.id);
  res.json({ success: true });
});

module.exports = router;
