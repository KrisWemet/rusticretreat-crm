import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '../../contexts/AuthContext'
import { dayLabel } from '../../utils/files'
import FinalDetailsFields, { QuoteSummary, emptyValues, fdMoney } from '../FinalDetailsFields'

// The Final Details Form for one couple (rental agreement Section 2.3): send
// the link, or take the numbers by phone; then review what came in and create
// the overage invoice. Nothing is emailed unless staff press the button.

const day = (d) => dayLabel(d, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
const when = (s) => (s ? new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Edmonton' }).format(new Date(s.replace(' ', 'T') + 'Z')).replace(/\s?a\.m\./, ' AM').replace(/\s?p\.m\./, ' PM') : '')

export default function FinalDetailsCard({ api, coupleId, onChanged }) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [v, setV] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [values, setValues] = useState(emptyValues())
  const [quote, setQuote] = useState(null)
  const [confirmedBy, setConfirmedBy] = useState('')
  const [nights, setNights] = useState('')

  const apply = (data) => { setV(data); setNights(data.nights || ''); setQuote(data.quote) }
  const load = useCallback(async () => {
    try { const { data } = await api.get(`/api/final-details/couple/${coupleId}`); apply(data); setError(null) }
    catch (err) { setError(err.response?.data?.error || 'Could not load the Final Details Form') }
  }, [api, coupleId])
  useEffect(() => { load() }, [load])

  // Live price while staff type the couple's numbers in.
  useEffect(() => {
    if (!editing) return
    const t = setTimeout(() => {
      api.post(`/api/final-details/couple/${coupleId}/quote`, values).then(r => setQuote(r.data)).catch(() => {})
    }, 350)
    return () => clearTimeout(t)
  }, [editing, values, api, coupleId])

  const act = async (fn, ok) => {
    setBusy(true)
    try { const { data } = await fn(); apply(data); if (ok) toast.success(typeof ok === 'function' ? ok(data) : ok); onChanged?.(); return data }
    catch (err) { toast.error(err.response?.data?.error || 'Something went wrong'); return null }
    finally { setBusy(false) }
  }

  const copy = async (url) => {
    try { await navigator.clipboard.writeText(url); toast.success('Link copied. Paste it into a text or email to the couple.') }
    catch { toast('Select the link below and copy it', { icon: '📋' }) }
  }
  const makeLink = async () => {
    const data = await act(() => api.post(`/api/final-details/couple/${coupleId}/link`, {}))
    if (data?.link) copy(data.link)
  }
  const emailLink = () => {
    if (!confirm('Email the Final Details Form link to the couple now?')) return
    act(() => api.post(`/api/final-details/couple/${coupleId}/link`, { send_email: true }),
      d => (d.emailed?.delivered ? 'Link emailed to the couple' : `Link made, but the email was not sent${d.emailed?.error ? `: ${d.emailed.error}` : ''}. Copy it instead.`))
  }
  const saveNights = () => act(() => api.put(`/api/final-details/couple/${coupleId}`, { nights: Number(nights) }), 'Nights saved')
  const startEditing = () => { setValues(emptyValues(v.record || {})); setQuote(v.quote); setEditing(true) }
  const saveDraft = () => act(() => api.put(`/api/final-details/couple/${coupleId}`, values), 'Saved. Not submitted yet.')
  const submitForThem = async () => {
    if (!confirm('Submit and lock these numbers for the couple? The couple’s link will then show them as final.')) return
    const data = await act(() => api.post(`/api/final-details/couple/${coupleId}/submit`, { ...values, confirmed_by: confirmedBy }), 'Submitted and locked')
    if (data) setEditing(false)
  }
  const approve = () => {
    const total = v.quote?.total || 0
    if (!confirm(total > 0 ? `Approve and create an overage invoice for ${fdMoney(total)}?` : 'Approve? Nothing is owing, so no invoice is made.')) return
    act(() => api.post(`/api/final-details/couple/${coupleId}/approve`, {}), total > 0 ? 'Approved. Overage invoice created.' : 'Approved')
  }
  const unlock = () => {
    const reason = prompt('Reopen this form so the numbers can change? Its unpaid overage invoice will be withdrawn.\n\nWhy? (kept in the activity log)')
    if (reason === null) return
    act(() => api.post(`/api/final-details/couple/${coupleId}/unlock`, { reason }), 'Form reopened')
  }

  if (error) return <div id="final-details-card" className="card p-6 text-sm text-red-600">{error}</div>
  if (!v) return <div id="final-details-card" className="card p-6 text-sm text-slate-400">Loading the Final Details Form…</div>

  const rec = v.record
  const submitted = !!rec?.submitted_at
  const status = !rec?.access_token && !submitted ? ['Not sent yet', 'bg-slate-100 text-slate-600']
    : !submitted ? [rec.link_sent_at ? `Link emailed ${when(rec.link_sent_at)}` : 'Link made, waiting for the couple', 'bg-sky-100 text-sky-700']
    : !rec.reviewed_at ? ['Submitted: needs your review', 'bg-amber-100 text-amber-700']
    : ['Reviewed', 'bg-emerald-100 text-emerald-700']

  return (
    <div id="final-details-card" className="card p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-slate-900">Final Details Form</h2>
          <p className="text-xs text-slate-500">Final guests, campers, tents, RVs and extras (agreement Section 2.3). Locked once submitted.</p>
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${status[1]}`}>{status[0]}</span>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <div><span className="text-slate-500">Due </span><span className={`font-medium ${v.overdue ? 'text-red-600' : 'text-slate-800'}`}>{v.deadline ? day(v.deadline) : 'no check-in date yet'}{v.overdue ? ' (overdue)' : ''}</span></div>
        <div className="flex items-center gap-2">
          <label htmlFor={`fd-nights-${coupleId}`} className="text-slate-500">Nights charged</label>
          {submitted
            ? <span className="font-medium text-slate-800">{v.nights || '—'}</span>
            : <>
                <input id={`fd-nights-${coupleId}`} name="fd-nights" type="number" min="1" max="30" value={nights} onChange={e => setNights(e.target.value)} className="input-field w-16 py-1" />
                {String(nights) !== String(v.nights || '') && nights !== '' && <button className="text-xs text-rose-600 hover:underline" onClick={saveNights} disabled={busy}>Save</button>}
              </>}
        </div>
      </div>

      {!submitted && !editing && (
        <>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={emailLink} disabled={busy}>Email the link to the couple</button>
            <button className="btn-secondary" onClick={() => (v.link ? copy(v.link) : makeLink())} disabled={busy}>{v.link ? 'Copy link' : 'Make a link to copy'}</button>
            <button className="btn-ghost" onClick={startEditing} disabled={busy}>Fill it in for them</button>
          </div>
          {v.link && (
            <div>
              <label htmlFor={`fd-link-${coupleId}`} className="sr-only">The couple’s Final Details link</label>
              <input id={`fd-link-${coupleId}`} name="fd-link" readOnly value={v.link} onFocus={e => e.target.select()} className="input-field text-xs text-slate-600" />
              <p className="text-xs text-slate-500 mt-1">Making or emailing a new link replaces this one.</p>
            </div>
          )}
          {(rec?.guests != null || rec?.extras?.length > 0) && <p className="text-xs text-slate-500">A draft has been saved but not submitted.</p>}
        </>
      )}

      {!submitted && editing && (
        <div className="space-y-4 border-t border-slate-100 pt-4">
          <FinalDetailsFields rates={v.rates} offered={v.offered} values={values} onChange={setValues} nights={v.nights} idPrefix={`fds-${coupleId}`} />
          <QuoteSummary quote={quote} />
          <div>
            <label htmlFor={`fd-confirmed-${coupleId}`} className="block text-sm font-medium text-slate-800">Who confirmed these numbers?</label>
            <input id={`fd-confirmed-${coupleId}`} name="fd-confirmed" value={confirmedBy} onChange={e => setConfirmedBy(e.target.value)}
              placeholder="e.g. Ava, by phone on Tuesday" className="input-field" />
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <button className="btn-ghost" onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
            <button className="btn-secondary" onClick={saveDraft} disabled={busy}>Save draft</button>
            <button className="btn-primary" onClick={submitForThem} disabled={busy || !confirmedBy.trim() || quote?.errors?.length > 0}>Submit and lock</button>
          </div>
        </div>
      )}

      {submitted && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Submitted by <span className="font-medium text-slate-800">{rec.submitted_name}</span>{rec.submitted_by && rec.submitted_by !== 'couple' ? ` (entered by ${rec.submitted_by.replace(/^staff \((.*)\)$/, '$1')})` : ''} on {when(rec.submitted_at)}.</p>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            {[['Guests', rec.guests], ['Overnight campers', rec.campers], ['Tents', rec.tents], ['RVs', rec.rvs]].map(([k, n]) => (
              <div key={k} className="rounded-lg bg-slate-50 px-3 py-2"><dt className="text-xs text-slate-500">{k}</dt><dd className="text-lg font-semibold text-slate-900">{n}</dd></div>
            ))}
          </dl>
          {!!rec.rv_over_30ft && <p className="text-xs text-amber-700">One or more RVs is over 30 ft: send them the alternate exit route.</p>}
          {rec.extras.length > 0 && <p className="text-sm text-slate-700"><span className="text-slate-500">Extras: </span>{rec.extras.map(e => `${e.name} × ${e.quantity}`).join(' · ')}</p>}
          {rec.notes && <p className="text-sm text-slate-700 whitespace-pre-wrap"><span className="text-slate-500">Notes: </span>{rec.notes}</p>}
          <QuoteSummary quote={v.quote} title="Overage fees (as submitted)" />
          <div className="flex flex-wrap items-center gap-2">
            {!rec.reviewed_at && (
              <button className="btn-primary" onClick={approve} disabled={busy}>
                {v.quote?.total > 0 ? `Approve and create invoice (${fdMoney(v.quote.total)})` : 'Approve (nothing owing)'}
              </button>
            )}
            {rec.reviewed_at && v.invoice && (
              <p className="text-sm text-slate-700">Overage invoice {fdMoney(v.invoice.amount)}, due {day(v.invoice.due_date)}: <span className={v.invoice.paid ? 'text-emerald-700 font-medium' : 'text-amber-700 font-medium'}>{v.invoice.paid ? 'paid' : 'not paid yet'}</span>. <Link to="/payments" className="text-rose-600 hover:underline">Payments</Link></p>
            )}
            {rec.reviewed_at && !v.invoice && <p className="text-sm text-slate-600">Reviewed by {rec.reviewed_by}. Nothing owing.</p>}
            {isAdmin && !v.invoice?.paid && <button className="btn-ghost text-xs ml-auto" onClick={unlock} disabled={busy}>Reopen form</button>}
          </div>
        </div>
      )}
    </div>
  )
}
