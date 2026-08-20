// Template-backed contracts.
//
// A *packet* is the set of documents that get signed in one ceremony. The venue's
// rental agreement says in Section 12.1 that the booking is not complete until
// Schedule A is signed too, so the two are never sent separately — one link, one
// signature, both documents. Splitting them would recreate by hand exactly the
// half-executed booking that clause exists to prevent.
//
// Templates are code, not database rows. The owner is not building templates in a
// UI; they have one contract that changes once a year, and keeping it in git means
// every change is reviewable and every past version recoverable.

const db = require('../db');

const TEMPLATES = {
  'rental-agreement-2027': require('../contract-templates/rental-agreement-2027'),
  'schedule-a-2027':       require('../contract-templates/schedule-a-2027'),
};

const PACKETS = {
  'rental-2027': {
    key: 'rental-2027',
    title: 'Event Venue Rental Agreement & Schedule A — 2027',
    documents: ['rental-agreement-2027', 'schedule-a-2027'],
  },
};

const DEFAULT_PACKET = 'rental-2027';

function getPacket(key) {
  const p = PACKETS[key || DEFAULT_PACKET];
  if (!p) return null;
  return { ...p, documents: p.documents.map(k => TEMPLATES[k]) };
}

function listPackets() {
  return Object.values(PACKETS).map(p => ({
    key: p.key,
    title: p.title,
    documents: p.documents.map(k => ({ key: k, title: TEMPLATES[k].title })),
  }));
}

// ── Walking a template ───────────────────────────────────────────────────────

// Every input in a packet, flattened. `choice` blocks are inputs too — a radio
// group is a field whose value happens to come from a fixed list — so they are
// returned in the same shape rather than as a separate concept the callers would
// each have to remember to handle.
function collectFields(packet, fill) {
  const out = [];
  for (const doc of packet.documents) {
    for (const section of doc.sections) {
      for (const block of section.blocks) {
        if (block.t === 'fields') {
          for (const f of block.items) {
            if (f.type === 'spacer') continue;
            if (!fill || f.fill === fill) out.push({ ...f, doc: doc.key, section: section.id });
          }
        } else if (block.t === 'choice') {
          if (!fill || block.fill === fill) {
            out.push({
              key: block.key, label: block.label, type: 'choice', fill: block.fill,
              required: block.required, options: block.options,
              doc: doc.key, section: section.id,
            });
          }
        }
      }
    }
  }
  return out;
}

// The starting values a fresh contract should carry — currently the $1,000
// damage deposit, which is fixed by Section 4.2 and was previously retyped on
// every contract. Declared on the field as `default` so the amount is stated in
// the template beside the field it belongs to, not in the creation route.
function defaultValues(packet, fill) {
  const out = {};
  for (const f of collectFields(packet, fill)) {
    if (f.default != null && f.default !== '') out[f.key] = String(f.default);
  }
  return out;
}

function initialsBlocks(packet) {
  const out = [];
  for (const doc of packet.documents) {
    for (const section of doc.sections) {
      for (const block of section.blocks) {
        if (block.t === 'initials') {
          out.push({ key: block.key, label: block.label, doc: doc.key, section: section.id });
        }
      }
    }
  }
  return out;
}

// ── Values ───────────────────────────────────────────────────────────────────

function getValues(contractId) {
  const rows = db.prepare(
    'SELECT field_key, value, filled_by, filled_at FROM contract_field_values WHERE contract_id = ?'
  ).all(contractId);
  const values = {};
  const meta = {};
  for (const r of rows) {
    values[r.field_key] = r.value;
    meta[r.field_key] = { filled_by: r.filled_by, filled_at: r.filled_at };
  }
  return { values, meta };
}

// Writes only the keys that belong to `filledBy` on this packet. Anything else in
// the payload is dropped rather than rejected: a client posting a venue-side key
// is not worth failing the whole submission over, but it must never be written —
// the couple must not be able to edit the price after the venue has signed it.
function saveValues(contractId, incoming, filledBy, packet) {
  const allowed = new Map(collectFields(packet, filledBy).map(f => [f.key, f]));
  const stmt = db.prepare(`
    INSERT INTO contract_field_values (contract_id, field_key, value, filled_by, filled_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT (contract_id, field_key)
      DO UPDATE SET value = excluded.value,
                    filled_by = excluded.filled_by,
                    filled_at = CURRENT_TIMESTAMP
  `);
  let written = 0, ignored = [];
  const tx = db.transaction(() => {
    for (const [key, raw] of Object.entries(incoming || {})) {
      if (!allowed.has(key)) { ignored.push(key); continue; }
      const value = raw == null ? '' : String(raw).trim();
      stmt.run(contractId, key, value, filledBy);
      written++;
    }
  });
  tx();
  return { written, ignored };
}

