const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { authenticateToken } = require('../middleware/auth');
const email = require('../services/email');
const rateLimit = require('../middleware/rateLimit');

// Public signing endpoints share one limiter: generous enough for normal
// reading/signing, tight enough to stop token brute-forcing.
const signLimiter = rateLimit({ windowMs: 60000, max: 20 });

// ── helpers ───────────────────────────────────────────────────────────────────

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function generatePassword(len = 10) {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ── Admin: list all contracts ────────────────────────────────────────────────
router.get('/', authenticateToken, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT c.*, co.partner1_name, co.partner2_name, co.email AS couple_email
      FROM contracts c
      JOIN couples co ON co.id = c.couple_id
      ORDER BY c.created_at DESC
    `).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: get single contract ───────────────────────────────────────────────
router.get('/:id', authenticateToken, (req, res) => {
  try {
    const row = db.prepare(`
      SELECT c.*, co.partner1_name, co.partner2_name, co.email AS couple_email
      FROM contracts c JOIN couples co ON co.id = c.couple_id
      WHERE c.id = ?
    `).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Contract not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: create contract ───────────────────────────────────────────────────
router.post('/', authenticateToken, (req, res) => {
  const {
    couple_id, title, content,
    wedding_date, start_time, end_time, guest_count,
    ceremony_location, reception_location, package_name, total_price,
  } = req.body;
  if (!couple_id || !title || !content) {
    return res.status(400).json({ error: 'couple_id, title and content are required' });
  }
  try {
    const result = db.prepare(`
      INSERT INTO contracts
        (couple_id, title, content, wedding_date, start_time, end_time,
         guest_count, ceremony_location, reception_location, package_name, total_price)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      couple_id, title, content,
      wedding_date || null, start_time || null, end_time || null,
      guest_count || null, ceremony_location || null, reception_location || null,
      package_name || null, total_price || null,
    );
    const contract = db.prepare(`
      SELECT c.*, co.partner1_name, co.partner2_name, co.email AS couple_email
      FROM contracts c JOIN couples co ON co.id = c.couple_id
      WHERE c.id = ?
    `).get(result.lastInsertRowid);
    res.status(201).json(contract);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: update contract (title / content, only if not signed) ─────────────
router.put('/:id', authenticateToken, (req, res) => {
  const { title, content } = req.body;
  try {
    const existing = db.prepare('SELECT * FROM contracts WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (existing.status === 'signed') {
      return res.status(400).json({ error: 'Cannot edit a signed contract' });
    }
    db.prepare('UPDATE contracts SET title = ?, content = ? WHERE id = ?')
      .run(title ?? existing.title, content ?? existing.content, req.params.id);
    res.json(db.prepare('SELECT * FROM contracts WHERE id = ?').get(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: delete contract ───────────────────────────────────────────────────
router.delete('/:id', authenticateToken, (req, res) => {
  try {
    db.prepare('DELETE FROM contracts WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: printable contract (open in browser, Save as PDF) ─────────────────
router.get('/:id/print', authenticateToken, (req, res) => {
  const c = db.prepare(`
    SELECT c.*, co.partner1_name, co.partner2_name, co.email AS couple_email
    FROM contracts c JOIN couples co ON co.id = c.couple_id
    WHERE c.id = ?
  `).get(req.params.id);
  if (!c) return res.status(404).send('Contract not found');

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const signedBlock = c.status === 'signed' ? `
    <div class="signed">
      <h2>Signature</h2>
      <p><strong>Signed by:</strong> ${esc(c.signer_name)}</p>
      ${c.signed_at ? `<p><strong>Date:</strong> ${esc(new Date(c.signed_at).toLocaleString())}</p>` : ''}
      ${c.signer_email ? `<p><strong>Email:</strong> ${esc(c.signer_email)}</p>` : ''}
      ${c.signature_data && c.signature_data.startsWith('data:image')
        ? `<img class="sig" src="${esc(c.signature_data)}" alt="signature" />`
        : (c.signature_data ? `<p class="sig-text">${esc(c.signature_data)}</p>` : '')}
      ${c.signer_ip ? `<p class="ip">Signed electronically · IP ${esc(c.signer_ip)}</p>` : ''}
    </div>` : `<div class="unsigned">Status: ${esc(c.status)} — not yet signed.</div>`;

  res.set('Content-Type', 'text/html').send(`<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(c.title)}</title>
<style>
  @media print { .noprint { display:none } @page { margin: 18mm } }
  body { font-family: Georgia, 'Times New Roman', serif; color:#1e293b; max-width:760px; margin:32px auto; padding:0 24px; line-height:1.55 }
  .bar { background:#e11d48; color:#fff; padding:10px 16px; border-radius:8px; display:flex; justify-content:space-between; align-items:center; font-family:system-ui,sans-serif; margin-bottom:24px }
  .bar button { background:#fff; color:#e11d48; border:0; padding:8px 16px; border-radius:6px; font-weight:700; cursor:pointer }
  h1 { font-size:22px; margin:0 0 4px }
  .content { white-space:pre-wrap; font-size:14px }
  .signed { margin-top:32px; border-top:2px solid #e2e8f0; padding-top:16px }
  .sig { max-height:90px; border-bottom:1px solid #94a3b8; margin-top:6px }
  .sig-text { font-size:24px; font-family:'Brush Script MT', cursive; border-bottom:1px solid #94a3b8; display:inline-block; padding:4px 12px }
  .ip { color:#94a3b8; font-size:12px; font-family:system-ui,sans-serif }
  .unsigned { margin-top:32px; color:#b45309; font-style:italic }
</style></head>
<body>
  <div class="bar noprint">
    <span>Rustic Retreat Weddings — Contract</span>
    <button onclick="window.print()">Save as PDF / Print</button>
  </div>
  <div class="content">${esc(c.content)}</div>
  ${signedBlock}
</body></html>`);
});

// ── Admin: send contract (generate signing link) ─────────────────────────────
router.post('/:id/send', authenticateToken, (req, res) => {
  try {
    const contract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(req.params.id);
    if (!contract) return res.status(404).json({ error: 'Not found' });
    if (contract.status === 'signed') {
      return res.status(400).json({ error: 'Contract already signed' });
    }
    const token = generateToken();
    db.prepare(`
      UPDATE contracts SET signing_token = ?, status = 'sent', sent_at = datetime('now')
      WHERE id = ?
    `).run(token, req.params.id);

    // Email signing link to couple
    const couple = db.prepare('SELECT * FROM couples WHERE id = ?').get(contract.couple_id);
    email.sendContractLink({
      to: couple.email,
      coupleNames: `${couple.partner1_name} & ${couple.partner2_name}`,
      contractTitle: contract.title,
      signingUrl: `/sign/${token}`,
    });

    res.json({ token, signing_url: `/sign/${token}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Public: get contract for signing (no auth) ───────────────────────────────
router.get('/sign/:token', signLimiter, (req, res) => {
  try {
    const contract = db.prepare(`
      SELECT c.id, c.title, c.content, c.status, c.signer_name, c.signed_at,
             co.partner1_name, co.partner2_name, co.email AS couple_email
      FROM contracts c JOIN couples co ON co.id = c.couple_id
      WHERE c.signing_token = ?
    `).get(req.params.token);

    if (!contract) return res.status(404).json({ error: 'Invalid or expired signing link' });
    if (contract.status === 'signed') {
      return res.json({ ...contract, already_signed: true });
    }
    res.json(contract);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Public: submit signature ─────────────────────────────────────────────────
router.post('/sign/:token', signLimiter, (req, res) => {
  const { signer_name, signature_data } = req.body;
  if (!signer_name || !signature_data) {
    return res.status(400).json({ error: 'Signer name and signature are required' });
  }

  try {
    const contract = db.prepare(`
      SELECT c.*, co.partner1_name, co.partner2_name, co.email, co.password_hash
      FROM contracts c JOIN couples co ON co.id = c.couple_id
      WHERE c.signing_token = ?
    `).get(req.params.token);

    if (!contract) return res.status(404).json({ error: 'Invalid signing link' });
    if (contract.status === 'signed') {
      return res.status(400).json({ error: 'Contract already signed' });
    }

    const signer_ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';

    // Mark signed
    db.prepare(`
      UPDATE contracts
      SET status = 'signed', signed_at = datetime('now'),
          signer_name = ?, signer_email = ?, signature_data = ?, signer_ip = ?,
          portal_credentials_sent = 1
      WHERE signing_token = ?
    `).run(signer_name, contract.email, signature_data, signer_ip, req.params.token);

    // Update couple: status → booked, and sync event details from contract
    db.prepare(`
      UPDATE couples SET
        status = CASE WHEN status IN ('lead','inquiry') THEN 'booked' ELSE status END,
        wedding_date   = COALESCE(?, wedding_date),
        venue_package  = COALESCE(?, venue_package)
      WHERE id = ?
    `).run(contract.wedding_date || null, contract.package_name || null, contract.couple_id);

    // Upsert booking with event details from the signed contract
    if (contract.wedding_date) {
      const existing = db.prepare(
        'SELECT id FROM bookings WHERE couple_id = ? ORDER BY id LIMIT 1'
      ).get(contract.couple_id);

      if (existing) {
        db.prepare(`
          UPDATE bookings SET
            event_date          = COALESCE(?, event_date),
            start_time          = COALESCE(?, start_time),
            end_time            = COALESCE(?, end_time),
            guest_count         = COALESCE(?, guest_count),
            ceremony_location   = COALESCE(?, ceremony_location),
            reception_location  = COALESCE(?, reception_location),
            package_name        = COALESCE(?, package_name),
            total_price         = COALESCE(?, total_price)
          WHERE id = ?
        `).run(
          contract.wedding_date, contract.start_time, contract.end_time,
          contract.guest_count, contract.ceremony_location, contract.reception_location,
          contract.package_name, contract.total_price, existing.id,
        );
      } else {
        db.prepare(`
          INSERT INTO bookings
            (couple_id, event_date, start_time, end_time, guest_count,
             ceremony_location, reception_location, package_name, total_price)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          contract.couple_id, contract.wedding_date,
          contract.start_time || null, contract.end_time || null,
          contract.guest_count || null, contract.ceremony_location || null,
          contract.reception_location || null, contract.package_name || null,
          contract.total_price || null,
        );
      }
    }

    // Create / reveal portal credentials
    let plain_password = null;
    let is_new_account = false;

    if (!contract.password_hash) {
      // First-time: generate credentials
      plain_password = generatePassword();
      const hashed = bcrypt.hashSync(plain_password, 10);
      db.prepare('UPDATE couples SET password_hash = ? WHERE id = ?')
        .run(hashed, contract.couple_id);
      is_new_account = true;
    }

    const coupleNames = `${contract.partner1_name} & ${contract.partner2_name}`;
    const signedAt = new Date().toLocaleString();

    // Confirmation email to couple
    email.sendContractSignedCouple({
      to: contract.email,
      coupleNames,
      contractTitle: contract.title,
    });

    // Notification email to admin
    email.sendContractSignedAdmin({
      coupleNames,
      contractTitle: contract.title,
      signerName: signer_name,
      signedAt,
    });

    res.json({
      success: true,
      message: 'Contract signed successfully!',
      couple_name: coupleNames,
      portal_email: contract.email,
      portal_password: is_new_account ? plain_password : null,
      is_new_account,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: generate contract pre-filled from an accepted proposal ─────────────
router.post('/from-proposal/:proposalId', authenticateToken, (req, res) => {
  try {
    const proposal = db.prepare(`
      SELECT p.*, c.partner1_name, c.partner2_name, c.email AS couple_email
      FROM proposals p JOIN couples c ON c.id = p.couple_id WHERE p.id = ?
    `).get(req.params.proposalId);
    if (!proposal) return res.status(404).json({ error: 'Proposal not found' });

    const items = db.prepare(
      'SELECT * FROM proposal_items WHERE proposal_id = ? ORDER BY order_index, id'
    ).all(proposal.id);

    const fmtCAD = (n) => `$${Number(n || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CAD`;
    const fmtDate = (d) => d
      ? new Date(d + 'T00:00:00').toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      : 'TBD';

    const deposit = Math.round(proposal.total * (proposal.deposit_pct / 100) * 100) / 100;
    const balance = Math.round((proposal.total - deposit) * 100) / 100;
    const today = new Date();
    const depositDue = new Date(today.getTime() + 7 * 86400000)
      .toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
    const balanceDue = proposal.event_date
      ? new Date(new Date(proposal.event_date + 'T00:00:00').getTime() - 30 * 86400000)
          .toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })
      : new Date(today.getTime() + 60 * 86400000)
          .toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });

    // Build itemized section
    const byKind = { package: [], addon: [], custom: [], discount: [] };
    for (const it of items) byKind[it.kind]?.push(it);

    let itemLines = '';
    if (byKind.package.length) {
      itemLines += '\n   PACKAGE';
      for (const it of byKind.package) {
        itemLines += `\n   ${it.label}${it.description ? ' — ' + it.description : ''}: ${fmtCAD(it.amount)}`;
      }
    }
    if (byKind.addon.length) {
      itemLines += '\n\n   ADD-ONS';
      for (const it of byKind.addon) {
        itemLines += `\n   ${it.label}${it.quantity > 1 ? ' × ' + it.quantity : ''}: ${fmtCAD(it.amount)}`;
      }
    }
    if (byKind.custom.length) {
      itemLines += '\n\n   OTHER';
      for (const it of byKind.custom) {
        itemLines += `\n   ${it.label}: ${fmtCAD(it.amount)}`;
      }
    }
    if (byKind.discount.length) {
      itemLines += '\n\n   DISCOUNTS';
      for (const it of byKind.discount) {
        itemLines += `\n   ${it.label}: -${fmtCAD(Math.abs(it.amount))}`;
      }
    }

    const endDateLine = proposal.end_date && proposal.end_date !== proposal.event_date
      ? `\n   Check-Out:     ${fmtDate(proposal.end_date)}` : '';

    const contractContent = `VENUE SERVICES AGREEMENT
Rustic Retreat Weddings & Events

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PARTIES

Venue Provider: Rustic Retreat Weddings & Events ("the Venue")
  Location: Alberta, Canada

Clients: ${proposal.partner1_name} and ${proposal.partner2_name} ("the Clients")
  Email: ${proposal.couple_email || ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. EVENT DETAILS

   Check-In:      ${fmtDate(proposal.event_date)}${endDateLine}
   Package:       ${proposal.package_name || 'As quoted'}
   Guest Count:   ${proposal.guest_count ? proposal.guest_count + ' guests (maximum 80 permitted)' : 'TBD (maximum 80 permitted)'}
   Venue:         Rustic Retreat — 65-acre off-grid solar property, Alberta

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

2. SERVICES AND PRICING
${itemLines}

   ─────────────────────────────────────────
   Subtotal:      ${fmtCAD(proposal.subtotal)}
   GST (5%):      ${fmtCAD(proposal.tax)}
   ─────────────────────────────────────────
   TOTAL:         ${fmtCAD(proposal.total)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

3. PAYMENT SCHEDULE

   Deposit (${proposal.deposit_pct}%):  ${fmtCAD(deposit)} — due by ${depositDue}
   Final Balance:  ${fmtCAD(balance)} — due by ${balanceDue}

   Payments accepted by e-transfer to info@rusticretreat.com or online through the client portal.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

4. CANCELLATION POLICY

   a) More than 180 days before event: deposit is forfeited, no further charges.
   b) 91–180 days before event: 50% of the total contract value is forfeited.
   c) 90 days or fewer before event: 100% of the total contract value is forfeited.
   d) Venue Cancellation: All payments refunded in full within 14 business days.
   e) Force Majeure: If the event cannot proceed due to wildfire evacuation orders, extreme weather making the venue inaccessible, or provincial emergency orders, the Venue will reschedule to a mutually agreeable date at no additional fee.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

5. VENUE POLICIES

   a) Guest Limit — Maximum 80 guests including the wedding party. Any increase requires written approval and may incur additional fees.

   b) Exclusive Use — The full 65-acre property is reserved exclusively for the Clients during the booked package period. No other events will be hosted.

   c) Noise & Quiet Hours — Amplified music must end by midnight on the wedding night. All other nights: 11 PM cutoff. Acoustic music may continue at a reasonable outdoor volume.

   d) Off-Grid Solar Power — Rustic Retreat operates entirely on solar power. Clients must disclose all electrical requirements in advance. Generator rentals are available as an add-on and must be arranged before the event.

   e) Alcohol (AGLC) — Clients are responsible for obtaining an Alberta Gaming, Liquor & Cannabis (AGLC) Special Event Licence where required. All bar service must comply with Alberta liquor laws.

   f) Fireworks & Open Flame — Fireworks, fire pits, and similar open flames are permitted only with written approval and must comply with current Alberta fire restrictions. Fireworks must be coordinated through the Venue.

   g) Pets — Well-behaved dogs are welcome with advance written notice and the Pet Cabin add-on. No other animals without written approval. Pets are not permitted in the Bridal Suite.

   h) Vendors — Clients may bring licensed and insured vendors. All vendors must comply with Venue policies and carry their own liability insurance. There is no commercial kitchen on-site.

   i) Décor — Nothing may be nailed, screwed, or stapled to any structure. Loose glitter and confetti are prohibited. All items must be cleared from the property by checkout.

   j) Damage — The Clients are responsible for damage caused by Clients, guests, or vendors beyond normal wear and tear. A pre-event walk-through will be completed to document existing conditions.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

6. GENERAL TERMS

   a) Governing Law — This Agreement is governed by the laws of the Province of Alberta, Canada, and the parties attorn to the exclusive jurisdiction of the Alberta courts.

   b) Amendments — Any changes to this Agreement must be in writing and agreed to by both parties.

   c) Entire Agreement — This Agreement, together with the accepted Proposal #${proposal.id} (${proposal.title}), constitutes the entire agreement between the parties and supersedes all prior discussions.

   d) Electronic Signature — An electronic signature applied through the Venue's online portal is legally binding under Alberta's Electronic Transactions Act, SA 2001, c E-5.5.

   e) Severability — If any provision is found unenforceable, it will be severed and the remaining provisions will continue in full effect.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

By signing below, the Clients agree to the full terms of this Agreement.`;

    const title = `Event Services Agreement — ${proposal.partner1_name} & ${proposal.partner2_name}${proposal.event_date ? ' · ' + proposal.event_date : ''}`;

    const result = db.prepare(`
      INSERT INTO contracts (couple_id, title, content, wedding_date, package_name, guest_count, total_price)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      proposal.couple_id, title, contractContent,
      proposal.event_date || null, proposal.package_name || null,
      proposal.guest_count || null, proposal.total || null,
    );

    const contract = db.prepare(`
      SELECT c.*, co.partner1_name, co.partner2_name, co.email AS couple_email
      FROM contracts c JOIN couples co ON co.id = c.couple_id WHERE c.id = ?
    `).get(result.lastInsertRowid);
    res.status(201).json(contract);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
