// The venue calendar as an iCalendar (RFC 5545) feed, for Google Calendar,
// Outlook or Apple Calendar to subscribe to. Weddings, holds and blocked dates
// are all-day events; scheduled site tours are timed, in Alberta time.

const TZ = 'America/Edmonton';

// Text values escape backslash, semicolon, comma and newline.
const text = (v) => String(v ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// Lines longer than 75 octets are folded with CRLF and a space.
function fold(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const out = [];
  let start = 0;
  while (start < bytes.length) {
    let end = Math.min(start + (out.length ? 74 : 75), bytes.length);
    // Never split a multi-byte character.
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    out.push((out.length ? ' ' : '') + bytes.slice(start, end).toString('utf8'));
    start = end;
  }
  return out.join('\r\n');
}

const ymd = (day) => day.replace(/-/g, '');
const nextDay = (day) => { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
const utcStamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

// "2027-07-04T14:30" on Alberta's clock -> the UTC instant. Asks Intl for the
// offset on that date rather than assuming one: tzdata 2026c keeps Alberta on
// UTC-6 all year where older releases switched in winter.
function albertaToUtc(local) {
  const [d, t = '00:00'] = String(local).split(/[T ]/);
  const [Y, M, D] = d.split('-').map(Number);
  const [h, m] = t.split(':').map(Number);
  const wall = Date.UTC(Y, M - 1, D, h || 0, m || 0);
  let guess = wall;
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  for (let i = 0; i < 2; i++) {
    const p = Object.fromEntries(fmt.formatToParts(new Date(guess)).map(x => [x.type, x.value]));
    const seen = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
    guess = wall - (seen - guess);
  }
  return new Date(guess);
}

function buildIcs({ booked = [], holds = [], blocked = [], tours = [] }, { baseUrl = '', now = new Date() } = {}) {
  const stamp = utcStamp(now);
  const link = (coupleId) => (baseUrl && coupleId ? `${baseUrl.replace(/\/+$/, '')}/clients/${coupleId}` : '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Rustic Retreat//CRM//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:Rustic Retreat', `X-WR-TIMEZONE:${TZ}`, 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H'];
  const allDay = (uid, start, end, summary, description, url) => {
    lines.push('BEGIN:VEVENT', `UID:${uid}@rusticretreat-crm`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(start)}`, `DTEND;VALUE=DATE:${ymd(nextDay(end && end >= start ? end : start))}`,
      `SUMMARY:${text(summary)}`, 'TRANSP:TRANSPARENT');
    if (description) lines.push(`DESCRIPTION:${text(description)}`);
    if (url) lines.push(`URL:${url}`);
    lines.push('END:VEVENT');
  };

  for (const b of booked) {
    const names = `${b.partner1_name} & ${b.partner2_name}`;
    allDay(`booking-${b.id}`, b.event_date, b.end_date, `Wedding: ${names}${b.package_name ? ` (${b.package_name})` : ''}`,
      [b.guest_count ? `${b.guest_count} guests` : '', link(b.couple_id)].filter(Boolean).join('\n'), link(b.couple_id));
  }
  for (const h of holds) {
    const names = `${h.partner1_name} & ${h.partner2_name}`;
    allDay(`hold-${h.kind}-${h.id}`, h.event_date, h.end_date, `Hold: ${names} (${h.kind === 'contract' ? 'contract out' : 'proposal out'})`,
      link(h.couple_id), link(h.couple_id));
  }
  for (const d of blocked) allDay(`blocked-${d.id}`, d.date, d.date, `Blocked${d.reason ? `: ${d.reason}` : ''}`, '', '');
  for (const t of tours) {
    if (!t.scheduled_at) continue;
    const start = albertaToUtc(t.scheduled_at);
    if (Number.isNaN(start.getTime())) continue;
    const end = new Date(start.getTime() + 60 * 60000);
    lines.push('BEGIN:VEVENT', `UID:tour-${t.id}@rusticretreat-crm`, `DTSTAMP:${stamp}`, `DTSTART:${utcStamp(start)}`, `DTEND:${utcStamp(end)}`,
      `SUMMARY:${text(`Site tour: ${t.name}`)}`);
    if (link(t.couple_id)) lines.push(`URL:${link(t.couple_id)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

module.exports = { buildIcs, albertaToUtc, fold, text };
