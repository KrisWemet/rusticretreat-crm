const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { authenticateToken } = require('../middleware/auth');
const email = require('../services/email');
const rateLimit = require('../middleware/rateLimit');
const { ETRANSFER_EMAIL } = require('../venue');
const tpl = require('../services/contractTemplate');
const { renderPacketHtml } = require('../services/contractRender');

// Public signing endpoints share one limiter: generous enough for normal
// reading/signing, tight enough to stop token brute-forcing.
const signLimiter = rateLimit({ windowMs: 60000, max: 20 });

// ── helpers ───────────────────────────────────────────────────────────────────

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// How long a signing link stays usable. Contracts sit unsigned for weeks while
// couples think it over, so this is generous — but a link that never expires is
// a permanent bearer credential to sign a binding agreement.
const SIGNING_LINK_DAYS = Number(process.env.SIGNING_LINK_DAYS || 45);

// The consent language lives here, server-side, and is echoed to the signing
// page so the couple reads exactly the sentence that gets stored against their
// signature. If the client sent its own text, the record would attest to
// whatever the browser chose to post rather than what we actually presented.
function consentStatement(signerName, contractTitle, docTitles) {
  // A packet is several documents signed in one ceremony, and the consent has to
  // name each of them. Saying "this agreement" while two documents are being
  // executed would leave the record vaguer than what the signer actually agreed
  // to — and Schedule A is precisely the document the rental agreement says the
  // booking is incomplete without.
  const titles = (docTitles && docTitles.length)
    ? docTitles.map(t => `"${t}"`).join(' and ')
    : `"${contractTitle}"`;
  const plural = docTitles && docTitles.length > 1;
  return (
    `I, ${signerName}, have read and understood ${titles} in ${plural ? 'their' : 'its'} entirety ` +
    `and agree to be legally bound by ${plural ? 'their' : 'its'} terms and conditions. I confirm that the ` +
    'signature I have drawn is my legally binding electronic signature, and I consent ' +
    `to signing ${plural ? 'these documents' : 'this agreement'} electronically under Alberta's Electronic Transactions ` +
    'Act, SA 2001, c E-5.5.'
  );
}

// The documents a contract covers: the packet's when it is template-backed, and
// its own single title when it is one of the older free-text contracts.
function docTitlesFor(contract) {
  if (!contract.template_key) return [contract.title];
  const packet = tpl.getPacket(contract.template_key);
  return packet ? packet.documents.map(d => d.title) : [contract.title];
}

// ── Signing chain ────────────────────────────────────────────────────────────
// The venue signs first and that locks the terms; the couple then signs a
// document that can no longer change under them. Order is fixed:
//   1 venue → 2 partner 1 → 3 partner 2
const VENUE_SIGNER_NAME = process.env.VENUE_SIGNER_NAME || 'Rustic Retreat Weddings & Events';

// The couple-facing portal is not in use yet, so signing does not mint portal
// logins. Issuing credentials for a portal nobody is running would hand couples
// a password to somewhere they should not be going, and quietly create a live
// login on every signature. Set ENABLE_COUPLE_PORTAL=1 to turn it back on.
const PORTAL_ENABLED = process.env.ENABLE_COUPLE_PORTAL === '1';

function signersFor(contractId) {
  return db.prepare(
    'SELECT * FROM contract_signers WHERE contract_id = ? ORDER BY sign_order'
  ).all(contractId);
}

// The next person owed a signature, or undefined when the contract is complete.
function nextSigner(contractId) {
  return db.prepare(`
    SELECT * FROM contract_signers
    WHERE contract_id = ? AND status != 'signed'
    ORDER BY sign_order LIMIT 1
  `).get(contractId);
}

// Issue a token for whoever is next and email them. Called after each signature
// so only one live link exists at a time — a later signer's link simply does not
// exist until it is their turn.
async function activateNextSigner(contract, couple) {
  const next = nextSigner(contract.id);
  if (!next) return null;

  const token = generateToken();
  db.prepare(`
    UPDATE contract_signers
    SET signing_token = ?, status = 'sent', sent_at = datetime('now')
    WHERE id = ?
  `).run(token, next.id);

  // The venue signs from inside the CRM, where they are already authenticated,
  // so there is nobody to email a link to.
  if (next.role === 'venue') return { ...next, signing_token: token, delivered: true };

  // Awaited, and the outcome travels back to the caller. Each partner signs
  // from their own address for the signatures to be independently attributable,
  // so there is no fallback recipient — if this address does not work, staff
  // have to be told rather than left believing the couple was emailed.
  const result = await email.sendContractLink({
    to: next.email,
    coupleNames: `${couple.partner1_name} & ${couple.partner2_name}`,
    contractTitle: contract.title,
    signingUrl: `/sign/${token}`,
    signerName: next.name,
  });

  return {
    ...next, signing_token: token,
    delivered: result?.delivered === true,
    delivery_error: result?.error || null,
  };
}

