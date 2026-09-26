// Forms: questions, a couple's answers, private links, and the website forms.
//
// A form is a list of questions (form_fields). Giving a form to a couple makes
// an assignment, and its answers are form_responses. Answers can come from
// staff typing them in, from the couple through a private link, or from the
// website's contact and booking-request forms.

const crypto = require('crypto');
const db = require('../db');

const FIELD_TYPES = ['text', 'textarea', 'number', 'date', 'select', 'checkbox'];
const LINK_DAYS = 60;

// Save a form's questions without losing answers already given. Answers point
// at a question's id (and are deleted with it), so questions are updated in
// place by id; only questions actually removed are deleted.
function saveFields(formId, fields) {
  const current = new Set(db.prepare('SELECT id FROM form_fields WHERE form_id = ?').all(formId).map(r => r.id));
  const keep = new Set();
  const update = db.prepare(`UPDATE form_fields SET label = ?, field_type = ?, options = ?, required = ?, order_index = ?
                             WHERE id = ? AND form_id = ?`);
  const insert = db.prepare(`INSERT INTO form_fields (form_id, label, field_type, options, required, order_index, field_key)
                             VALUES (?, ?, ?, ?, ?, ?, ?)`);
  (fields || []).forEach((f, idx) => {
    const type = FIELD_TYPES.includes(f.field_type) ? f.field_type : 'text';
    const options = f.options ? (typeof f.options === 'string' ? f.options : JSON.stringify(f.options)) : null;
    const label = String(f.label || '').trim() || 'Question';
    const id = Number(f.id);
    if (id && current.has(id)) {
      update.run(label, type, options, f.required ? 1 : 0, idx, id, formId);
      keep.add(id);
    } else {
      insert.run(formId, label, type, options, f.required ? 1 : 0, idx, f.field_key || null);
    }
  });
  for (const id of current) if (!keep.has(id)) db.prepare('DELETE FROM form_fields WHERE id = ?').run(id);
}

function fieldsWithValues(assignment) {
  return db.prepare(`
    SELECT ff.id, ff.label, ff.field_type, ff.options, ff.required, ff.order_index, ff.field_key, r.value
    FROM form_fields ff
    LEFT JOIN form_responses r ON r.field_id = ff.id AND r.assignment_id = ?
    WHERE ff.form_id = ?
    ORDER BY ff.order_index, ff.id
  `).all(assignment.id, assignment.form_id);
}

function fullAssignment(id) {
  const assignment = db.prepare(`
    SELECT fa.*, c.partner1_name, c.partner2_name, c.email AS couple_email, c.partner2_email
    FROM form_assignments fa JOIN couples c ON c.id = fa.couple_id WHERE fa.id = ?
  `).get(id);
  if (!assignment) return null;
  const form = db.prepare('SELECT id, title, description, system_key FROM forms WHERE id = ?').get(assignment.form_id);
  const { access_token, ...safe } = assignment;
  return { assignment: { ...safe, has_link: !!access_token }, form, fields: fieldsWithValues(assignment) };
}

// Replace an assignment's answers. `answers` maps field id to value; ids that
// are not questions on this form are ignored. Required questions are checked
// only when the answers are submitted as complete.
function saveAnswers(assignment, answers, { by, complete = true } = {}) {
  const fields = db.prepare('SELECT id, label, required FROM form_fields WHERE form_id = ?').all(assignment.form_id);
  const valid = new Set(fields.map(f => f.id));
  const clean = {};
  for (const [k, v] of Object.entries(answers || {})) {
    if (valid.has(Number(k)) && v != null && String(v).trim() !== '') clean[Number(k)] = String(v).slice(0, 10000);
  }
  if (complete) {
    const missing = fields.filter(f => f.required && !(f.id in clean)).map(f => f.label);
    if (missing.length) return { ok: false, error: `Please answer: ${missing.join(', ')}` };
  }
  db.transaction(() => {
    db.prepare('DELETE FROM form_responses WHERE assignment_id = ?').run(assignment.id);
    const insert = db.prepare('INSERT INTO form_responses (assignment_id, field_id, value) VALUES (?, ?, ?)');
    for (const [fieldId, value] of Object.entries(clean)) insert.run(assignment.id, Number(fieldId), value);
    db.prepare(`UPDATE form_assignments SET
                  status = CASE WHEN ? THEN 'completed' ELSE status END,
                  submitted_at = CASE WHEN ? AND submitted_at IS NULL THEN datetime('now') ELSE submitted_at END,
                  filled_by = COALESCE(filled_by, ?), updated_by = ?, updated_at = datetime('now')
                WHERE id = ?`)
      .run(complete ? 1 : 0, complete ? 1 : 0, by || null, by || null, assignment.id);
  })();
  return { ok: true };
}