function missingRequired(packet, values, fill) {
  return collectFields(packet, fill)
    .filter(f => f.required && !String(values[f.key] ?? '').trim())
    .map(f => ({ key: f.key, label: f.label || f.key, doc: f.doc, section: f.section }));
}

// ── Initials ─────────────────────────────────────────────────────────────────

function getInitials(contractId) {
  return db.prepare(`
    SELECT ci.*, cs.role, cs.name AS signer_name
      FROM contract_initials ci
      JOIN contract_signers cs ON cs.id = ci.signer_id
     WHERE ci.contract_id = ?
     ORDER BY cs.sign_order, ci.id
  `).all(contractId);
}

// Keyed by block then role, which is the shape both renderers want: each initials
// block prints one box per client, in signing order.
function initialsByBlock(contractId) {
  const map = {};
  for (const row of getInitials(contractId)) {
    (map[row.block_key] ||= {})[row.role] = row;
  }
  return map;
}

function saveInitials(contractId, signerId, entries, ip, userAgent, packet) {
  const valid = new Set(initialsBlocks(packet).map(b => b.key));
  const stmt = db.prepare(`
    INSERT INTO contract_initials
      (contract_id, signer_id, block_key, initials_text, initialled_at, signer_ip, signer_user_agent)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)
    ON CONFLICT (contract_id, signer_id, block_key)
      DO UPDATE SET initials_text = excluded.initials_text,
                    initialled_at = CURRENT_TIMESTAMP,
                    signer_ip = excluded.signer_ip,
                    signer_user_agent = excluded.signer_user_agent
  `);
  let written = 0;
  const tx = db.transaction(() => {
    for (const [blockKey, text] of Object.entries(entries || {})) {
      if (!valid.has(blockKey)) continue;
      const t = String(text ?? '').trim();
      if (!t) continue;
      stmt.run(contractId, signerId, blockKey, t, ip || null, userAgent || null);
      written++;
    }
  });
  tx();
  return written;
}

function missingInitials(contractId, signerId, packet) {
  const done = new Set(
    db.prepare('SELECT block_key FROM contract_initials WHERE contract_id = ? AND signer_id = ?')
      .all(contractId, signerId).map(r => r.block_key)
  );
  return initialsBlocks(packet).filter(b => !done.has(b.key));
}

// ── Derived values ───────────────────────────────────────────────────────────

// The payment schedule is computed, never stored: the percentages live in the
// template and the amounts fall out of total_package_fee. Storing the amounts too
// would let them drift out of step with the fee if it were ever corrected.
function paymentSchedule(packet, values) {
  const doc = packet.documents.find(d => d.paymentSchedule);
  if (!doc) return [];
  const total = parseFloat(String(values.total_package_fee || '').replace(/[^0-9.]/g, '')) || 0;
  return doc.paymentSchedule.map(row => {
    let amount = null;
    if (row.pct != null) amount = total * (row.pct / 100);
    else if (row.flat) amount = parseFloat(String(values[row.flat] || '').replace(/[^0-9.]/g, '')) || 0;
    return {
      label: row.label,
      due: row.due,
      tbd: !!row.tbd,
      pct: row.pct ?? null,
      amount: row.tbd ? null : amount,
    };
  });
}

function packageLabel(packet, values) {
  for (const doc of packet.documents) {
    for (const section of doc.sections) {
      for (const block of section.blocks) {
        if (block.t === 'choice' && block.key === 'package') {
          const opt = block.options.find(o => o.value === values.package);
          return opt ? opt.cells.join(' · ') : null;
        }
      }
    }
  }
  return null;
}

module.exports = {
  TEMPLATES, PACKETS, DEFAULT_PACKET,
  getPacket, listPackets,
  collectFields, initialsBlocks, defaultValues,
  getValues, saveValues, missingRequired,
  getInitials, initialsByBlock, saveInitials, missingInitials,
  paymentSchedule, packageLabel,
};
