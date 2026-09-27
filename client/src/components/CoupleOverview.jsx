import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'
import { CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'

// Everything about one couple, from /api/couples/:id/overview: their booking,
// payments and balance, contracts and who still has to sign, tasks, tours, the
// emails the CRM sent them, and what staff have done on their record.

const money = (n) => `$${Number(n || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const day = (iso) => (iso ? format(parseISO(String(iso).slice(0, 10)), 'MMM d, yyyy') : '—')
// SQLite timestamps are UTC without a zone marker.
const stamp = (s) => (s ? format(new Date(String(s).replace(' ', 'T') + (String(s).includes('Z') ? '' : 'Z')), 'MMM d, yyyy · h:mm a') : '—')

const EMAIL_KIND = {
  'contract-link': 'Contract signing link', 'contract-signed': 'Contract signed', 'proposal': 'Proposal',
  'payment-reminder': 'Payment reminder', 'payment-receipt': 'Payment receipt', 'form-link': 'Form link',
  'message': 'Message', 'tour-confirmation': 'Tour confirmation',
}

function Card({ title, action, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6 min-w-0">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="font-semibold text-gray-900">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  )
}

const Empty = ({ children }) => <p className="text-sm text-gray-400">{children}</p>

export default function CoupleOverview({ coupleId, api, refreshKey }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [newTask, setNewTask] = useState({ title: '', due_date: '' })
  const [showAllActivity, setShowAllActivity] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/api/couples/${coupleId}/overview`)
      setData(r.data); setError(null)
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load this couple’s records')
    }
  // `api` is a fresh client each render; the couple id is what matters.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coupleId])

  useEffect(() => { load() }, [load, refreshKey])

  const addTask = async (e) => {
    e.preventDefault()
    if (!newTask.title.trim()) return
    try {
      await api.post('/api/tasks', { title: newTask.title.trim(), due_date: newTask.due_date || null, couple_id: Number(coupleId), priority: 'medium' })
      setNewTask({ title: '', due_date: '' })
      load()
    } catch (err) { toast.error(err.response?.data?.error || 'Could not add the task') }
  }

  const toggleTask = async (t) => {
    try { await api.put(`/api/tasks/${t.id}`, { completed: !t.completed }); load() }
    catch (err) { toast.error(err.response?.data?.error || 'Could not update the task') }
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl border border-red-100 p-6 text-sm text-red-600 flex items-center gap-3">
        <ExclamationTriangleIcon className="w-5 h-5" /> {error}
        <button onClick={load} className="ml-auto btn-ghost text-xs">Try again</button>
      </div>
    )
  }
  if (!data) return <div className="bg-white rounded-xl border border-gray-100 p-6 text-sm text-gray-400">Loading records…</div>

  const nextDue = data.invoices.find(i => !i.paid)
  const openTasks = data.tasks.filter(t => !t.completed)
  const doneTasks = data.tasks.filter(t => t.completed)
  const activity = showAllActivity ? data.activity : data.activity.slice(0, 6)

  return (
    <>
      {/* At a glance */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <p className="text-sm text-gray-500">Balance owing</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{money(data.balance.balance)}</p>
          <p className="text-xs text-gray-400 mt-2">{money(data.balance.paid)} paid of {money(data.balance.total)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <p className="text-sm text-gray-500">Next payment</p>
          {nextDue ? (
            <>
              <p className={`text-2xl font-bold mt-1 ${nextDue.overdue ? 'text-red-600' : 'text-gray-900'}`}>{money(nextDue.amount)}</p>
              <p className={`text-xs mt-2 ${nextDue.overdue ? 'text-red-600 font-medium' : 'text-gray-400'}`}>{nextDue.overdue ? 'Overdue since' : 'Due'} {day(nextDue.due_date)}</p>
            </>
          ) : <p className="text-sm text-gray-400 mt-2">{data.invoices.length ? 'All paid' : 'No payment schedule yet'}</p>}
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <p className="text-sm text-gray-500">Stay</p>
          {data.bookings[0] ? (
            <>
              <p className="text-lg font-bold text-gray-900 mt-1">{day(data.bookings[0].event_date)}</p>
              <p className="text-xs text-gray-400 mt-2">{data.bookings[0].package_name || 'No package'}{data.bookings[0].end_date ? ` · until ${day(data.bookings[0].end_date)}` : ''}</p>
            </>
          ) : <p className="text-sm text-gray-400 mt-2">Not booked yet</p>}
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <p className="text-sm text-gray-500">Open tasks</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{openTasks.length}</p>
          <p className="text-xs text-gray-400 mt-2">{openTasks.filter(t => t.due_date && t.due_date < data.today).length} overdue</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payments */}
        <Card title="Payments" action={<Link to="/payments" className="text-sm text-rose-600 hover:underline">Open Payments</Link>}>
          {data.invoices.length === 0 ? <Empty>No invoices yet. Create a payment schedule on the Payments page.</Empty> : (
            <ul className="divide-y divide-gray-50">
              {data.invoices.map(i => (
                <li key={i.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="text-gray-800 truncate">{i.description}</p>
                    <p className={`text-xs ${i.overdue ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                      {i.paid ? `Paid ${day(i.paid_at)}${i.payment_method ? ` · ${i.payment_method}` : ''}` : `${i.overdue ? 'Overdue — was due' : 'Due'} ${day(i.due_date)}`}
                    </p>
                  </div>
                  <span className={`flex-shrink-0 font-medium ${i.paid ? 'text-emerald-600' : 'text-gray-900'}`}>{money(i.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Contracts */}
        <Card title="Contracts" action={<Link to="/contracts" className="text-sm text-rose-600 hover:underline">Open Contracts</Link>}>
          {data.contracts.length === 0 ? <Empty>No contracts yet.</Empty> : (
            <ul className="divide-y divide-gray-50">
              {data.contracts.map(c => {
                const waiting = c.signers.find(s => s.status !== 'signed')
                return (
                  <li key={c.id} className="py-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-gray-800 truncate">{c.title}</p>
                      <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                        c.status === 'signed' ? 'bg-emerald-100 text-emerald-700' : c.status === 'sent' ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600'}`}>
                        {c.status === 'signed' ? 'Signed' : c.status === 'sent' ? 'Out for signature' : 'Draft'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {c.status === 'signed' ? `Signed ${day(c.signed_at)}${c.source === 'external' ? ' (outside the CRM)' : ''}`
                        : c.status === 'sent' ? `Waiting on ${waiting?.name || 'a signer'}${c.signing_expires_at ? ` · link expires ${day(c.signing_expires_at)}` : ''}`
                        : `Created ${day(c.created_at)}`}
                    </p>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        {/* Tasks */}
        <Card title="Tasks">
          <form onSubmit={addTask} className="flex flex-wrap gap-2 mb-3">
            <input value={newTask.title} onChange={e => setNewTask(t => ({ ...t, title: e.target.value }))}
              placeholder="Add a task for this couple…" aria-label="New task" className="input-field flex-1 min-w-[10rem]" />
            <input type="date" value={newTask.due_date} onChange={e => setNewTask(t => ({ ...t, due_date: e.target.value }))}
              aria-label="Due date" className="input-field w-auto" />
            <button type="submit" className="btn-secondary" disabled={!newTask.title.trim()}>Add</button>
          </form>
          {data.tasks.length === 0 ? <Empty>No tasks for this couple.</Empty> : (
            <ul className="space-y-1">
              {[...openTasks, ...doneTasks.slice(0, 3)].map(t => (
                <li key={t.id} className="flex items-center gap-3 text-sm">
                  <button onClick={() => toggleTask(t)} aria-label={t.completed ? 'Mark not done' : 'Mark done'}
                    className={`w-4 h-4 flex-shrink-0 rounded border ${t.completed ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 hover:border-emerald-500'}`} />
                  <span className={`flex-1 min-w-0 truncate ${t.completed ? 'line-through text-gray-400' : 'text-gray-800'}`}>{t.title}</span>
                  {t.due_date && !t.completed && (
                    <span className={`flex-shrink-0 text-xs ${t.due_date < data.today ? 'text-red-600 font-medium' : 'text-gray-400'}`}>{day(t.due_date)}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Bookings & tours */}
        <Card title="Bookings and tours" action={<Link to="/tours" className="text-sm text-rose-600 hover:underline">Open Site Tours</Link>}>
          {data.bookings.length === 0 && data.tours.length === 0 ? <Empty>No booking or tour yet.</Empty> : (
            <ul className="divide-y divide-gray-50">
              {data.bookings.map(b => (
                <li key={`b${b.id}`} className="py-2 text-sm flex justify-between gap-3">
                  <span className="text-gray-800">Booking: {day(b.event_date)}{b.end_date ? ` – ${day(b.end_date)}` : ''}</span>
                  <span className="text-xs text-gray-400 flex-shrink-0">{b.package_name}{b.guest_count ? ` · ${b.guest_count} guests` : ''}</span>
                </li>
              ))}
              {data.tours.map(t => (
                <li key={`t${t.id}`} className="py-2 text-sm flex justify-between gap-3">
                  <span className="text-gray-800">Tour: {t.scheduled_at ? format(parseISO(t.scheduled_at), 'MMM d, yyyy · h:mm a') : t.preferred_date ? `asked for ${day(t.preferred_date)}` : 'no date yet'}</span>
                  <span className="text-xs text-gray-400 flex-shrink-0 capitalize">{t.status}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Emails */}
        <Card title="Emails sent">
          {data.emails.length === 0 ? <Empty>The CRM hasn’t emailed this couple yet.</Empty> : (
            <ul className="divide-y divide-gray-50">
              {data.emails.map(e => (
                <li key={e.id} className="py-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-gray-800 truncate">{e.subject}</p>
                    {e.delivered
                      ? <CheckCircleIcon className="w-4 h-4 text-emerald-500 flex-shrink-0" title="Delivered to the mail service" />
                      : <span className="text-xs text-red-600 flex-shrink-0" title={e.error || ''}>Not sent</span>}
                  </div>
                  <p className="text-xs text-gray-400 truncate">{EMAIL_KIND[e.kind] || e.kind || 'Email'} · {stamp(e.at)} · to {e.to_addr}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Activity */}
        <Card title="History" action={data.activity.length > 6 && (
          <button onClick={() => setShowAllActivity(v => !v)} className="text-sm text-rose-600 hover:underline">{showAllActivity ? 'Show less' : `Show all ${data.activity.length}`}</button>
        )}>
          {data.activity.length === 0 ? <Empty>Nothing recorded yet. Archiving, payments marked paid, deletions and similar changes will show here.</Empty> : (
            <ul className="space-y-2">
              {activity.map(a => (
                <li key={a.id} className="text-sm">
                  <p className="text-gray-800">{a.summary || a.action}</p>
                  <p className="text-xs text-gray-400">{stamp(a.at)}{a.user_name ? ` · ${a.user_name}` : ''}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
