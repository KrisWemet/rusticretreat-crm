// The usual days for each package, matching server/services/bookingRules.js.
// Staff can tick "Custom dates" to use other days; clashes are still checked.
import { addDays, format, parseISO, differenceInCalendarDays, isValid } from 'date-fns'

const RULES = {
  three_day: { length: 3, starts: [5], label: 'Friday to Sunday' },
  five_day: { length: 5, starts: [3, 4, 5], label: 'Wednesday–Sunday, Thursday–Monday or Friday–Tuesday' },
}

export function packageKind(name) {
  if (!name) return null
  if (/\b3[-\s]?day\b/i.test(name)) return 'three_day'
  if (/\b5[-\s]?day\b/i.test(name)) return 'five_day'
  return null
}

export const stayRule = (packageName) => RULES[packageKind(packageName)] || null

const parse = (d) => { const x = d ? parseISO(String(d).slice(0, 10)) : null; return x && isValid(x) ? x : null }

// The check-out for a start date on the package's usual pattern, or null.
export function usualEndDate(start, packageName) {
  const rule = stayRule(packageName)
  const s = parse(start)
  if (!rule || !s) return null
  return format(addDays(s, rule.length - 1), 'yyyy-MM-dd')
}

// Does this stay follow the package's usual days?
export function fitsUsualDays(start, end, packageName) {
  const rule = stayRule(packageName)
  const s = parse(start)
  if (!rule || !s) return true
  const e = parse(end) || addDays(s, rule.length - 1)
  return rule.starts.includes(s.getDay()) && differenceInCalendarDays(e, s) + 1 === rule.length
}

// "Fri Jul 24 – Sun Jul 26, 2027 · 3 days"
export function describeStay(start, end) {
  const s = parse(start)
  if (!s) return ''
  const e = parse(end) || s
  const days = differenceInCalendarDays(e, s) + 1
  if (days < 1) return ''
  const sameYear = s.getFullYear() === e.getFullYear()
  return `${format(s, sameYear ? 'EEE MMM d' : 'EEE MMM d, yyyy')} – ${format(e, 'EEE MMM d, yyyy')} · ${days} day${days === 1 ? '' : 's'}`
}

// A form after its package changed: move the check-out onto the new package's
// usual length, unless the dates are custom.
export function withUsualEnd(form) {
  if (Number(form.custom_dates)) return form
  const usual = usualEndDate(form.event_date, form.package_name)
  return usual ? { ...form, end_date: usual } : form
}
