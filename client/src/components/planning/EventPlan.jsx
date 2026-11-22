import { useEffect, useRef, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { CheckCircleIcon, ExclamationCircleIcon, PrinterIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../../contexts/AuthContext'
import { openPrintable, dayLabel } from '../../utils/files'

// The wedding weekend at a glance: what is still missing, the venue's own
// notes for the day, and the printable event order built from all of it.

const money = (n) => `$${Number(n || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// Where to go to fix each readiness item.
const FIX = {
  contract: { to: '/contracts', label: 'Contracts' },
  deposit: { to: '/payments', label: 'Payments' },
  balance: { to: '/payments', label: 'Payments' },
  guests: { tab: 'guests', label: 'Guests' },
  onsite: { to: '/contracts', label: 'Contracts' },
  runofshow: { tab: 'schedule', label: 'Run of show' },
  vendors: { tab: 'vendors', label: 'Vendors' },
  floorplan: { tab: 'floorplans', label: 'Floor plans' },
  forms: { tab: 'overview', label: 'Forms' },
}

// Turn one of the venue's checklists into dated tasks for this couple.
function ApplyChecklist({ api, coupleId, onApplied }) {
  const [templates, setTemplates] = useState([])
  const [pick, setPick] = useState('')
  const [result, setResult] = useState(null)
  useEffect(() => {
    api.get('/api/task-templates').then(r => { setTemplates(r.data); setPick(r.data[0]?.id || '') }).catch(() => {})
  }, [api])
  if (!templates.length) return null
  const run = async () => {
    try {
      const { data } = await api.post(`/api/task-templates/${pick}/apply`, { couple_id: Number(coupleId) })
      setResult(data); onApplied?.()
      toast.success(`Added ${data.created.length} task${data.created.length === 1 ? '' : 's'}`)
    } catch (err) { toast.error(err.response?.data?.error || 'Could not apply the checklist') }
  }
  return (
    <div className="card p-6">
      <h2 className="font-semibold text-slate-900">Checklists</h2>
      <p className="text-xs text-slate-500 mb-3">Adds the venue’s to-dos for this wedding as tasks, each due a set number of days from check-in, check-out or booking. Nothing is sent to the couple.</p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <label htmlFor="apply-checklist" className="block text-xs font-medium text-slate-600">Checklist</label>
          <select id="apply-checklist" name="apply-checklist" className="input-field w-72" value={pick} onChange={e => setPick(e.target.value)}>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.items.length})</option>)}
          </select>
        </div>
        <button className="btn-secondary" onClick={run} disabled={!pick}>Add tasks</button>
        <Link to="/tasks" className="text-xs text-rose-600 hover:underline ml-auto">Edit checklists on Tasks</Link>
      </div>
      {result && (
        <div className="mt-3 text-sm text-slate-600 space-y-1">
          {result.created.map(t => <div key={t.id}>✓ {t.title} <span className="text-slate-400">· due {dayLabel(t.due_date, { month: 'short', day: 'numeric', year: 'numeric' })}</span></div>)}
          {result.skipped.length > 0 && <div className="text-xs text-slate-400">Skipped {result.skipped.length}: {[...new Set(result.skipped.map(s => s.reason))].join(', ')}.</div>}
        </div>
      )}
    </div>
  )
}

export default function EventPlan({ coupleId, onTab }) {
  const { getAdminAxios } = useAuth()
  const api = useRef(getAdminAxios()).current
  const [eo, setEo] = useState(null)
  const [error, setError] = useState(null)
  const [notes, setNotes] = useState('')
  const [savedNotes, setSavedNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/api/event-order/${coupleId}`)
      setEo(data); setNotes(data.couple.event_notes || ''); setSavedNotes(data.couple.event_notes || ''); setError(null)
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load the event plan')
    }
  }, [api, coupleId])
  useEffect(() => { load() }, [load])

  const saveNotes = async () => {
    setSaving(true)
    try {
      const { data } = await api.put(`/api/event-order/${coupleId}/notes`, { event_notes: notes })
      setSavedNotes(data.event_notes); toast.success('Venue notes saved')
    } catch (err) { toast.error(err.response?.data?.error || 'Could not save the notes') }
    finally { setSaving(false) }
  }

  const print = async (financials) => {
    try { await openPrintable(api, `/api/event-order/${coupleId}/print${financials ? '' : '?financials=0'}`) }
    catch (err) { toast.error(err.message || 'Could not open the event order') }
  }

  if (error) return <div className="card p-6 text-sm text-red-600">{error} <button className="btn-ghost ml-2" onClick={load}>Try again</button></div>
  if (!eo) return <div className="card p-6 text-sm text-slate-400">Loading the event plan…</div>

  const done = eo.readiness.filter(r => r.done).length
  const glance = [
    ['Check-in', eo.check_in ? dayLabel(eo.check_in, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'Not set'],
    ['Check-out', eo.check_out ? dayLabel(eo.check_out, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'Not set'],
    ['Package', eo.package_name || 'Not set'],
    ['Expected guests', eo.booking?.guest_count || (eo.guests.expected ? `${eo.guests.expected} (from guest list)` : 'Not set')],
    ['Ceremony', eo.booking?.ceremony_location || '—'],
    ['Reception', eo.booking?.reception_location || '—'],
    ['Balance', eo.payments.total ? `${money(eo.payments.balance)} of ${money(eo.payments.total)}` : 'No invoices yet'],
    ['Open tasks', eo.tasks_open],
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primary" onClick={() => print(true)}><PrinterIcon className="w-4 h-4" /> Print event order</button>
        <button className="btn-secondary" onClick={() => print(false)} title="The same document with payments left off, for vendors and helpers">
          <PrinterIcon className="w-4 h-4" /> Vendor copy (no prices)
        </button>
        <p className="text-xs text-slate-500 basis-full sm:basis-auto">Built from the booking, signed agreement, run of show, vendors, guests and floor plans.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <h2 className="font-semibold text-slate-900 mb-4">Weekend at a glance</h2>
          <dl className="space-y-2.5">
            {glance.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 text-sm">
                <dt className="text-slate-500">{k}</dt><dd className="font-medium text-slate-900 text-right">{v}</dd>
              </div>
            ))}
          </dl>
          {eo.onsite.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100 text-sm">
              <div className="text-slate-500 mb-1">On-site contacts (from the agreement)</div>
              {eo.onsite.map((c, i) => <div key={i} className="font-medium text-slate-800">{c.name}{c.role ? ` · ${c.role}` : ''}{c.phone ? ` · ${c.phone}` : ''}</div>)}
            </div>
          )}
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">Ready for the weekend?</h2>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${done === eo.readiness.length ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
              {done} of {eo.readiness.length}
            </span>
          </div>
          <ul className="space-y-2">
            {eo.readiness.map(r => {
              const fix = FIX[r.key]
              return (
                <li key={r.key} className="flex items-center gap-2.5 text-sm">
                  {r.done
                    ? <CheckCircleIcon className="w-5 h-5 text-emerald-600 flex-shrink-0" aria-label="Done" />
                    : <ExclamationCircleIcon className="w-5 h-5 text-amber-500 flex-shrink-0" aria-label="Not yet" />}
                  <span className={`flex-1 ${r.done ? 'text-slate-500' : 'text-slate-800 font-medium'}`}>{r.label}</span>
                  {!r.done && fix && (fix.to
                    ? <Link to={fix.to} className="text-xs font-medium text-rose-600 hover:underline">{fix.label}</Link>
                    : <button type="button" onClick={() => onTab?.(fix.tab)} className="text-xs font-medium text-rose-600 hover:underline">{fix.label}</button>)}
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      <ApplyChecklist api={api} coupleId={coupleId} onApplied={load} />

      <div className="card p-6">
        <h2 className="font-semibold text-slate-900">Venue notes for the day</h2>
        <p className="text-xs text-slate-500 mb-3">For the team only: gate and generator plan, who opens up, anything to watch. Printed on the event order.</p>
        <label htmlFor="event-notes" className="sr-only">Venue notes for the day</label>
        <textarea id="event-notes" name="event-notes" rows={5} value={notes} onChange={e => setNotes(e.target.value)}
          className="input-field resize-y" placeholder="e.g. Caterer arrives Saturday 2 PM by the north gate; generator by the gazebo from 4 PM." />
        <div className="flex justify-end mt-3">
          <button className="btn-primary" onClick={saveNotes} disabled={saving || notes === savedNotes}>{saving ? 'Saving…' : 'Save notes'}</button>
        </div>
      </div>
    </div>
  )
}
