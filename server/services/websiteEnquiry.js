// Enquiries from the contact form on rusticretreatalberta.ca.
//
// That page is "Book a Venue Tour", so every enquiry is a tour request, whether
// or not the couple suggested dates.
//
// That form posts to Formspree, which emails the venue, and also sends a copy
// here so the couple lands in the CRM without anyone retyping it. Formspree
// stays the email notification, so nothing here emails staff.
//
// The form's fields are free text (a wedding date can be "Summer 2027"), so
// everything the couple wrote is kept in the notes; only an unambiguous date
// is copied into wedding_date.

const db = require('../db');

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july',
  'august', 'september', 'october', 'november', 'december'];

const clip = (v, n) => String(v ?? '').trim().slice(0, n);
const pad = (n) => String(n).padStart(2, '0');

function isoDate(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

function monthIndex(word) {
  const w = word.toLowerCase();
  if (w.length < 3) return -1;
  return MONTHS.findIndex(m => m.startsWith(w));
}

// "2027-08-14", "August 14th, 2027", "Aug 14 2027", "14 August 2027" → ISO.
// Anything vaguer ("Summer 2027", "August 2027") → null.
function parseWeddingDate(text) {
  const s = clip(text, 100).replace(/(\d+)(st|nd|rd|th)\b/gi, '$1').replace(/,/g, ' ');
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return isoDate(+m[1], +m[2], +m[3]);
  m = s.match(/^([a-z]+)\.?\s+(\d{1,2})\s+(\d{4})$/i);
  if (m && monthIndex(m[1]) >= 0) return isoDate(+m[3], monthIndex(m[1]) + 1, +m[2]);
  m = s.match(/^(\d{1,2})\s+([a-z]+)\.?\s+(\d{4})$/i);
  if (m && monthIndex(m[2]) >= 0) return isoDate(+m[3], monthIndex(m[2]) + 1, +m[1]);
  return null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Record one website enquiry. Returns { ok: true, coupleId, created } or
 * { ok: false, status, error }. A filled-in honeypot returns ok with no
 * couple, so bots get the same answer as people and learn nothing.
 */
function recordWebsiteEnquiry(body = {}, now = new Date()) {
  if (clip(body._gotcha, 200)) return { ok: true, coupleId: null, created: false, ignored: true };

  const partner1 = [clip(body.partner1FirstName, 80), clip(body.partner1LastName, 80)].filter(Boolean).join(' ');
  const partner2 = [clip(body.partner2FirstName, 80), clip(body.partner2LastName, 80)].filter(Boolean).join(' ');
  const email = clip(body.email, 200).toLowerCase();
  if (!partner1 || !partner2) return { ok: false, status: 400, error: 'Both partners’ names are required' };
  if (!EMAIL_RE.test(email)) return { ok: false, status: 400, error: 'A valid email address is required' };

  const phone = clip(body.phone, 40) || null;
  const weddingText = clip(body.weddingDate, 100);
  const tourDates = clip(body.tourDates, 500);
  const guests = clip(body.guestCount, 100);
  const prefers = clip(body.preferredContact, 20);
  const message = clip(body.message, 5000);
  const today = now.toISOString().slice(0, 10);

  const note = [
    `Website contact form, ${today}:`,
    weddingText && `Wedding date: ${weddingText}`,
    guests && `Guests: ${guests}`,
    tourDates && `Tour dates suggested: ${tourDates}`,
    prefers && `Prefers to be contacted by: ${prefers}`,
    message && `Message: ${message}`,
  ].filter(Boolean).join('\n');

  const record = db.transaction(() => {
    const existing = db.prepare('SELECT * FROM couples WHERE LOWER(email) = ?').get(email);
    let coupleId, created;
    if (existing) {
      // A repeat enquiry adds to the record instead of being turned away.
      coupleId = existing.id; created = false;
      db.prepare(`UPDATE couples SET notes = ?, phone = COALESCE(phone, ?),
                  wedding_date = COALESCE(wedding_date, ?) WHERE id = ?`)
        .run(existing.notes ? `${existing.notes}\n\n${note}` : note, phone, parseWeddingDate(weddingText), coupleId);
    } else {
      created = true;
      coupleId = db.prepare(`
        INSERT INTO couples (partner1_name, partner2_name, email, phone, wedding_date, status, notes, budget_total)
        VALUES (?, ?, ?, ?, ?, 'inquiry', ?, 0)
      `).run(partner1, partner2, email, phone, parseWeddingDate(weddingText), note).lastInsertRowid;
    }

    const names = `${partner1} & ${partner2}`;
    const tourNote = tourDates ? `Dates suggested on the website: ${tourDates}` : 'Requested on the website; no dates suggested yet.';
    const openTour = db.prepare(`SELECT id, notes FROM tours WHERE couple_id = ? AND status IN ('requested', 'scheduled')
                                 ORDER BY id DESC LIMIT 1`).get(coupleId);
    if (openTour) {
      // One open tour per couple: a repeat enquiry adds its dates to it.
      db.prepare('UPDATE tours SET notes = ? WHERE id = ?')
        .run(openTour.notes ? `${openTour.notes}\n${tourNote}` : tourNote, openTour.id);
    } else {
      db.prepare(`INSERT INTO tours (couple_id, name, email, phone, status, notes) VALUES (?, ?, ?, ?, 'requested', ?)`)
        .run(coupleId, names, email, phone, tourNote);
    }
    // The website promises a reply within 24 hours.
    const tomorrow = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);
    db.prepare(`INSERT INTO tasks (title, description, couple_id, due_date, priority) VALUES (?, ?, ?, ?, 'high')`)
      .run('Follow up on website enquiry and book their tour',
        `${names} wrote in through the website contact form. The website promises a reply within 24 hours${prefers ? `; they prefer ${prefers}` : ''}.`,
        coupleId, tomorrow);
    return { coupleId, created };
  });

  return { ok: true, ...record() };
}

module.exports = { recordWebsiteEnquiry, parseWeddingDate };
