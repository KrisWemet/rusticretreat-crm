// Renders a template-backed contract packet to standalone HTML — the version the
// venue prints and files, and the version attached to the couple's copy.
//
// This is a *static* renderer. The couple's signing page renders the same block
// vocabulary in React because it needs live inputs; the two must be kept in step
// when a block type is added. That duplication is deliberate — the printed record
// should not depend on a bundle running — but it is the one place in this feature
// where a change has to be made twice.

const { paymentSchedule } = require('./contractTemplate');

const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const fmtMoney = v => {
  const n = parseFloat(String(v ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n)
    ? n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' })
    : '';
};

// Dates are stored as the ISO value the date input produced. The contract asks
// for DD/MM/YYYY, so that is what the printed document shows — rendered from the
// parts rather than through a Date object, which would shift the day for anyone
// whose timezone is behind UTC.
const fmtDate = v => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : esc(v || '');
};

const fmtTime = v => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(v ?? ''));
  if (!m) return esc(v || '');
  let h = Number(m[1]);
  const ampm = h >= 12 ? 'p.m.' : 'a.m.';
  h = h % 12 || 12;
  return `${h}:${m[2]} ${ampm}`;
};

function fmtValue(field, raw) {
  if (raw == null || raw === '') return '';
  switch (field.type) {
    case 'money': return fmtMoney(raw);
    case 'date':  return fmtDate(raw);
    case 'time':  return fmtTime(raw);
    default:      return esc(raw);
  }
}

// A blank required answer prints as a ruled gap, not as nothing — an empty line
// on a signed contract is visible and asks a question; a silently missing row
// does not.
const blank = '<span class="blank"></span>';

function renderFieldsBlock(block, values) {
  const cells = block.items.map(f => {
    if (f.type === 'spacer') return '<div class="fld"></div>';
    const shown = fmtValue(f, values[f.key]);
    return `<div class="fld">
      ${f.label ? `<label>${esc(f.label)}</label>` : ''}
      <div class="val${shown ? '' : ' empty'}">${shown || blank}</div>
    </div>`;
  }).join('');
  return `${block.label ? `<div class="fld-group-label">${esc(block.label)}</div>` : ''}
    <div class="fld-grid cols-${block.cols || 1}">${cells}</div>`;
}

function renderChoiceBlock(block, values) {
  const chosen = values[block.key];
  const rows = block.options.map(o => {
    const on = o.value === chosen;
    const cells = o.cells.map(c => `<td>${esc(c)}</td>`).join('');
    return `<tr class="${on ? 'chosen' : 'unchosen'}">
      <td class="box">${on ? '☑' : '☐'}</td>${cells}
    </tr>`;
  }).join('');
  const head = block.columns
    ? `<thead><tr><th></th>${block.columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>`
    : '';
  return `${block.label ? `<div class="fld-group-label">${esc(block.label)}</div>` : ''}
    <table class="choice">${head}<tbody>${rows}</tbody></table>`;
}

// Both clients initial every block, so the printed record shows both boxes side
// by side whether or not they are filled. An empty box on an executed contract is
// the useful signal that something went wrong.
function renderInitialsBlock(block, initialsByBlock, signers) {
  const clients = signers.filter(s => s.role === 'partner1' || s.role === 'partner2');
  const marks = initialsByBlock[block.key] || {};
  const boxes = clients.map((s, i) => {
    const row = marks[s.role];
    return `<div class="ini-slot">
      <span class="ini-label">Initials, Client ${i + 1}:</span>
      <span class="ini-box">${row ? esc(row.initials_text) : ''}</span>
    </div>`;
  }).join('');
  return `<div class="initials" data-block="${esc(block.key)}">
    ${boxes}
    ${block.label ? `<div class="ini-caption">${esc(block.label)}</div>` : ''}
  </div>`;
}

