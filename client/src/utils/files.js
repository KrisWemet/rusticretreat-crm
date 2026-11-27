// Opening printable pages and files that need the staff login.
//
// A plain link or window navigation sends cookies but not the Authorization
// header, so it would arrive signed out. These fetch with the staff client
// and hand the result to a window the click itself opened (opening it after
// an await is what pop-up blockers refuse).

export async function openPrintable(api, url) {
  const w = window.open('', '_blank')
  if (!w) throw new Error('Allow pop-ups for this site to open the printable copy')
  try {
    const r = await api.get(url, { responseType: 'text' })
    w.document.open()
    w.document.write(r.data)
    w.document.close()
  } catch (err) {
    w.close()
    throw err
  }
}

export async function openFile(api, url) {
  const w = window.open('', '_blank')
  try {
    const r = await api.get(url, { responseType: 'blob' })
    const href = URL.createObjectURL(r.data)
    if (w) w.location.href = href
    else window.location.href = href
    setTimeout(() => URL.revokeObjectURL(href), 60000)
  } catch (err) {
    if (w) w.close()
    throw err
  }
}

export async function downloadFile(api, url, filename) {
  const r = await api.get(url, { responseType: 'blob' })
  const href = URL.createObjectURL(r.data)
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(href), 10000)
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, ch => ESC[ch])

// A simple printable page built in the browser (the run of show for one
// vendor, say). The print rule is last and !important: a later screen rule of
// equal specificity would otherwise win and print the toolbar onto the page.
export function printHtml(title, bodyHtml) {
  const w = window.open('', '_blank')
  if (!w) throw new Error('Allow pop-ups for this site to print')
  w.document.open()
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
body{font-family:Helvetica,Arial,sans-serif;color:#0f172a;margin:28px;font-size:12px;line-height:1.4}
h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:18px 0 6px;border-bottom:1px solid #cbd5e1;padding-bottom:3px}
.muted{color:#64748b}table{border-collapse:collapse;width:100%}td,th{text-align:left;vertical-align:top;padding:4px 8px 4px 0;border-bottom:1px solid #e2e8f0}
td.t{width:72px;font-weight:700;white-space:nowrap}
.bar{margin-bottom:16px}.bar button{background:#e11d48;color:#fff;border:0;border-radius:6px;padding:8px 14px;font-size:13px;cursor:pointer}
@media print { .noprint { display: none !important; } body { margin: 0; } }
</style></head><body><div class="bar noprint"><button onclick="window.print()">Print / Save as PDF</button></div>${bodyHtml}</body></html>`)
  w.document.close()
}

// "2027-08-14" -> "Saturday, August 14", read as a calendar day (no time zone shift).
export function dayLabel(day, opts = { weekday: 'long', month: 'long', day: 'numeric' }) {
  if (!day) return ''
  return new Intl.DateTimeFormat('en-CA', { ...opts, timeZone: 'UTC' }).format(new Date(day + 'T00:00:00Z'))
}

export function daysBetween(start, end) {
  if (!start) return []
  const out = []
  const last = end && end >= start ? end : start
  for (let d = new Date(start + 'T00:00:00Z'); d.toISOString().slice(0, 10) <= last && out.length < 14; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}
