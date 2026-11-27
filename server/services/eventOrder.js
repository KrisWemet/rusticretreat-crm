// The event order (a venue's BEO): everything the team needs on the day,
// gathered from records that already exist — the booking, the signed
// agreement's own fields, vendors, the run of show, the guest list, floor
// plans, returned forms and the venue's notes. Nothing here is typed twice.

const db = require('../db');
const { defaultEndDate } = require('./bookingRules');
const { sortRunOfShow, esc } = require('./planning');
const { summarize, renderSvg } = require('./floorPlan');
const finalDetails = require('./finalDetails');
const damageDeposit = require('./damageDeposit');

const longDay = (d) => (d ? new Intl.DateTimeFormat('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(d + 'T00:00:00Z')) : '');
const shortDay = (d) => (d ? new Intl.DateTimeFormat('en-CA', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(d + 'T00:00:00Z')) : '');
const money = (n) => `$${Number(n || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const clock = (t) => {
  if (!t) return '';
  const m = String(t).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return String(t);
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
};

function buildEventOrder(coupleId) {
  const couple = db.prepare('SELECT * FROM couples WHERE id = ?').get(coupleId);
  if (!couple) return null;
  const booking = db.prepare('SELECT * FROM bookings WHERE couple_id = ? ORDER BY event_date DESC, id DESC').get(coupleId) || null;
  const checkIn = booking?.event_date || couple.wedding_date || null;
  const packageName = booking?.package_name || couple.venue_package || null;
  const checkOut = booking?.end_date || (checkIn ? defaultEndDate(checkIn, packageName) : null) || checkIn;

  // The rental agreement carries the setup and teardown times and the couple's
  // on-site contacts, filled in during signing. A signed one wins.
  const contract = db.prepare(`SELECT id, title, status, template_key, signed_at FROM contracts
    WHERE couple_id = ? ORDER BY (status = 'signed') DESC, id DESC`).get(coupleId) || null;
  const f = contract?.template_key
    ? Object.fromEntries(db.prepare('SELECT field_key, value FROM contract_field_values WHERE contract_id = ?').all(contract.id).map(r => [r.field_key, r.value]))
    : {};
  const onsite = [1, 2].map(n => ({ name: f[`onsite${n}_name`], phone: f[`onsite${n}_phone`], role: f[`onsite${n}_relationship`] }))
    .filter(c => c.name || c.phone);
  const agreement = {
    event_type: f.event_type || null,
    setup_date: f.setup_date || null, setup_time: f.setup_time || null,
    teardown_date: f.teardown_date || null, teardown_time: f.teardown_time || null,
    damage_deposit: f.damage_deposit || null,
    preferred_contact: f.preferred_contact_details || null,
  };

  const vendors = db.prepare('SELECT * FROM vendors WHERE couple_id = ? ORDER BY vendor_type COLLATE NOCASE, business_name COLLATE NOCASE').all(coupleId);
  const items = sortRunOfShow(db.prepare('SELECT * FROM timeline_events WHERE couple_id = ?').all(coupleId));
  const days = [];
  for (const it of items) {
    const key = it.day_date || '';
    let d = days.find(x => x.day === key);
    if (!d) days.push(d = { day: key, items: [] });
    d.items.push(it);
  }

  const guests = db.prepare('SELECT * FROM guests WHERE couple_id = ?').all(coupleId);
  const accepted = guests.filter(g => g.rsvp_status === 'accepted');
  const plusOnes = accepted.filter(g => g.plus_one).length;
  const meals = {};
  for (const g of accepted) { const k = g.meal_preference || 'Not chosen'; meals[k] = (meals[k] || 0) + 1; }
  const guestSummary = {
    listed: guests.length,
    accepted: accepted.length,
    pending: guests.filter(g => g.rsvp_status === 'pending').length,
    declined: guests.filter(g => g.rsvp_status === 'declined').length,
    plus_ones: plusOnes,
    expected: accepted.length + plusOnes,
    // Only worth printing once someone has actually chosen a meal.
    meals: Object.keys(meals).some(k => k !== 'Not chosen')
      ? Object.entries(meals).map(([meal, count]) => ({ meal, count })).sort((a, b) => b.count - a.count) : [],
    dietary: guests.filter(g => g.rsvp_status !== 'declined' && g.dietary_restrictions)
      .map(g => ({ name: `${g.first_name} ${g.last_name}`, dietary: g.dietary_restrictions })),
  };

  const plans = db.prepare('SELECT * FROM floor_plans WHERE couple_id = ? ORDER BY created_at, id').all(coupleId).map(p => {
    const planItems = JSON.parse(p.items || '[]');
    const seated = {};
    for (const g of guests) if (g.seat_plan_id === p.id) seated[g.seat_table] = (seated[g.seat_table] || 0) + 1;
    return { id: p.id, name: p.name, width_ft: p.width_ft, height_ft: p.height_ft, notes: p.notes, items: planItems, seated,
      summary: summarize(planItems), seated_total: Object.values(seated).reduce((a, b) => a + b, 0) };
  });

  // Forms the couple returned, minus the website's own enquiry copies, which
  // are sales history rather than instructions for the day.
  const forms = db.prepare(`SELECT fa.id, f.title, fa.submitted_at FROM form_assignments fa JOIN forms f ON f.id = fa.form_id
    WHERE fa.couple_id = ? AND fa.status = 'completed' AND f.system_key IS NULL ORDER BY fa.submitted_at`).all(coupleId)
    .map(a => ({ ...a, answers: db.prepare(`SELECT ff.label, fr.value FROM form_responses fr JOIN form_fields ff ON ff.id = fr.field_id
      WHERE fr.assignment_id = ? ORDER BY ff.order_index, ff.id`).all(a.id).filter(r => r.value != null && String(r.value).trim() !== '') }));
  const formsOutstanding = db.prepare(`SELECT COUNT(*) AS n FROM form_assignments fa JOIN forms f ON f.id = fa.form_id
    WHERE fa.couple_id = ? AND fa.status != 'completed' AND f.system_key IS NULL`).get(coupleId).n;

  const invoices = db.prepare('SELECT amount, paid, due_date, description FROM invoices WHERE couple_id = ? ORDER BY due_date').all(coupleId);
  const total = invoices.reduce((s, i) => s + (i.amount || 0), 0);
  const paid = invoices.filter(i => i.paid).reduce((s, i) => s + (i.amount || 0), 0);
  const next = invoices.find(i => !i.paid) || null;

  const tasksOpen = db.prepare('SELECT COUNT(*) AS n FROM tasks WHERE couple_id = ? AND completed = 0').get(coupleId).n;

  // The Final Details Form (agreement Section 2.3): the final counts, once
  // the couple has submitted them, outrank any earlier estimate.
  const fdRec = finalDetails.recordFor(coupleId);
  const final = fdRec?.submitted_at ? {
    guests: fdRec.guests, campers: fdRec.campers, tents: fdRec.tents, rvs: fdRec.rvs, rv_over_30ft: fdRec.rv_over_30ft,
    extras: fdRec.extras, notes: fdRec.notes, submitted_at: fdRec.submitted_at, submitted_name: fdRec.submitted_name,
    reviewed_at: fdRec.reviewed_at, total: fdRec.quote?.total || 0,
  } : null;

  // What is still missing before the weekend, in the order a coordinator
  // would chase it.
  const readiness = [
    { key: 'contract', label: 'Rental agreement signed', done: contract?.status === 'signed' },
    { key: 'deposit', label: 'Deposit paid', done: invoices.length > 0 && !!invoices[0].paid },
    { key: 'balance', label: 'Balance paid in full', done: invoices.length > 0 && paid >= total - 0.005 },
    { key: 'guests', label: 'Guest count confirmed', done: !!final || !!booking?.guest_count || guestSummary.accepted > 0 },
    { key: 'onsite', label: 'On-site contacts named', done: onsite.length >= 2 },
    { key: 'runofshow', label: 'Run of show planned', done: items.length > 0 },
    { key: 'vendors', label: 'Vendors confirmed', done: vendors.length > 0 && vendors.every(v => v.booked) },
    { key: 'floorplan', label: 'Floor plan drawn', done: plans.some(p => p.items.length > 0) },
    { key: 'forms', label: 'Forms returned', done: formsOutstanding === 0 },
    { key: 'finaldetails', label: 'Final Details Form submitted', done: !!final },
  ];

  return {
    couple: {
      id: couple.id, partner1_name: couple.partner1_name, partner2_name: couple.partner2_name,
      email: couple.email, partner2_email: couple.partner2_email, phone: couple.phone, partner2_phone: couple.partner2_phone,
      status: couple.status, event_notes: couple.event_notes || '',
    },
    booking: booking && {
      id: booking.id, package_name: booking.package_name, guest_count: booking.guest_count,
      ceremony_location: booking.ceremony_location, reception_location: booking.reception_location,
      catering_type: booking.catering_type, special_requests: booking.special_requests, add_ons: booking.add_ons,
      start_time: booking.start_time, end_time: booking.end_time,
    },
    check_in: checkIn, check_out: checkOut, package_name: packageName,
    contract: contract && { id: contract.id, title: contract.title, status: contract.status },
    agreement, onsite, vendors, days, guests: guestSummary, plans, forms, forms_outstanding: formsOutstanding,
    payments: { total, paid, balance: Math.max(0, total - paid), next },
    tasks_open: tasksOpen, readiness, final,
    // Extras billed on itemised invoices (propane, signage…), for the team to
    // have ready. Overage and deposit lines are not "things to set out".
    extras_ordered: db.prepare(`SELECT it.label, SUM(it.quantity) AS quantity, SUM(it.amount) AS amount FROM invoice_items it
      JOIN invoices i ON i.id = it.invoice_id WHERE i.couple_id = ? AND it.kind = 'item' AND it.addon_id IS NOT NULL
      GROUP BY it.label ORDER BY it.label`).all(coupleId),
    deposit: (() => { const d = damageDeposit.view(coupleId); return { status: d.status, expected: d.agreed_amount, received: d.received, received_at: d.record?.received_at || null, method: d.record?.received_method || null }; })(),
  };
}

// Printed record. Financials are left off the copy handed to vendors.
function renderEventOrder(eo, { financials = true, generatedAt = new Date() } = {}) {
  const names = `${esc(eo.couple.partner1_name)} &amp; ${esc(eo.couple.partner2_name)}`;
  const row = (k, v) => (v ? `<tr><th>${esc(k)}</th><td>${v}</td></tr>` : '');
  const stamp = new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Edmonton' }).format(generatedAt);
  const setup = eo.agreement.setup_date ? `${esc(longDay(eo.agreement.setup_date))}${eo.agreement.setup_time ? `, ${esc(clock(eo.agreement.setup_time))}` : ''}` : esc(longDay(eo.check_in));
  const teardown = eo.agreement.teardown_date ? `${esc(longDay(eo.agreement.teardown_date))}${eo.agreement.teardown_time ? `, ${esc(clock(eo.agreement.teardown_time))}` : ''}` : esc(longDay(eo.check_out));
  const expected = eo.final ? `${eo.final.guests} (final)` : eo.booking?.guest_count || (eo.guests.expected || '');
  const fin = eo.final;
  const finalSection = fin ? `<h2>Final details</h2><table class="kv">
${row('Guests (ceremony and reception)', esc(String(fin.guests)))}
${row('Overnight campers', esc(String(fin.campers)))}
${row('Tents', esc(String(fin.tents)))}
${row('RVs', `${esc(String(fin.rvs))}${fin.rv_over_30ft ? ' <span class="warn">one or more over 30 ft: alternate exit route</span>' : ''}`)}
${fin.extras.map(e => row(e.name, `${esc(String(e.quantity))}${financials ? ` <span class="muted">· ${money(e.unit_price * e.quantity)}</span>` : ''}`)).join('')}
${row('Notes', fin.notes ? `<span class="pre">${esc(fin.notes)}</span>` : '')}
</table><p class="muted">Submitted by ${esc(fin.submitted_name || 'the couple')}${fin.reviewed_at ? ' · reviewed by the venue' : ' · <span class="warn">not yet reviewed</span>'}${financials && fin.total ? ` · overages ${money(fin.total)} incl. GST` : ''}</p>` : '';

  const contacts = [
    [eo.couple.partner1_name, eo.couple.phone, eo.couple.email, 'Client 1'],
    [eo.couple.partner2_name, eo.couple.partner2_phone, eo.couple.partner2_email, 'Client 2'],
    ...eo.onsite.map((c, i) => [c.name, c.phone, '', `On-site contact ${i + 1}${c.role ? ` (${c.role})` : ''}`]),
  ].map(([n, p, e, role]) => `<tr><td>${esc(role)}</td><td><strong>${esc(n || '')}</strong></td><td>${esc(p || '')}</td><td>${esc(e || '')}</td></tr>`).join('');

  const days = eo.days.map(d => `
    <h3>${d.day ? esc(longDay(d.day)) : 'Day not set'}</h3>
    <table class="ros"><thead><tr><th>Time</th><th>What</th><th>Where</th><th>Who</th></tr></thead><tbody>${d.items.map(it => `<tr><td class="t">${esc(it.time)}</td><td><strong>${esc(it.title)}</strong>${it.description ? `<div class="muted">${esc(it.description)}</div>` : ''}</td><td>${esc(it.location || '')}</td><td>${esc(it.assigned_to || '')}</td></tr>`).join('')}</tbody></table>`).join('');

  const vendors = eo.vendors.map(v => `<tr><td>${esc(v.vendor_type)}</td><td><strong>${esc(v.business_name)}</strong>${v.booked ? '' : ' <span class="warn">not confirmed</span>'}</td><td>${esc(v.contact_name || '')}</td><td>${esc(v.phone || '')}</td><td>${esc(v.arrival_time || '')}</td></tr>`).join('');

  const plans = eo.plans.filter(p => p.items.length).map(p => `
    <div class="plan"><h3>${esc(p.name)}</h3>
    ${renderSvg(p, p.items, { widthPx: 640, seated: p.seated })}
    <p class="muted">${p.summary.equipment.map(e => `${esc(e.label)}: ${e.count}`).join(' · ')}${p.summary.tableSeats ? ` · Seats at tables: ${p.summary.tableSeats}` : ''}${p.summary.ceremonyChairs ? ` · Ceremony chairs: ${p.summary.ceremonyChairs}` : ''}${p.seated_total ? ` · Guests seated: ${p.seated_total}` : ''}</p>
    ${p.notes ? `<p class="pre">${esc(p.notes)}</p>` : ''}</div>`).join('');

  const forms = eo.forms.map(fm => `<h3>${esc(fm.title)}</h3><table class="kv">${fm.answers.map(a => row(a.label, esc(a.value))).join('')}</table>`).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>Event order — ${names}</title>
<style>
body{font-family:Helvetica,Arial,sans-serif;color:#0f172a;margin:28px;font-size:12px;line-height:1.4}
h1{font-size:22px;margin:0}h2{font-size:14px;margin:20px 0 6px;padding-bottom:3px;border-bottom:2px solid #0f172a;text-transform:uppercase;letter-spacing:.04em}
h3{font-size:13px;margin:12px 0 4px}.muted{color:#64748b}.warn{color:#b45309;font-size:11px}.pre{white-space:pre-wrap}
.bar{display:flex;gap:8px;margin-bottom:16px}.bar button{background:#e11d48;color:#fff;border:0;border-radius:6px;padding:8px 14px;font-size:13px;cursor:pointer}
table{border-collapse:collapse;width:100%}td,th{text-align:left;vertical-align:top;padding:4px 8px 4px 0;border-bottom:1px solid #e2e8f0}
table.kv th{width:34%;color:#475569;font-weight:600}table.ros td.t{width:72px;font-weight:700;white-space:nowrap}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.plan{break-inside:avoid}.plan svg{max-width:100%;height:auto}
.foot{margin-top:24px;color:#94a3b8;font-size:10px}
@media print { .noprint { display: none !important; } body { margin: 0; } h2 { break-after: avoid; } }
</style></head><body>
<div class="bar noprint"><button onclick="window.print()">Print / Save as PDF</button></div>
<h1>Event order: ${names}</h1>
<p class="muted">${esc(eo.package_name || 'Package not set')} · ${esc(shortDay(eo.check_in))}${eo.check_out && eo.check_out !== eo.check_in ? ` – ${esc(shortDay(eo.check_out))}` : ''}${financials ? '' : ' · vendor copy'}</p>

<div class="grid">
<div><h2>At a glance</h2><table class="kv">
${row('Event', esc(eo.agreement.event_type || 'Wedding'))}
${row('Setup / access', setup)}
${row('Teardown by', teardown)}
${row('Expected guests', expected ? esc(String(expected)) : '')}
${row('Ceremony', esc(eo.booking?.ceremony_location || ''))}
${row('Reception', esc(eo.booking?.reception_location || ''))}
${row('Add-ons', esc(eo.booking?.add_ons || ''))}
${row('Extras ordered', (eo.extras_ordered || []).map(x => `${esc(x.label)} × ${esc(String(Number(x.quantity)))}${financials ? ` <span class="muted">(${money(x.amount)})</span>` : ''}`).join('<br>'))}
</table></div>
<div><h2>Contacts</h2><table>${contacts}</table>
${eo.agreement.preferred_contact ? `<p class="muted">Preferred contact: ${esc(eo.agreement.preferred_contact)}</p>` : ''}</div>
</div>

${eo.booking?.special_requests || eo.booking?.catering_type ? `<h2>Requests and catering</h2><table class="kv">${row('Catering', esc(eo.booking?.catering_type || ''))}${row('Special requests', eo.booking?.special_requests ? `<span class="pre">${esc(eo.booking.special_requests)}</span>` : '')}</table>` : ''}

${eo.couple.event_notes ? `<h2>Venue notes</h2><p class="pre">${esc(eo.couple.event_notes)}</p>` : ''}

${finalSection}

<h2>Run of show</h2>${days || '<p class="muted">No run of show yet.</p>'}

<h2>Vendors</h2>${vendors ? `<table><thead><tr><th>Type</th><th>Business</th><th>Contact</th><th>Phone</th><th>Arrives</th></tr></thead><tbody>${vendors}</tbody></table>` : '<p class="muted">No vendors listed.</p>'}

<h2>Guests</h2>
${eo.guests.listed ? `<p>${eo.guests.accepted} attending${eo.guests.plus_ones ? ` + ${eo.guests.plus_ones} plus-ones` : ''} · ${eo.guests.pending} not yet replied · ${eo.guests.declined} declined</p>
${eo.guests.meals.length ? `<p><strong>Meals:</strong> ${eo.guests.meals.map(m => `${esc(m.meal)} ${m.count}`).join(' · ')}</p>` : ''}
${eo.guests.dietary.length ? `<table class="kv">${eo.guests.dietary.map(d => row(d.name, esc(d.dietary))).join('')}</table>` : ''}` : '<p class="muted">No guest list on file.</p>'}

${plans ? `<h2>Floor plans</h2>${plans}` : ''}
${forms ? `<h2>Forms</h2>${forms}` : ''}

${financials ? `<h2>Payments</h2><table class="kv">
${row('Total', money(eo.payments.total))}${row('Paid', money(eo.payments.paid))}${row('Balance', `<strong>${money(eo.payments.balance)}</strong>`)}
${eo.payments.next ? row('Next due', `${esc(eo.payments.next.description)} · ${money(eo.payments.next.amount)}${eo.payments.next.due_date ? ` · ${esc(shortDay(eo.payments.next.due_date))}` : ''}`) : ''}
${row('Damage deposit', eo.deposit.received_at ? `${money(eo.deposit.received)} received ${esc(shortDay(eo.deposit.received_at))}${eo.deposit.method ? ` by ${esc(eo.deposit.method)}` : ''}` : `<strong>${money(eo.deposit.expected)} to collect at check-in</strong>`)}
</table>` : ''}

<p class="foot">Generated ${esc(stamp)} from the CRM. Re-print after changes; this copy does not update itself.</p>
</body></html>`;
}

module.exports = { buildEventOrder, renderEventOrder };