function renderPaymentSchedule(packet, values) {
  const rows = paymentSchedule(packet, values).map(r => `
    <tr>
      <td>${esc(r.label)}</td>
      <td class="num">${r.tbd ? 'TBD' : (r.pct != null ? r.pct + '%' : '')}</td>
      <td class="num">${r.amount == null ? 'TBD' : fmtMoney(r.amount)}</td>
      <td>${esc(r.due)}</td>
    </tr>`).join('');
  return `<table class="grid">
    <thead><tr><th>Payment</th><th class="num">Share</th><th class="num">Amount</th><th>Payment Schedule</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderBlock(block, ctx) {
  const { values, initials, signers, packet } = ctx;
  switch (block.t) {
    case 'h1':   return `<h2 class="s-h1">${esc(block.text)}</h2>`;
    case 'h2':   return `<h3 class="s-h2">${esc(block.text)}</h3>`;
    case 'h3':   return `<h4 class="s-h3">${esc(block.text)}</h4>`;
    case 'p':    return `<p class="${block.small ? 'small' : ''}">${esc(block.text)}</p>`;
    case 'list': return `<ul>${block.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`;
    case 'note':
      return `<div class="callout">
        ${block.title ? `<div class="callout-title">${esc(block.title)}</div>` : ''}
        ${block.text ? `<p>${esc(block.text)}</p>` : ''}
        ${block.items ? `<ul>${block.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}
      </div>`;
    case 'table':
      return `<table class="grid">
        ${block.head ? `<thead><tr>${block.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>` : ''}
        <tbody>${block.rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>`;
    case 'fields':         return renderFieldsBlock(block, values);
    case 'choice':         return renderChoiceBlock(block, values);
    case 'initials':       return renderInitialsBlock(block, initials, signers);
    case 'paymentSchedule': return renderPaymentSchedule(packet, values);
    default: return '';
  }
}

function renderSignatureRow(doc, signers) {
  const clients = signers.filter(s => s.role === 'partner1' || s.role === 'partner2');
  const venue = signers.find(s => s.role === 'venue');

  const sigCell = (s, printLabel) => {
    if (!s) return '';
    const drawn = s.signature_data
      ? `<img class="sig" src="${esc(s.signature_data)}" alt="">`
      : '<span class="blank wide"></span>';
    return `<div class="sig-cell">
      ${printLabel ? `<label>${esc(printLabel)}</label><div class="val">${esc(s.name)}</div>` : ''}
      <label>SIGNATURE</label>
      <div class="sig-line">${drawn}</div>
      <label>DATE</label>
      <div class="val">${s.signed_at ? esc(new Date(s.signed_at + 'Z').toLocaleDateString('en-CA')) : blank}</div>
    </div>`;
  };

  return `<div class="signatures">
    <h3 class="s-h2">${esc(doc.signatures?.heading || 'FINAL AGREEMENT SIGNATURES')}</h3>
    <p>${esc(doc.signatures?.intro || '')}</p>
    <div class="sig-grid">
      ${clients.map((s, i) => sigCell(s, `CLIENT ${i + 1}: PRINT NAME`)).join('')}
    </div>
    <h4 class="s-h3">Venue Representative</h4>
    <p class="small">${esc(doc.venueBlock?.signatory || '')}, ${esc(doc.venueBlock?.name || '')}</p>
    <div class="sig-grid">${sigCell(venue, null)}</div>
  </div>`;
}

function renderDocument(doc, ctx) {
  const body = doc.sections.map(section =>
    `<section class="sec" id="${esc(doc.key)}-${esc(section.id)}">
      ${section.blocks.map(b => renderBlock(b, ctx)).join('\n')}
    </section>`
  ).join('\n');

  const appendix = doc.appendix ? `
    <div class="appendix">
      <h3 class="s-h2">${esc(doc.appendix.title)}</h3>
      <table class="grid">
        <tbody>${doc.appendix.rows.map(r =>
          `<tr><td class="k">${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join('')}</tbody>
      </table>
    </div>` : '';

  return `<article class="doc">
    <header class="doc-head">
      <div class="brand">RUSTIC RETREAT <span>Weddings &amp; Events Ltd.</span></div>
      <h1>${esc(doc.title)}</h1>
      ${doc.subtitle ? `<div class="subtitle">${esc(doc.subtitle)}</div>` : ''}
      <div class="addr">
        ${esc(doc.venueBlock?.physicalAddress || '')}<br>
        ${esc(doc.venueBlock?.email || '')} · ${esc(doc.venueBlock?.phone || '')}
      </div>
    </header>
    ${doc.preamble ? `<p class="preamble">${esc(doc.preamble)}</p>` : ''}
    ${body}
    ${renderSignatureRow(doc, ctx.signers)}
    ${appendix}
  </article>`;
}

// The per-signer audit trail. Alberta's Electronic Transactions Act does not
// prescribe a format; what matters if a signature is ever challenged is what the
// signer was shown, that they accepted it, and from where.
function renderAudit(signers, initialsRows) {
  if (!signers.length) return '';
  const roleName = { venue: 'For the Venue', partner1: 'Client 1', partner2: 'Client 2' };
  const blocks = signers.map(s => {
    const mine = initialsRows.filter(r => r.signer_id === s.id);
    const rows = [
      ['Date signed', s.signed_at ? new Date(s.signed_at + 'Z').toLocaleString('en-CA') : 'Not yet signed'],
      ['Email', s.email || '—'],
      ['IP address', s.signer_ip || '—'],
      ['Device', s.signer_user_agent || '—'],
      ['Initials recorded', mine.length ? `${mine.length} of ${mine.length} clauses` : '—'],
    ].map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('');
    return `<div class="audit-block">
      <div class="role">${esc(roleName[s.role] || s.role)} — ${esc(s.name)}</div>
      ${s.consent_text ? `<div class="consent"><strong>Consent recorded at signing:</strong><br>${esc(s.consent_text)}</div>` : ''}
      <table class="audit"><tbody>${rows}</tbody></table>
    </div>`;
  }).join('');
  return `<section class="audit-section">
    <h2 class="s-h1">SIGNING RECORD</h2>
    <p class="small">Generated by the Rustic Retreat CRM. This page is part of the executed record and is not part of the agreed terms.</p>
    ${blocks}
  </section>`;
}

function renderPacketHtml({ packet, values, signers, initials, initialsRows, title }) {
  const ctx = { packet, values, signers, initials };
  const docs = packet.documents.map(d => renderDocument(d, ctx)).join('\n');

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title || packet.title)}</title>
<style>
  @page { margin: 16mm }
  * { box-sizing: border-box }
  body { font-family: Georgia, 'Times New Roman', serif; color:#1e293b; max-width:780px;
         margin:32px auto; padding:0 24px; line-height:1.55; font-size:14px; background:#fff }
  .bar { background:#e11d48; color:#fff; padding:10px 16px; border-radius:8px; display:flex;
         justify-content:space-between; align-items:center; gap:12px;
         font-family:system-ui,sans-serif; margin-bottom:12px }
  .bar button { background:#fff; color:#e11d48; border:0; padding:8px 16px; border-radius:6px;
                font-weight:700; cursor:pointer; white-space:nowrap }
  .hint { font-family:system-ui,sans-serif; font-size:12px; color:#64748b; background:#f8fafc;
          border-radius:6px; padding:8px 12px; margin:0 0 28px }

  .doc { page-break-after: always }
  .doc:last-of-type { page-break-after: auto }
  .doc-head { border-bottom:2px solid #14532d; padding-bottom:14px; margin-bottom:20px }
  .brand { font-family:system-ui,sans-serif; font-size:13px; font-weight:800; letter-spacing:.08em;
           color:#14532d; text-transform:uppercase }
  .brand span { font-weight:500; letter-spacing:.02em; text-transform:none }
  .doc-head h1 { font-size:23px; margin:10px 0 2px; letter-spacing:.01em }
  .subtitle { font-family:system-ui,sans-serif; font-size:12px; color:#64748b }
  .addr { font-family:system-ui,sans-serif; font-size:11px; color:#94a3b8; margin-top:8px; line-height:1.5 }
  .preamble { font-style:italic; color:#334155; border-left:3px solid #cbd5e1; padding-left:14px }

  .sec { margin-bottom:22px }
  .s-h1 { font-size:16px; font-family:system-ui,sans-serif; font-weight:800; letter-spacing:.02em;
          color:#14532d; border-bottom:1px solid #cbd5e1; padding-bottom:5px; margin:26px 0 12px }
  .s-h2 { font-size:14px; font-family:system-ui,sans-serif; font-weight:700; color:#14532d; margin:18px 0 8px }
  .s-h3 { font-size:13px; font-family:system-ui,sans-serif; font-weight:700; color:#334155; margin:14px 0 6px }
  p { margin:0 0 10px }
  .small { font-size:12px; color:#64748b }
  ul { margin:0 0 12px; padding-left:20px }
  li { margin-bottom:5px }

  .callout { background:#fef2f2; border-left:4px solid #e11d48; border-radius:0 6px 6px 0;
             padding:12px 16px; margin:14px 0; page-break-inside:avoid }
  .callout-title { font-family:system-ui,sans-serif; font-size:11px; font-weight:800;
                   letter-spacing:.07em; text-transform:uppercase; color:#e11d48; margin-bottom:6px }
  .callout p:last-child, .callout ul:last-child { margin-bottom:0 }

  table.grid, table.choice { width:100%; border-collapse:collapse; margin:12px 0; font-size:12.5px;
                             font-family:system-ui,sans-serif; page-break-inside:avoid }
  table.grid th, table.choice th { text-align:left; font-size:10.5px; text-transform:uppercase;
             letter-spacing:.05em; color:#64748b; border-bottom:2px solid #cbd5e1; padding:6px 8px }
  table.grid td, table.choice td { padding:6px 8px; border-bottom:1px solid #e2e8f0; vertical-align:top }
  table.grid td.k { color:#64748b; white-space:nowrap; width:34% }
  .num { text-align:right; white-space:nowrap }
  tr.chosen td { background:#f0fdf4; font-weight:700 }
  tr.unchosen td { color:#94a3b8 }
  td.box { width:24px; font-size:15px; text-align:center }

  .fld-group-label { font-family:system-ui,sans-serif; font-size:11px; font-weight:700;
                     text-transform:uppercase; letter-spacing:.05em; color:#334155; margin:14px 0 4px }
  .fld-grid { display:grid; gap:10px 20px; margin:8px 0 14px }
  .fld-grid.cols-1 { grid-template-columns:1fr }
  .fld-grid.cols-2 { grid-template-columns:1fr 1fr }
  .fld-grid.cols-3 { grid-template-columns:1fr 1fr 1fr }
  .fld label { display:block; font-family:system-ui,sans-serif; font-size:9.5px; font-weight:700;
               letter-spacing:.06em; text-transform:uppercase; color:#94a3b8; margin-bottom:2px }
  .fld .val { border-bottom:1px solid #94a3b8; padding:2px 2px 3px; min-height:20px;
              font-size:13.5px; word-break:break-word }
  .blank { display:inline-block; min-width:120px }
  .blank.wide { min-width:220px }

  .initials { display:flex; flex-wrap:wrap; align-items:center; gap:8px 26px; margin:14px 0 18px;
              padding:9px 12px; background:#f8fafc; border-radius:6px; page-break-inside:avoid }
  .ini-slot { display:flex; align-items:center; gap:8px; font-family:system-ui,sans-serif; font-size:11.5px }
  .ini-label { color:#64748b }
  .ini-box { display:inline-block; min-width:88px; border-bottom:1px solid #64748b; text-align:center;
             font-family:'Brush Script MT', cursive; font-size:17px; padding:0 6px 1px; color:#0f172a }
  .ini-caption { flex-basis:100%; font-family:system-ui,sans-serif; font-size:10px; color:#94a3b8 }

  .signatures { margin-top:30px; border-top:2px solid #cbd5e1; padding-top:16px; page-break-inside:avoid }
  .sig-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px 28px; margin:14px 0 }
  .sig-cell label { display:block; font-family:system-ui,sans-serif; font-size:9.5px; font-weight:700;
                    letter-spacing:.06em; text-transform:uppercase; color:#94a3b8; margin:9px 0 2px }
  .sig-cell .val { border-bottom:1px solid #94a3b8; padding:2px 2px 3px; min-height:20px }
  .sig-line { border-bottom:1px solid #94a3b8; min-height:44px; display:flex; align-items:flex-end }
  img.sig { max-height:52px; max-width:100% }

  .appendix { margin-top:26px; page-break-inside:avoid }
  .audit-section { margin-top:34px; border-top:3px double #cbd5e1; padding-top:18px }
  .audit-block { margin-bottom:20px; padding-bottom:16px; border-bottom:1px dashed #e2e8f0;
                 page-break-inside:avoid }
  .audit-block:last-child { border-bottom:0 }
  .role { font-family:system-ui,sans-serif; font-size:11px; font-weight:800; letter-spacing:.06em;
          text-transform:uppercase; color:#e11d48; margin-bottom:6px }
  .consent { background:#f8fafc; border-left:3px solid #e11d48; padding:9px 13px;
             font-family:system-ui,sans-serif; font-size:11.5px; line-height:1.55; margin-bottom:10px }
  table.audit { border-collapse:collapse; font-family:system-ui,sans-serif; font-size:11.5px; color:#475569 }
  table.audit td { padding:2px 14px 2px 0; vertical-align:top; word-break:break-word }
  table.audit td:first-child { color:#94a3b8; white-space:nowrap }

  /* Print rules go last and use !important on purpose: .noprint and .bar have
     the same specificity, so source order alone would decide the winner. The
     toolbar used to print onto the page because .bar came afterwards. */
  @media print {
    .noprint { display: none !important }
    body { margin: 0 auto; max-width: none; font-size: 11pt }
  }
</style></head>
<body>
  <div class="bar noprint">
    <span>Rustic Retreat Weddings — Executed Contract</span>
    <button onclick="window.print()">Print</button>
  </div>
  <p class="hint noprint">Pick your printer under <strong>Destination</strong> in the
  print dialog. <strong>Save as PDF</strong> is just one destination in that list — if
  it is the only one offered, no printer is set up on this computer.</p>
  ${docs}
  ${renderAudit(signers, initialsRows || [])}
</body></html>`;
}

module.exports = { renderPacketHtml, esc, fmtMoney, fmtDate, fmtTime };
