import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { SunIcon } from '@heroicons/react/24/outline'

// "Today and this week": the same list the 7 am summary email sends, from
// /api/analytics/today (Alberta dates). Only sections with something in them
// are shown.
const day = (iso) => format(parseISO(iso.slice(0, 10)), 'EEE MMM d')
const time = (iso) => (iso && iso.length > 10 ? format(parseISO(iso), 'h:mm a') : '')
const money = (n) => `$${Number(n || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function Section({ title, count, to, children, tone = 'slate' }) {
  const tones = { slate: 'text-slate-500', red: 'text-red-600', violet: 'text-violet-700', blue: 'text-blue-700', emerald: 'text-emerald-700' }
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between mb-1.5">
        <h3 className={`text-xs font-semibold uppercase tracking-wider ${tones[tone]}`}>{title} <span className="text-slate-400 font-normal">({count})</span></h3>
        {to && <Link to={to} className="text-xs text-rose-600 hover:underline flex-shrink-0">Open</Link>}
      </div>
      <ul className="space-y-1">{children}</ul>
    </div>
  )
}

function Row({ to, main, side, alert }) {
  const body = (
    <>
      <span className="truncate text-slate-700">{main}</span>
      {side && <span className={`flex-shrink-0 text-xs ${alert ? 'text-red-600 font-medium' : 'text-slate-400'}`}>{side}</span>}
    </>
  )
  return (
    <li>
      {to
        ? <Link to={to} className="flex items-center justify-between gap-3 text-sm rounded-md px-2 py-1 -mx-2 hover:bg-slate-50">{body}</Link>
        : <div className="flex items-center justify-between gap-3 text-sm px-2 py-1 -mx-2">{body}</div>}
    </li>
  )
}

const MAX = 5
const more = (list, to) => list.length > MAX && (
  <li><Link to={to} className="text-xs text-slate-400 hover:text-rose-600 px-2 -mx-2">+ {list.length - MAX} more</Link></li>
)

export default function TodayPanel({ data }) {
  if (!data) return null
  const s = data
  const client = (id) => (id ? `/clients/${id}` : undefined)
  const sections = []
  if(s.failed_emails?.length) sections.push(<Section key="emails" title="Emails need attention" count={s.failed_emails.length} to="/messages" tone="red">{s.failed_emails.slice(0,MAX).map(e=><Row key={e.id} to={e.couple_id?client(e.couple_id):'/messages'} main={`${e.couple_names||'Venue'} — ${e.kind||'email'}`} side={e.status==='failed'?'Not sent':'Outcome unknown'} alert />)}</Section>)
  if (s.next_actions?.length) sections.push(<Section key="next" title="Next actions due" count={s.next_actions.length} to="/clients" tone="amber">{s.next_actions.slice(0, MAX).map(a => <Row key={a.couple_id} to={client(a.couple_id)} main={`${a.next_action} — ${a.couple_names}`} side={`${day(a.next_action_due)}${a.next_action_owner ? ` · ${a.next_action_owner}` : ''}`} alert={a.next_action_due < s.today} />)}{more(s.next_actions, '/clients')}</Section>)

  if (s.weddings_week.length) sections.push(
    <Section key="w" title="Weddings this week" count={s.weddings_week.length} to="/calendar" tone="emerald">
      {s.weddings_week.slice(0, MAX).map(w => (
        <Row key={w.id} to={client(w.couple_id)} main={w.couple_names}
          side={w.on_site ? 'On site now' : `${day(w.event_date)}${w.end_date !== w.event_date ? ` – ${day(w.end_date)}` : ''}`} />
      ))}
      {more(s.weddings_week, '/calendar')}
    </Section>)

  const tours = [...s.tours_today, ...s.tours_week]
  if (tours.length) sections.push(
    <Section key="t" title="Site tours" count={tours.length} to="/tours" tone="blue">
      {tours.slice(0, MAX).map(t => (
        <Row key={t.id} to={client(t.couple_id)} main={t.name}
          side={t.scheduled_at.slice(0, 10) === s.today ? `Today ${time(t.scheduled_at)}` : `${day(t.scheduled_at)} ${time(t.scheduled_at)}`} />
      ))}
      {more(tours, '/tours')}
    </Section>)

  if (s.tasks_due.length) sections.push(
    <Section key="k" title="Tasks due" count={s.tasks_due.length} to="/tasks" tone={s.tasks_due.some(t => t.overdue) ? 'red' : 'slate'}>
      {s.tasks_due.slice(0, MAX).map(t => (
        <Row key={t.id} to={t.couple_id ? client(t.couple_id) : '/tasks'} main={`${t.title}${t.couple_names ? ` — ${t.couple_names}` : ''}`}
          side={t.overdue ? `Overdue · ${day(t.due_date)}` : 'Today'} alert={t.overdue} />
      ))}
      {more(s.tasks_due, '/tasks')}
    </Section>)

  if (s.payments_due.length) sections.push(
    <Section key="p" title="Payments due (7 days)" count={s.payments_due.length} to="/payments" tone={s.payments_due.some(p => p.overdue) ? 'red' : 'slate'}>
      {s.payments_due.slice(0, MAX).map(p => (
        <Row key={p.id} to={client(p.couple_id)} main={`${p.couple_names} — ${money(p.amount)}`}
          side={p.overdue ? `Overdue · ${day(p.due_date)}` : day(p.due_date)} alert={p.overdue} />
      ))}
      {more(s.payments_due, '/payments')}
    </Section>)

  if (s.contracts_waiting.length) sections.push(
    <Section key="c" title="Waiting for a signature" count={s.contracts_waiting.length} to="/contracts" tone="violet">
      {s.contracts_waiting.slice(0, MAX).map(c => (
        <Row key={c.id} to={client(c.couple_id)} main={c.couple_names} side={c.waiting_on ? `waiting on ${c.waiting_on}` : ''} />
      ))}
      {more(s.contracts_waiting, '/contracts')}
    </Section>)

  if (s.forms_waiting.length) sections.push(
    <Section key="f" title="Forms not returned" count={s.forms_waiting.length} to="/forms">
      {s.forms_waiting.slice(0, MAX).map(f => (
        <Row key={f.id} to={client(f.couple_id)} main={`${f.couple_names} — ${f.title}`} side={`sent ${day(f.link_sent_at)}`} />
      ))}
      {more(s.forms_waiting, '/forms')}
    </Section>)

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <SunIcon className="w-5 h-5 text-amber-500" />
        <h2 className="text-sm font-semibold text-slate-800">Today and this week</h2>
        {s.tour_requests > 0 && (
          <Link to="/tours" className="ml-auto text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-medium hover:bg-blue-100">
            {s.tour_requests} tour request{s.tour_requests === 1 ? '' : 's'} to schedule
          </Link>
        )}
      </div>
      {sections.length
        ? <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">{sections}</div>
        : <p className="text-sm text-slate-400">Nothing booked or due today or this week.</p>}
    </div>
  )
}