// A private link for the couple, like a contract signing link. Re-issuing gives
// a fresh token, so an old link stops working once a new one is sent.
function issueLink(assignmentId) {
  const token = crypto.randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + LINK_DAYS * 86400000).toISOString();
  db.prepare('UPDATE form_assignments SET access_token = ?, token_expires_at = ?, link_sent_at = datetime(\'now\') WHERE id = ?')
    .run(token, expires, assignmentId);
  return { token, expires };
}

function assignmentForToken(token) {
  if (!/^[a-f0-9]{48}$/.test(String(token || ''))) return null;
  const a = db.prepare('SELECT * FROM form_assignments WHERE access_token = ?').get(token);
  if (!a || (a.token_expires_at && new Date(a.token_expires_at) < new Date())) return null;
  return a;
}

// ── The website's forms ──────────────────────────────────────────────────────
// Each is a normal CRM form (so its answers can be viewed and edited like any
// other), created on first use and marked with a system_key. Questions are
// matched to the website's field names by field_key; new ones are appended and
// staff edits to a label are kept.
const SYSTEM_FORMS = {
  'website-enquiry': {
    title: 'Website enquiry (contact page)',
    description: 'Filled in automatically from the "Book a Venue Tour" form on rusticretreatalberta.ca.',
    fields: [
      ['partner1FirstName', 'Partner 1 first name'], ['partner1LastName', 'Partner 1 last name'],
      ['partner2FirstName', 'Partner 2 first name'], ['partner2LastName', 'Partner 2 last name'],
      ['email', 'Email'], ['phone', 'Phone'], ['preferredContact', 'Preferred contact method'],
      ['weddingDate', 'Wedding date'], ['tourDates', 'Tour dates suggested'], ['guestCount', 'Guest count'],
      ['message', 'Message', 'textarea'],
    ],
  },
  'booking-request': {
    title: 'Website booking request',
    description: 'Filled in automatically from the 2026 and 2027 booking-request pages on rusticretreatalberta.ca.',
    fields: [
      ['bookingForm', 'Booking form year'], ['client1Name', 'Client 1 full name'], ['client2Name', 'Client 2 full name'],
      ['email', 'Email'],
    ],
  },
};

function ensureSystemForm(key, extraFields = []) {
  const def = SYSTEM_FORMS[key];
  let form = db.prepare('SELECT * FROM forms WHERE system_key = ?').get(key);
  if (!form) {
    const id = db.prepare('INSERT INTO forms (title, description, system_key) VALUES (?, ?, ?)').run(def.title, def.description, key).lastInsertRowid;
    form = db.prepare('SELECT * FROM forms WHERE id = ?').get(id);
  }
  const have = new Map(db.prepare('SELECT id, field_key FROM form_fields WHERE form_id = ?').all(form.id).map(r => [r.field_key, r.id]));
  let order = db.prepare('SELECT COALESCE(MAX(order_index), -1) AS m FROM form_fields WHERE form_id = ?').get(form.id).m;
  for (const [fieldKey, label, type] of [...def.fields, ...extraFields]) {
    if (have.has(fieldKey)) continue;
    const id = db.prepare('INSERT INTO form_fields (form_id, label, field_type, field_key, order_index) VALUES (?, ?, ?, ?, ?)')
      .run(form.id, label, type || (/vision|anything|message|detail/i.test(fieldKey) ? 'textarea' : 'text'), fieldKey, ++order).lastInsertRowid;
    have.set(fieldKey, id);
  }
  return { form, fieldIds: have };
}

// File one website submission as a completed assignment for the couple. Every
// submission is its own assignment, so repeat enquiries keep their history.
function recordSystemSubmission(key, coupleId, values, extraFields = []) {
  const { form, fieldIds } = ensureSystemForm(key, extraFields);
  const id = db.prepare(`INSERT INTO form_assignments (form_id, couple_id, status, submitted_at, filled_by, updated_at)
                         VALUES (?, ?, 'completed', datetime('now'), 'website', datetime('now'))`).run(form.id, coupleId).lastInsertRowid;
  const insert = db.prepare('INSERT INTO form_responses (assignment_id, field_id, value) VALUES (?, ?, ?)');
  for (const [fieldKey, value] of Object.entries(values)) {
    const v = String(value ?? '').trim();
    if (v && fieldIds.has(fieldKey)) insert.run(id, fieldIds.get(fieldKey), v.slice(0, 10000));
  }
  return id;
}

module.exports = {
  saveFields, fieldsWithValues, fullAssignment, saveAnswers, issueLink, assignmentForToken,
  ensureSystemForm, recordSystemSubmission, LINK_DAYS,
};
