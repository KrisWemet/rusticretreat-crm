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
  // Wrapped because Express 4 does not catch a rejected async handler: the
  // rejection escapes to the process, and Node treats an unhandled rejection as
  // fatal. One failed proposal email would take the entire CRM down and every
  // request would answer 502 until the platform restarted it.
  try {
    const proposal = getFullProposal(req.params.id);
    if (!proposal) return res.status(404).json({ error: 'Proposal not found' });

    const token = proposal.public_token || crypto.randomBytes(24).toString('hex');
    db.prepare(`UPDATE proposals SET status = 'sent', public_token = ?, sent_at = datetime('now') WHERE id = ?`)
      .run(token, proposal.id);

    // Move the couple forward in the pipeline when a proposal goes out.
    db.prepare(`UPDATE couples SET pipeline_stage = 'proposal' WHERE id = ? AND pipeline_stage IN ('inquiry', 'tour')`)
      .run(proposal.couple_id);

    let delivery = { delivered: true, error: null };
    if (proposal.couple_email) {
      const r = await email.sendProposal({
        to: proposal.couple_email,
        coupleNames: `${proposal.partner1_name} & ${proposal.partner2_name}`,
        title: proposal.title,
        total: proposal.total,
        token,
      });
      delivery = { delivered: r?.delivered === true, error: r?.error || null };
    }
    // The proposal is sent either way — the link is live. Say so honestly rather
    // than letting staff assume the couple was emailed.
    res.json({ ...getFullProposal(req.params.id), ...delivery });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authenticateToken, (req, res) => {
  db.prepare('DELETE FROM proposals WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── Admin: printable proposal (open in browser, Save as PDF) ─────────────────
router.get('/:id/print', authenticateToken, (req, res) => {
  const proposal = getFullProposal(req.params.id);
  if (!proposal) return res.status(404).send('Proposal not found');

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fmtCAD = (n) => `$${Number(n || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }) : '';

  const deposit = Math.round(proposal.total * (proposal.deposit_pct / 100) * 100) / 100;
  const balance = Math.round((proposal.total - deposit) * 100) / 100;

  const kindLabel = { package: 'Package', addon: 'Add-On', custom: 'Other', discount: 'Discount' };
  const rowsHtml = proposal.items.map(it => `
    <tr>
      <td>${esc(it.label)}${it.description ? `<br><span class="desc">${esc(it.description)}</span>` : ''}</td>
      <td class="num">${it.quantity !== 1 ? it.quantity : ''}</td>
      <td class="num">${it.quantity !== 1 ? fmtCAD(it.unit_price) : ''}</td>
      <td class="num amt">${it.kind === 'discount' ? '-' : ''}${fmtCAD(Math.abs(it.amount))}</td>
    </tr>`).join('');

  const statusBadgeStyle = {
    draft: 'background:#f1f5f9;color:#475569',
    sent: 'background:#dbeafe;color:#1d4ed8',
    accepted: 'background:#d1fae5;color:#065f46',
    declined: 'background:#fee2e2;color:#991b1b',
    expired: 'background:#fef3c7;color:#92400e',
  }[proposal.status] || 'background:#f1f5f9;color:#475569';

  res.set('Content-Type', 'text/html').send(`<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(proposal.title)}</title>
<style>
  @page { margin: 18mm }
  *{box-sizing:border-box}
  body{font-family:system-ui,-apple-system,sans-serif;color:#1e293b;max-width:760px;margin:32px auto;padding:0 24px;font-size:14px;line-height:1.5}
  .bar{background:#e11d48;color:#fff;padding:10px 16px;border-radius:8px;display:flex;justify-content:space-between;align-items:center;margin-bottom:24px}
  .bar button{background:#fff;color:#e11d48;border:0;padding:8px 16px;border-radius:6px;font-weight:700;cursor:pointer}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px}
  .logo{font-size:20px;font-weight:800;color:#e11d48}
  .logo small{display:block;font-size:12px;font-weight:400;color:#64748b;margin-top:2px}
  h1{font-size:18px;font-weight:700;margin:0 0 4px}
  .badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;${statusBadgeStyle};text-transform:capitalize}
  .meta{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;margin:20px 0;background:#f8fafc;border-radius:8px;padding:14px 16px}
  .meta-item label{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;font-weight:600;display:block}
  .meta-item span{font-size:13px;font-weight:600;color:#1e293b}
  table{width:100%;border-collapse:collapse;margin:20px 0}
  thead th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;font-weight:600;padding:8px 10px;border-bottom:2px solid #e2e8f0;text-align:left}
  tbody td{padding:9px 10px;border-bottom:1px solid #f1f5f9;vertical-align:top}
  .num{text-align:right;white-space:nowrap}
  .amt{font-weight:600}
  .desc{font-size:12px;color:#94a3b8;margin-top:2px}
  .totals{margin-left:auto;width:260px}
  .totals table{margin:0}
  .totals td{padding:5px 10px;border:none}
  .totals .label{color:#64748b}
  .totals .grand{font-size:16px;font-weight:800;border-top:2px solid #e2e8f0;padding-top:10px}
  .payment{margin-top:20px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px}
  .payment h3{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#059669;font-weight:700;margin:0 0 8px}
  .payment-row{display:flex;justify-content:space-between;font-size:13px;padding:3px 0}
  .payment-row strong{color:#1e293b}
  .notes{margin-top:20px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 16px}
  .notes h3{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#d97706;font-weight:700;margin:0 0 8px}
  .footer{margin-top:32px;border-top:1px solid #e2e8f0;padding-top:16px;font-size:11px;color:#94a3b8;display:flex;justify-content:space-between}
  .hint{font-size:12px;color:#64748b;background:#f8fafc;border-radius:6px;padding:8px 12px;margin:-16px 0 24px}

  /* Print rules go last and use !important on purpose: .noprint and .bar have
     the same specificity, so source order alone would decide the winner. The
     toolbar used to print onto the page because .bar came afterwards. */
  @media print {
    .noprint { display: none !important }
    body { margin: 0 auto; max-width: none }
  }
</style></head>
<body>
  <div class="bar noprint">
    <span>Rustic Retreat — Proposal</span>
    <button onclick="window.print()">Print</button>
  </div>
  <p class="hint noprint">Pick your printer under <strong>Destination</strong> in the
  print dialog. <strong>Save as PDF</strong> is just one destination in that list — if
  it is the only one offered, no printer is set up on this computer.</p>

  <div class="header">
    <div>
      <div class="logo">Rustic Retreat<small>Weddings &amp; Events · Alberta, Canada</small></div>
    </div>
    <div style="text-align:right">
      <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em">Proposal</div>
      <div style="font-size:12px;color:#64748b;margin-top:4px">Prepared ${new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
    </div>
  </div>

  <h1>${esc(proposal.title)}</h1>
  <span class="badge">${esc(proposal.status)}</span>
  <div style="margin-top:6px;font-size:13px;color:#64748b">Prepared for <strong>${esc(proposal.partner1_name)} &amp; ${esc(proposal.partner2_name)}</strong></div>

  <div class="meta">
    ${proposal.event_date ? `<div class="meta-item"><label>Check-In</label><span>${fmtDate(proposal.event_date)}</span></div>` : ''}
    ${proposal.end_date && proposal.end_date !== proposal.event_date ? `<div class="meta-item"><label>Check-Out</label><span>${fmtDate(proposal.end_date)}</span></div>` : ''}
    ${proposal.guest_count ? `<div class="meta-item"><label>Guests</label><span>${proposal.guest_count}</span></div>` : ''}
    ${proposal.valid_until ? `<div class="meta-item"><label>Valid Until</label><span>${fmtDate(proposal.valid_until)}</span></div>` : ''}
    ${proposal.package_name ? `<div class="meta-item"><label>Package</label><span>${esc(proposal.package_name)}</span></div>` : ''}
  </div>

  <table>
    <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit Price</th><th class="num">Amount</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>

  <div class="totals">
    <table>
      <tr><td class="label">Subtotal</td><td class="num">${fmtCAD(proposal.subtotal)}</td></tr>
      <tr><td class="label">GST (${proposal.tax_rate}%)</td><td class="num">${fmtCAD(proposal.tax)}</td></tr>
      <tr class="grand"><td><strong>Total</strong></td><td class="num"><strong>${fmtCAD(proposal.total)}</strong></td></tr>
    </table>
  </div>

  <div class="payment">
    <h3>Payment Schedule</h3>
    <div class="payment-row"><span>Deposit (${proposal.deposit_pct}%)</span><strong>${fmtCAD(deposit)}</strong></div>
    <div class="payment-row"><span>Final Balance</span><strong>${fmtCAD(balance)}</strong></div>
  </div>

  ${proposal.notes ? `<div class="notes"><h3>Notes</h3><p style="margin:0;font-size:13px;white-space:pre-wrap">${esc(proposal.notes)}</p></div>` : ''}

  <div class="footer">
    <span>Rustic Retreat Weddings &amp; Events · Alberta, Canada</span>
    <span>Proposal #${proposal.id}</span>
  </div>
</body></html>`);
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