function generatePassword(len = 10) {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  // crypto.randomBytes, not Math.random — this is a real portal credential.
  // V8's Math.random is a single predictable stream per process, so passwords
  // issued to successive couples would be recoverable from one another.
  const buf = crypto.randomBytes(len);
  return Array.from(buf, b => chars[b % chars.length]).join('');
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

    // Attach every signer, because contracts.signer_name only ever holds
    // whoever signed last — the list was crediting the whole agreement to
    // partner 2 and showing no sign of the venue or partner 1 having signed it.
    // One query for all contracts rather than one per row.
    const all = db.prepare(`
      SELECT id, contract_id, sign_order, role, name, email, status, signed_at
      FROM contract_signers ORDER BY contract_id, sign_order
    `).all();
    const byContract = new Map();
    for (const s of all) {
      if (!byContract.has(s.contract_id)) byContract.set(s.contract_id, []);
      byContract.get(s.contract_id).push(s);
    }

    res.json(rows.map(r => ({ ...r, signers: byContract.get(r.id) || [] })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: get single contract ───────────────────────────────────────────────
// ── Admin: available contract packets ────────────────────────────────────────
// Registered before /:id on purpose — Express matches in order, and /:id would
// otherwise swallow "templates" as a contract id and answer 404.
router.get('/templates', authenticateToken, (req, res) => {
  res.json(tpl.listPackets());
});

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
    couple_id, title, content, template_packet,
    wedding_date, start_time, end_time, guest_count,
    ceremony_location, reception_location, package_name, total_price,
  } = req.body;

  // Two kinds of contract live side by side. A template packet carries its own
  // text, so no content is posted; a free-text contract still requires it.
  const packet = template_packet ? tpl.getPacket(template_packet) : null;
  if (template_packet && !packet) {
    return res.status(400).json({ error: `Unknown contract template "${template_packet}"` });
  }
  if (!couple_id || !title) {
    return res.status(400).json({ error: 'couple_id and title are required' });
  }
  if (!packet && !content) {
    return res.status(400).json({ error: 'content is required for a free-text contract' });
  }

  // contracts.content is NOT NULL and every legacy code path reads it. For a
  // template contract it holds a one-line synopsis rather than the terms, which
  // keeps list views and search readable without pretending to be the document.
  const storedContent = packet
    ? `${packet.title}\n\nThis contract is generated from the ${packet.documents.length}-document ` +
      `packet: ${packet.documents.map(d => d.title).join('; ')}.`
    : content;

  try {
    const result = db.prepare(`
      INSERT INTO contracts
        (couple_id, title, content, template_key, template_version,
         wedding_date, start_time, end_time,
         guest_count, ceremony_location, reception_location, package_name, total_price)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      couple_id, title, storedContent,
      packet ? packet.key : null,
      packet ? packet.documents[0].version : null,
      wedding_date || null, start_time || null, end_time || null,
      guest_count || null, ceremony_location || null, reception_location || null,
      package_name || null, total_price || null,
    );
    // Seed the client-detail fields the venue fills in. The CRM already holds
    // these from the enquiry, and retyping a couple's own email into their
    // contract is both wasted work and a chance to get the signing address
    // wrong. Only non-empty values are written, so nothing overwrites a real
    // answer with a blank.
    if (packet) {
      const couple = db.prepare('SELECT * FROM couples WHERE id = ?').get(couple_id);
      if (couple) {
        const seed = {
          // Fixed amounts the template declares, such as the $1,000 damage
          // deposit set by Section 4.2.
          ...tpl.defaultValues(packet, 'venue'),
          client1_name:  couple.partner1_name,
          client2_name:  couple.partner2_name,
          client1_email: couple.email,
          client2_email: couple.partner2_email,
          client1_phone: couple.phone,
        };
        tpl.saveValues(
          result.lastInsertRowid,
          Object.fromEntries(Object.entries(seed).filter(([, v]) => v)),
          'venue',
          packet,
        );
      }
    }

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
    // The venue signing is the point of no return. If the terms could still move
    // afterwards, the couple would be signing a document different from the one
    // the venue committed to — which is the exact thing signing first prevents.
    if (existing.locked_at) {
      return res.status(400).json({
        error: 'This contract was locked when the venue signed it and can no longer be edited. ' +
               'Delete it and create a new one if the terms need to change.',
      });
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

// ── Admin: the template packet, its current answers, and what is outstanding ──
// One endpoint rather than three: the prep screen needs the definition, the
// values and the gaps together, and splitting them guarantees a render where the
// form and its completeness banner disagree.
router.get('/:id/template', authenticateToken, (req, res) => {
  try {
    const contract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(req.params.id);
    if (!contract) return res.status(404).json({ error: 'Not found' });
    if (!contract.template_key) {
      return res.status(400).json({ error: 'This is a free-text contract, not a template', not_template: true });
    }
    const packet = tpl.getPacket(contract.template_key);
    if (!packet) return res.status(500).json({ error: `Template "${contract.template_key}" is no longer available` });

    const { values, meta } = tpl.getValues(contract.id);
    res.json({
      packet: {
        key: packet.key, title: packet.title,
        documents: packet.documents.map(d => ({
          key: d.key, title: d.title, subtitle: d.subtitle, preamble: d.preamble,
          venueBlock: d.venueBlock, sections: d.sections, appendix: d.appendix,
          signatures: d.signatures, gstRate: d.gstRate,
        })),
      },
      values, meta,
      locked: !!contract.locked_at,
      client_fields_locked: !!contract.client_fields_locked_at,
      payment_schedule: tpl.paymentSchedule(packet, values),
      fee_breakdown: tpl.feeBreakdown(packet, values),
      missing_venue: tpl.missingRequired(packet, values, 'venue'),
      missing_client: tpl.missingRequired(packet, values, 'client'),
      initials_blocks: tpl.initialsBlocks(packet),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: fill in the venue's own fields before sending ─────────────────────
router.put('/:id/fields', authenticateToken, (req, res) => {
  try {
    const contract = db.prepare(`
      SELECT c.*, co.partner1_name, co.partner2_name, co.email, co.partner2_email
      FROM contracts c JOIN couples co ON co.id = c.couple_id
      WHERE c.id = ?
    `).get(req.params.id);
    if (!contract) return res.status(404).json({ error: 'Not found' });
    if (!contract.template_key) {
      return res.status(400).json({ error: 'This is a free-text contract, not a template' });
    }
    // Same rule as editing the terms: once the venue has signed, the document the
    // couple is reading must not move. The couple's own fields stay open — those
    // are answers to the contract, not changes to it.
    if (contract.locked_at) {
      return res.status(400).json({
        error: 'This contract was locked when the venue signed it. Venue details can no longer be changed.',
        locked: true,
      });
    }
    const packet = tpl.getPacket(contract.template_key);
    if (!packet) return res.status(500).json({ error: 'Template no longer available' });

    const { written, ignored } = tpl.saveValues(contract.id, req.body?.fields, 'venue', packet);
    const { values } = tpl.getValues(contract.id);

    // The couple's names and addresses live in two places now: on the couple
    // record, which the signing chain reads to decide who gets a link, and on
    // the contract, which is what gets printed. If they disagree the contract
    // names one address and the link goes to another — silently. So a change
    // here is written back to the couple record, making the contract the place
    // staff edit and the couple record follow.
    const syncWarnings = [];
    const syncPairs = [
      ['client1_name',  'partner1_name'],
      ['client2_name',  'partner2_name'],
      ['client1_email', 'email'],
      ['client2_email', 'partner2_email'],
    ];
    for (const [fieldKey, coupleCol] of syncPairs) {
      const v = String(values[fieldKey] ?? '').trim();
      if (!v || v === contract[coupleCol]) continue;
      try {
        db.prepare(`UPDATE couples SET ${coupleCol} = ? WHERE id = ?`).run(v, contract.couple_id);
      } catch (e) {
        // couples.email is UNIQUE — it is the portal login. A collision means
        // another couple already uses that address, which is a real conflict
        // staff have to resolve, not something to paper over.
        syncWarnings.push(
          coupleCol === 'email'
            ? `Could not set ${v} as the client's main email — another client record already uses it.`
            : `Could not update ${coupleCol}: ${e.message}`
        );
      }
    }

    // Mirror the two answers the rest of the CRM reads onto the contract row, so
    // the calendar and the invoice list keep working without every consumer
    // learning how to walk a template.
    const label = tpl.packageLabel(packet, values);
    const total = parseFloat(String(values.total_package_fee || '').replace(/[^0-9.]/g, ''));
    db.prepare('UPDATE contracts SET wedding_date = ?, package_name = ?, total_price = ? WHERE id = ?')
      .run(values.event_date || contract.wedding_date || null,
           label || contract.package_name || null,
           Number.isFinite(total) ? total : contract.total_price,
           contract.id);

    res.json({
      success: true, written, ignored, values,
      sync_warnings: syncWarnings,
      payment_schedule: tpl.paymentSchedule(packet, values),
      fee_breakdown: tpl.feeBreakdown(packet, values),
      missing_venue: tpl.missingRequired(packet, values, 'venue'),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Printable contract renderer (shared by the admin and signer copies) ──────
function renderContractHtml(c) {
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fmt = (d) => d ? new Date(d.replace(' ', 'T') + 'Z').toLocaleString('en-CA') : '';

  const ROLE_LABEL = {
    venue: 'For the Venue — Rustic Retreat Weddings & Events',
    partner1: 'Client — Partner 1',
    partner2: 'Client — Partner 2',
  };

  // Render one signature block per signer. Contracts executed before multi-party
  // signing have no signer rows, so fall back to the contract's own columns and
  // present them as the single signature they were.
  const signers = (c.signers && c.signers.length) ? c.signers : (
    c.status === 'signed' ? [{
      role: 'partner1', name: c.signer_name, email: c.signer_email,
      signature_data: c.signature_data, signed_at: c.signed_at, viewed_at: c.viewed_at,
      signer_ip: c.signer_ip, signer_user_agent: c.signer_user_agent,
      consent_text: c.consent_text, status: 'signed',
    }] : []
  );

  const isImg = (s) => typeof s === 'string' &&
    /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(s);

  const renderSigner = (s) => {
    if (s.status !== 'signed') {
      return `<div class="pending-signer">
        <strong>${esc(ROLE_LABEL[s.role] || s.role)}</strong><br>
        ${esc(s.name)} — awaiting signature
      </div>`;
    }
    const rows = [
      ['Date signed', fmt(s.signed_at)],
      ['Email', s.email],
      ['First viewed', fmt(s.viewed_at)],
      ['IP address', s.signer_ip],
      ['Device', s.signer_user_agent],
    ].filter(([, v]) => v);
    return `<div class="sig-block">
      <div class="role">${esc(ROLE_LABEL[s.role] || s.role)}</div>
      ${isImg(s.signature_data)
        ? `<img class="sig" src="${esc(s.signature_data)}" alt="signature" />`
        : (s.signature_data ? `<p class="sig-text">${esc(s.signature_data)}</p>` : '')}
      <p class="signer">${esc(s.name)}</p>
      ${s.consent_text ? `<div class="consent"><strong>Consent recorded at signing:</strong><br>${esc(s.consent_text)}</div>` : ''}
      <table class="audit">
        ${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}
      </table>
    </div>`;
  };

  const signedBlock = signers.length ? `
    <div class="signed">
      <h2>Signatures</h2>
      ${signers.map(renderSigner).join('')}
    </div>` : `<div class="unsigned">Status: ${esc(c.status)} — not yet signed.</div>`;

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(c.title)}</title>
<style>
  @page { margin: 18mm }
  body { font-family: Georgia, 'Times New Roman', serif; color:#1e293b; max-width:760px; margin:32px auto; padding:0 24px; line-height:1.55 }
  .bar { background:#e11d48; color:#fff; padding:10px 16px; border-radius:8px; display:flex; justify-content:space-between; align-items:center; gap:12px; font-family:system-ui,sans-serif; margin-bottom:24px }
  .bar button { background:#fff; color:#e11d48; border:0; padding:8px 16px; border-radius:6px; font-weight:700; cursor:pointer; white-space:nowrap }
  h1 { font-size:22px; margin:0 0 4px }
  h2 { font-size:16px; font-family:system-ui,sans-serif }
  .content { white-space:pre-wrap; font-size:14px }
  .signed { margin-top:32px; border-top:2px solid #e2e8f0; padding-top:16px }
  .sig-block { margin-bottom:28px; padding-bottom:20px; border-bottom:1px dashed #e2e8f0; page-break-inside:avoid }
  .sig-block:last-child { border-bottom:0 }
  .role { font-family:system-ui,sans-serif; font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:#e11d48; margin-bottom:8px }
  .pending-signer { font-family:system-ui,sans-serif; font-size:13px; color:#b45309; background:#fffbeb; border-left:3px solid #f59e0b; padding:10px 14px; margin-bottom:16px }
  .sig { max-height:90px; display:block }
  .sig-text { font-size:24px; font-family:'Brush Script MT', cursive; display:inline-block; padding:4px 12px }
  .signer { border-top:1px solid #94a3b8; display:inline-block; padding-top:4px; margin:0 0 16px; min-width:260px }
  .consent { background:#f8fafc; border-left:3px solid #e11d48; padding:10px 14px; font-family:system-ui,sans-serif; font-size:12px; line-height:1.6; margin-bottom:16px }
  .audit { border-collapse:collapse; font-family:system-ui,sans-serif; font-size:12px; color:#475569 }
  .audit td { padding:3px 14px 3px 0; vertical-align:top; word-break:break-word }
  .audit td:first-child { color:#94a3b8; white-space:nowrap }
  .unsigned { margin-top:32px; color:#b45309; font-style:italic }
  .hint { font-family:system-ui,sans-serif; font-size:12px; color:#64748b; background:#f8fafc; border-radius:6px; padding:8px 12px; margin:-16px 0 24px }

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
    <span>Rustic Retreat Weddings — Contract</span>
    <button onclick="window.print()">Print</button>
  </div>
  <p class="hint noprint">Pick your printer under <strong>Destination</strong> in the
  print dialog. <strong>Save as PDF</strong> is just one destination in that list — if
  it is the only one offered, no printer is set up on this computer.</p>
  <div class="content">${esc(c.content)}</div>
  ${signedBlock}
</body></html>`;
}

// ── Admin: printable contract (open in browser, Save as PDF) ─────────────────
// Build the executed document for a contract of either kind. Template contracts
// go through the packet renderer, which needs the answers and the initials as
// well as the signatures; free-text ones keep the original renderer untouched so
// every already-signed agreement still prints exactly as it did.
function renderAnyContract(c) {
  if (!c.template_key) return renderContractHtml(c);
  const packet = tpl.getPacket(c.template_key);
  if (!packet) return renderContractHtml(c);
  const { values } = tpl.getValues(c.id);
  return renderPacketHtml({
    packet,
    values,
    signers: signersFor(c.id),
    initials: tpl.initialsByBlock(c.id),
    initialsRows: tpl.getInitials(c.id),
    title: c.title,
  });
}

router.get('/:id/print', authenticateToken, (req, res) => {
  const c = db.prepare(`
    SELECT c.*, co.partner1_name, co.partner2_name, co.email AS couple_email
    FROM contracts c JOIN couples co ON co.id = c.couple_id
    WHERE c.id = ?
  `).get(req.params.id);
  if (!c) return res.status(404).send('Contract not found');
  res.set('Content-Type', 'text/html').send(renderAnyContract({ ...c, signers: signersFor(c.id) }));
});

// ── Admin: signer list for a contract ────────────────────────────────────────
router.get('/:id/signers', authenticateToken, (req, res) => {
  try {
    const rows = signersFor(req.params.id).map(s => ({
      ...s,
      // The token is a bearer credential for signing. Staff need to be able to
      // re-send or copy the current person's link, but there is no reason to
      // expose tokens belonging to signers who are already done.
      signing_token: s.status === 'signed' ? null : s.signing_token,
      signature_data: undefined,
    }));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: one signer's signature and audit trail ────────────────────────────
// The list links each name here, so staff can see who actually signed and what
// was recorded against them without opening the whole printed contract.
router.get('/:id/signers/:signerId', authenticateToken, (req, res) => {
  try {
    const s = db.prepare(
      'SELECT * FROM contract_signers WHERE id = ? AND contract_id = ?'
    ).get(req.params.signerId, req.params.id);
    if (!s) return res.status(404).json({ error: 'Signer not found' });
    if (s.status !== 'signed') {
      return res.status(404).json({ error: `${s.name} has not signed yet` });
    }
    // The token stays out of this: it is a bearer credential for signing, and
    // viewing a completed signature never needs it.
    const { signing_token, ...rest } = s;
    res.json(rest);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: venue signs, which starts the chain and locks the terms ───────────
router.post('/:id/sign-venue', authenticateToken, async (req, res) => {
  const { signature_data, signer_name, agreed } = req.body;
  if (!signature_data) return res.status(400).json({ error: 'Signature is required' });
  if (agreed !== true) {
    return res.status(400).json({ error: 'You must confirm the terms before signing' });
  }

  try {
    const contract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(req.params.id);
    if (!contract) return res.status(404).json({ error: 'Not found' });
    if (contract.locked_at) {
      return res.status(400).json({ error: 'This contract has already been signed by the venue' });
    }
    const couple = db.prepare('SELECT * FROM couples WHERE id = ?').get(contract.couple_id);
    if (!couple) return res.status(404).json({ error: 'Couple not found' });

    // Both partners sign from their own address so the two signatures are
    // independently attributable — that is the point of collecting them
    // separately. Refuse before locking rather than after: once locked the
    // contract cannot be edited, so discovering the gap later means reissuing it.
    if (!couple.partner2_email) {
      return res.status(400).json({
        error: `${couple.partner2_name} has no email address on file. ` +
               'Add one to the couple before signing — each partner signs from their own address.',
        missing_partner2_email: true,
      });
    }
    if (couple.partner2_email.trim().toLowerCase() === couple.email.trim().toLowerCase()) {
      return res.status(400).json({
        error: 'Both partners have the same email address. Each partner needs their own so ' +
               'their signatures are separately attributable.',
        duplicate_partner_email: true,
      });
    }

    // Signing locks the venue's own fields. Anything still blank would be blank
    // forever on a document the couple is about to be legally bound by, and the
    // lock is one-way — so this is checked before it happens, not after.
    if (contract.template_key) {
      const packet = tpl.getPacket(contract.template_key);
      if (!packet) return res.status(500).json({ error: 'Template no longer available' });
      const { values } = tpl.getValues(contract.id);
      const missing = tpl.missingRequired(packet, values, 'venue');
      if (missing.length) {
        return res.status(400).json({
          error: `Fill in the venue's details before signing — ${missing.length} still blank: ` +
                 missing.map(m => m.label).join(', ') + '.',
          missing_venue_fields: missing,
        });
      }
    }

    const venueName = signer_name || req.user?.name || VENUE_SIGNER_NAME;
    const ip = req.ip || req.socket.remoteAddress || '';
    const ua = String(req.headers['user-agent'] || '').slice(0, 500);

    const start = db.transaction(() => {
      // Rebuild the chain from scratch. A contract can be drafted, sent, and
      // revised before anyone signs, and stale rows from an earlier attempt
      // would otherwise leave a dead link in the sequence.
      db.prepare('DELETE FROM contract_signers WHERE contract_id = ?').run(contract.id);

      const add = db.prepare(`
        INSERT INTO contract_signers (contract_id, sign_order, role, name, email, status)
        VALUES (?, ?, ?, ?, ?, 'pending')
      `);
      add.run(contract.id, 1, 'venue', venueName, process.env.ADMIN_EMAIL || null);
      add.run(contract.id, 2, 'partner1', couple.partner1_name, couple.email);
      add.run(contract.id, 3, 'partner2', couple.partner2_name, couple.partner2_email || null);

      // Record the venue's signature against row 1.
      db.prepare(`
        UPDATE contract_signers
        SET status = 'signed', signed_at = datetime('now'), signature_data = ?,
            signer_ip = ?, signer_user_agent = ?, consent_text = ?
        WHERE contract_id = ? AND sign_order = 1
      `).run(signature_data, ip, ua,
             consentStatement(venueName, contract.title, docTitlesFor(contract)), contract.id);

      // locked_at is what the edit endpoint checks. Once the venue has committed
      // to these terms the couple must be signing the same document we did.
      db.prepare(`
        UPDATE contracts
        SET locked_at = datetime('now'), status = 'sent', sent_at = datetime('now'),
            signing_expires_at = datetime('now', ?)
        WHERE id = ?
      `).run(`+${SIGNING_LINK_DAYS} days`, contract.id);
    });
    start();

    const fresh = db.prepare('SELECT * FROM contracts WHERE id = ?').get(contract.id);
    const next = await activateNextSigner(fresh, couple);

    res.json({
      success: true,
      locked: true,
      next_signer: next
        ? { name: next.name, role: next.role, email: next.email,
            signing_url: `/sign/${next.signing_token}`,
            delivered: next.delivered, delivery_error: next.delivery_error }
        : null,
      signers: signersFor(contract.id).map(s => ({
        sign_order: s.sign_order, role: s.role, name: s.name, status: s.status,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: re-send the current signer's link ─────────────────────────────────
router.post('/:id/send', authenticateToken, async (req, res) => {
  try {
    const contract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(req.params.id);
    if (!contract) return res.status(404).json({ error: 'Not found' });
    if (contract.status === 'signed') {
      return res.status(400).json({ error: 'Contract already signed' });
    }
    if (!contract.locked_at) {
      return res.status(400).json({
        error: 'Sign the contract as the venue first — that locks the terms before the couple signs it.',
      });
    }
    const couple = db.prepare('SELECT * FROM couples WHERE id = ?').get(contract.couple_id);
    // Reissues the current signer's token, so any earlier link stops working.
    const next = await activateNextSigner(contract, couple);
    if (!next) return res.status(400).json({ error: 'Everyone has already signed' });

    res.json({
      token: next.signing_token,
      signing_url: `/sign/${next.signing_token}`,
      signer_name: next.name,
      signer_role: next.role,
      sent_to: next.email,
      delivered: next.delivered,
      delivery_error: next.delivery_error,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Public: get contract for signing (no auth) ───────────────────────────────
router.get('/sign/:token', signLimiter, (req, res) => {
  try {
    // Resolve through the signers table first; fall back to the contract's own
    // token so links emailed before multi-party signing existed still open.
    const signer = db.prepare(
      'SELECT * FROM contract_signers WHERE signing_token = ?'
    ).get(req.params.token);

    const contract = db.prepare(`
      SELECT c.id, c.title, c.content, c.status, c.signer_name, c.signed_at,
             c.signing_expires_at, c.viewed_at, c.locked_at,
             c.template_key, c.template_version, c.client_fields_locked_at,
             CASE WHEN c.signing_expires_at IS NOT NULL
                       AND datetime('now') > c.signing_expires_at
                  THEN 1 ELSE 0 END AS is_expired,
             co.partner1_name, co.partner2_name, co.email AS couple_email
      FROM contracts c JOIN couples co ON co.id = c.couple_id
      WHERE c.id = ? OR c.signing_token = ?
    `).get(signer ? signer.contract_id : null, req.params.token);

    if (!contract) return res.status(404).json({ error: 'Invalid or expired signing link' });

    const signers = signersFor(contract.id);
    const progress = signers.map(s => ({
      role: s.role, name: s.name, status: s.status, signed_at: s.signed_at,
    }));

    // A signed contract stays retrievable through its link on purpose: it is how
    // the couple gets back to their own executed copy. Expiry gates signing, not
    // access to something they already signed.
    if (contract.status === 'signed' || (signer && signer.status === 'signed')) {
      return res.json({ ...contract, already_signed: true, signers: progress,
                        signer_name: signer ? signer.name : contract.signer_name });
    }

    if (contract.is_expired) {
      return res.status(410).json({
        error: 'This signing link has expired. Contact Rustic Retreat and we will send you a fresh one.',
        expired: true,
      });
    }

    // Guard the order. A token is only issued when it is that person's turn, so
    // this should not normally trigger — but if partner 2 somehow opens their
    // link first, they must not be able to sign ahead of partner 1.
    if (signer) {
      const due = nextSigner(contract.id);
      if (!due || due.id !== signer.id) {
        return res.status(409).json({
          error: `Waiting on ${due ? due.name : 'another signer'} to sign first. ` +
                 'You will get an email the moment it is your turn.',
          out_of_turn: true,
          signers: progress,
        });
      }
    }

    // First open only — this timestamps when the signer was actually presented
    // with the terms, which is the fact worth keeping, not the last time they
    // refreshed the tab.
    if (signer && !signer.viewed_at) {
      db.prepare("UPDATE contract_signers SET viewed_at = datetime('now') WHERE id = ? AND viewed_at IS NULL")
        .run(signer.id);
    } else if (!signer && !contract.viewed_at) {
      db.prepare("UPDATE contracts SET viewed_at = datetime('now') WHERE id = ? AND viewed_at IS NULL")
        .run(contract.id);
    }

    // Template contracts carry their own text, their answers so far, and the
    // work this particular signer still owes.
    let templatePayload = null;
    if (contract.template_key) {
      const packet = tpl.getPacket(contract.template_key);
      if (packet) {
        const { values } = tpl.getValues(contract.id);
        // Client 1 fills the couple's details in; Client 2 reads what Client 1
        // entered and cannot change it. Two people editing the same answers
        // after the terms are locked is how a contract ends up saying something
        // neither of them signed.
        const canEditFields = signer && signer.role === 'partner1' && !contract.client_fields_locked_at;
        templatePayload = {
          packet: {
            key: packet.key, title: packet.title,
            documents: packet.documents.map(d => ({
              key: d.key, title: d.title, subtitle: d.subtitle, preamble: d.preamble,
              venueBlock: d.venueBlock, sections: d.sections, appendix: d.appendix,
              signatures: d.signatures, gstRate: d.gstRate,
            })),
          },
          values,
          payment_schedule: tpl.paymentSchedule(packet, values),
      fee_breakdown: tpl.feeBreakdown(packet, values),
          can_edit_fields: !!canEditFields,
          client_fields_locked: !!contract.client_fields_locked_at,
          initials_blocks: tpl.initialsBlocks(packet),
          my_initials: signer
            ? db.prepare('SELECT block_key, initials_text FROM contract_initials WHERE contract_id = ? AND signer_id = ?')
                .all(contract.id, signer.id)
                .reduce((acc, r) => { acc[r.block_key] = r.initials_text; return acc; }, {})
            : {},
          // Everyone's initials, so Client 2 sees Client 1's marks already in
          // place rather than a document that looks untouched. The paper form
          // shows both boxes side by side and so should this.
          all_initials: tpl.initialsByBlock(contract.id),
          missing_client: canEditFields ? tpl.missingRequired(packet, values, 'client') : [],
        };
      }
    }

    res.json({
      ...contract,
      signers: progress,
      signer_role: signer ? signer.role : null,
      // Pre-fill the name field with who we believe is signing, so a couple
      // cannot accidentally sign in each other's slot.
      expected_signer_name: signer ? signer.name : null,
      consent_statement: consentStatement('[your name]', contract.title, docTitlesFor(contract)),
      template: templatePayload,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Public: submit signature ─────────────────────────────────────────────────
router.post('/sign/:token', signLimiter, async (req, res) => {
  const { signer_name, signature_data, agreed, fields, initials } = req.body;
  if (!signer_name || !signature_data) {
    return res.status(400).json({ error: 'Signer name and signature are required' });
  }
  // The signing page has always shown an "I agree" checkbox, but the server used
  // to accept a signature without it — so the one affirmative act that makes an
  // electronic signature defensible was enforced only in the browser, where a
  // direct POST bypasses it entirely.
  if (agreed !== true) {
    return res.status(400).json({ error: 'You must confirm you agree to the terms before signing' });
  }

  try {
    const signer = db.prepare(
      'SELECT * FROM contract_signers WHERE signing_token = ?'
    ).get(req.params.token);

    const contract = db.prepare(`
      SELECT c.*, co.partner1_name, co.partner2_name, co.email, co.partner2_email, co.password_hash
      FROM contracts c JOIN couples co ON co.id = c.couple_id
      WHERE c.id = ? OR c.signing_token = ?
    `).get(signer ? signer.contract_id : null, req.params.token);

    if (!contract) return res.status(404).json({ error: 'Invalid signing link' });
    if (contract.status === 'signed') {
      return res.status(400).json({ error: 'Contract already signed' });
    }
    if (signer && signer.status === 'signed') {
      return res.status(400).json({ error: 'You have already signed this contract' });
    }
    if (contract.signing_expires_at &&
        new Date() > new Date(contract.signing_expires_at.replace(' ', 'T') + 'Z')) {
      return res.status(410).json({
        error: 'This signing link has expired. Contact Rustic Retreat and we will send you a fresh one.',
        expired: true,
      });
    }

    // Enforce the order on write as well as on read. The read check stops the
    // page rendering out of turn; this stops a replayed POST doing the same.
    const due = signer ? nextSigner(contract.id) : null;
    if (signer && (!due || due.id !== signer.id)) {
      return res.status(409).json({
        error: `Waiting on ${due ? due.name : 'another signer'} to sign first.`,
        out_of_turn: true,
      });
    }

    // req.ip, not the raw header: Express resolves it against the one trusted
    // proxy hop configured in index.js, so a client cannot fabricate the address
    // recorded against their own signature by sending X-Forwarded-For.
    const signer_ip = req.ip || req.socket.remoteAddress || '';
    const user_agent = String(req.headers['user-agent'] || '').slice(0, 500);
    const consent_text = consentStatement(signer_name, contract.title, docTitlesFor(contract));

    // ── Template contracts: the answers and the initials are part of signing ──
    // All of it is validated before anything is written. A signature recorded
    // against a contract with half its initials missing is worse than a refused
    // submission: it looks executed and is not.
    let packet = null;
    if (contract.template_key && signer) {
      packet = tpl.getPacket(contract.template_key);
      if (!packet) return res.status(500).json({ error: 'Template no longer available' });

      const canEditFields = signer.role === 'partner1' && !contract.client_fields_locked_at;
      if (canEditFields) {
        tpl.saveValues(contract.id, fields, 'client', packet);
      }

      const { values } = tpl.getValues(contract.id);
      const missingFields = tpl.missingRequired(packet, values, 'client');
      if (canEditFields && missingFields.length) {
        return res.status(400).json({
          error: `Please complete every required box before signing — ${missingFields.length} still blank.`,
          missing_fields: missingFields,
        });
      }

      // Both clients initial every clause themselves. The venue does not: the
      // paper contract asks only the clients to initial, and inventing a venue
      // initial would put a mark on the record nobody agreed to make.
      if (signer.role === 'partner1' || signer.role === 'partner2') {
        tpl.saveInitials(contract.id, signer.id, initials, signer_ip, user_agent, packet);
        const missingInitials = tpl.missingInitials(contract.id, signer.id, packet);
        if (missingInitials.length) {
          return res.status(400).json({
            error: `Please initial all ${tpl.initialsBlocks(packet).length} marked clauses — ` +
                   `${missingInitials.length} still outstanding.`,
            missing_initials: missingInitials,
          });
        }
      }

      // Client 1 has answered; from here the couple's details are fixed too, so
      // Client 2 initials and signs the same document rather than a moving one.
      if (canEditFields) {
        db.prepare("UPDATE contracts SET client_fields_locked_at = datetime('now') WHERE id = ? AND client_fields_locked_at IS NULL")
          .run(contract.id);
      }
    }

    // Record this person's signature. Everyone signed is what completes the
    // contract — one signature no longer finishes it.
    let allSigned = true;
    if (signer) {
      db.prepare(`
        UPDATE contract_signers
        SET status = 'signed', signed_at = datetime('now'), name = ?,
            signature_data = ?, signer_ip = ?, signer_user_agent = ?, consent_text = ?
        WHERE id = ?
      `).run(signer_name, signature_data, signer_ip, user_agent, consent_text, signer.id);
      allSigned = !nextSigner(contract.id);
    }

    if (allSigned) {
      db.prepare(`
        UPDATE contracts
        SET status = 'signed', signed_at = datetime('now'),
            signer_name = ?, signer_email = ?, signature_data = ?, signer_ip = ?,
            signer_user_agent = ?, consent_text = ?,
            portal_credentials_sent = 1
        WHERE id = ?
      `).run(signer_name, contract.email, signature_data, signer_ip,
             user_agent, consent_text, contract.id);
    }

    // Everything below turns the contract into a booking: the couple becomes
    // 'booked', the calendar date is claimed, and portal credentials are issued.
    // None of that should happen off a half-signed agreement, so when signatures
    // are still outstanding we stop here and hand the next person their link.
    if (!allSigned) {
      const couple = db.prepare('SELECT * FROM couples WHERE id = ?').get(contract.couple_id);
      const next = await activateNextSigner(contract, couple);
      return res.json({
        success: true,
        fully_signed: false,
        message: next
          ? (next.delivered
              ? `Thank you. ${next.name} has been emailed their signing link.`
              : `Thank you. Your signature is recorded — we could not email ${next.name} automatically, so Rustic Retreat will send their link directly.`)
          : 'Thank you — your signature has been recorded.',
        next_signer_notified: next ? next.delivered : null,
        couple_name: `${contract.partner1_name} & ${contract.partner2_name}`,
        next_signer_name: next ? next.name : null,
        signers: signersFor(contract.id).map(s => ({
          role: s.role, name: s.name, status: s.status, signed_at: s.signed_at,
        })),
      });
    }

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

    // Create / reveal portal credentials — only while the portal is in use.
    let plain_password = null;
    let is_new_account = false;

    if (PORTAL_ENABLED && !contract.password_hash) {
      // First-time: generate credentials
      plain_password = generatePassword();
      const hashed = bcrypt.hashSync(plain_password, 10);
      db.prepare('UPDATE couples SET password_hash = ? WHERE id = ?')
        .run(hashed, contract.couple_id);
      is_new_account = true;
    }

    const coupleNames = `${contract.partner1_name} & ${contract.partner2_name}`;
    const signedAt = new Date().toLocaleString();

    // Confirmation email to both partners — each signed, so each gets told it is
    // done, along with a link to their own executed copy.
    for (const addr of [contract.email, contract.partner2_email].filter(Boolean)) {
      email.sendContractSignedCouple({
        to: addr,
        coupleNames,
        contractTitle: contract.title,
        portalEnabled: PORTAL_ENABLED,
      });
    }

    // Notification email to admin
    email.sendContractSignedAdmin({
      coupleNames,
      contractTitle: contract.title,
      signerName: signer_name,
      signedAt,
    });

    res.json({
      success: true,
      fully_signed: true,
      message: 'Contract signed successfully!',
      couple_name: coupleNames,
      portal_enabled: PORTAL_ENABLED,
      portal_email: PORTAL_ENABLED ? contract.email : null,
      portal_password: is_new_account ? plain_password : null,
      is_new_account,
      signers: signersFor(contract.id).map(s => ({
        role: s.role, name: s.name, status: s.status, signed_at: s.signed_at,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Public: signer's own executed copy ───────────────────────────────────────
// Signing a contract and having no way to keep it is not a real e-sign flow.
// The signing link doubles as the couple's permanent receipt: same token, but
// it only ever renders a contract that has actually been signed.
router.get('/sign/:token/print', signLimiter, (req, res) => {
  // Tokens live on contract_signers now; the contracts.signing_token fallback
  // keeps links issued before multi-party signing working.
  const signer = db.prepare(
    'SELECT contract_id FROM contract_signers WHERE signing_token = ?'
  ).get(req.params.token);

  const c = db.prepare(`
    SELECT c.*, co.partner1_name, co.partner2_name, co.email AS couple_email
    FROM contracts c JOIN couples co ON co.id = c.couple_id
    WHERE c.id = ? OR c.signing_token = ?
  `).get(signer ? signer.contract_id : null, req.params.token);

  if (!c) return res.status(404).send('Contract not found');
  if (c.status !== 'signed') {
    return res.status(404).send('This contract has not been signed yet.');
  }
  res.set('Content-Type', 'text/html').send(renderAnyContract({ ...c, signers: signersFor(c.id) }));
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

   Payments accepted by Interac e-Transfer to ${ETRANSFER_EMAIL}${PORTAL_ENABLED ? ' or online through the client portal' : ''}.

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
