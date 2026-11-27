import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '../../contexts/AuthContext'
import { dayLabel } from '../../utils/files'

// The damage deposit for one couple (rental agreement Section 4.2): received at
// check-in → inspection within 48 hours of check-out → refund sent. Held money,
// not income, so it never shows as an invoice. Nothing is emailed unless staff
// press "Email the couple a statement".

const money = (n) => `$${Number(n || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const day = (d) => dayLabel(d, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
const todayLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton' }).format(new Date())

const STATUS = {
  to_collect: ['To collect at check-in', 'bg-slate-100 text-slate-600'],
  held: ['Holding', 'bg-sky-100 text-sky-700'],
  refund_due: ['Refund to send', 'bg-amber-100 text-amber-700'],
  refunded: ['Refunded', 'bg-emerald-100 text-emerald-700'],
  kept: ['Kept (deductions)', 'bg-slate-200 text-slate-700'],
}

function Field({ id, label, children }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-medium text-slate-600">{label}</label>
      {children}
    </div>
  )
}

export default function DamageDepositCard({ api, coupleId, onChanged }) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [v, setV] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState(null) // null | 'receive' | 'inspect' | 'refund'
  const [form, setForm] = useState({})
  const [deductions, setDeductions] = useState([])
  const set = (k, val) => setForm(f => ({ ...f, [k]: val }))
  const p = `dd-${coupleId}`

  const load = useCallback(async () => {
    try { const { data } = await api.get(`/api/damage-deposits/couple/${coupleId}`); setV(data); setError(null) }
    catch (err) { setError(err.response?.data?.error || 'Could not load the damage deposit') }
  }, [api, coupleId])
  useEffect(() => { load() }, [load])

  const act = async (fn, ok) => {
    setBusy(true)
    try { const { data } = await fn(); setV(data); setMode(null); if (ok) toast.success(typeof ok === 'function' ? ok(data) : ok); onChanged?.(); return data }
    catch (err) { toast.error(err.response?.data?.error || 'Something went wrong'); return null }
    finally { setBusy(false) }
  }

  if (error) return <div className="card p-6 text-sm text-red-600">{error}</div>
  if (!v) return <div className="card p-6 text-sm text-slate-400">Loading the damage deposit…</div>

  const rec = v.record
  const [statusLabel, statusTone] = STATUS[v.status]
  const cats = Object.fromEntries(v.categories.map(c => [c.key, c]))
  const deductTotal = deductions.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0)
  const received = rec?.received_at ? v.received : 0

  const openReceive = () => { setForm({ date: todayLocal(), amount: v.agreed_amount, method: 'e-Transfer', reference: '' }); setMode('receive') }
  const openInspect = () => {
    setForm({ date: rec?.inspected_at || todayLocal(), notes: rec?.inspection_notes || '' })
    setDeductions((rec?.deductions || []).map(d => ({ ...d })))
    setMode('inspect')
  }
  const openRefund = () => { setForm({ date: todayLocal(), method: 'e-Transfer', reference: '' }); setMode('refund') }
  const addDeduction = () => setDeductions(ds => [...ds, { category: 'damage', description: '', amount: '', quantity: 1 }])
  const setDeduction = (i, k, val) => setDeductions(ds => ds.map((d, j) => {
    if (j !== i) return d
    const next = { ...d, [k]: val }
    // A tree is at least $500 each: fill that in when chosen or counted.
    const c = cats[next.category]
    if (c?.minimum && (k === 'category' || k === 'quantity')) next.amount = String(c.minimum * (Number(next.quantity) || 1))
    return next
  }))

  const statement = () => {
    if (!confirm('Email the couple a statement of their damage deposit (received, any deductions and the refund)?')) return
    act(() => api.post(`/api/damage-deposits/couple/${coupleId}/statement`, {}),
      d => (d.emailed?.delivered ? 'Statement emailed to the couple' : `Not sent${d.emailed?.error ? `: ${d.emailed.error}` : ''}`))
  }
  const undo = () => {
    const reason = prompt('Undo the last step recorded for this damage deposit?\n\nWhy? (kept in the activity log)')
    if (reason === null) return
    act(() => api.post(`/api/damage-deposits/couple/${coupleId}/undo`, { reason }), 'Undone')
  }

  return (
    <div id="damage-deposit-card" className="card p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-slate-900">Damage deposit</h2>
          <p className="text-xs text-slate-500">{money(v.agreed_amount)}, due at check-in; inspection within 48 hours of check-out (agreement Section 4.2). Held money, not income.</p>
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusTone}`}>{statusLabel}</span>
      </div>

      {/* What has happened so far */}
      <ol className="space-y-1.5 text-sm">
        <li className="flex flex-wrap gap-x-2">
          <span className="text-slate-500 w-24">Received</span>
          {rec?.received_at
            ? <span className="text-slate-800">{money(v.received)} on {day(rec.received_at)} by {rec.received_method}{rec.received_reference ? ` (ref ${rec.received_reference})` : ''}</span>
            : <span className="text-slate-400">Not yet{v.stay?.check_in ? `: check-in ${day(v.stay.check_in)}` : ''}</span>}
        </li>
        <li className="flex flex-wrap gap-x-2">
          <span className="text-slate-500 w-24">Inspection</span>
          {rec?.inspected_at
            ? <span className="text-slate-800">{day(rec.inspected_at)}{rec.inspected_by ? ` by ${rec.inspected_by}` : ''}: {rec.deductions.length ? `${money(v.deducted)} in deductions` : 'no deductions'}</span>
            : <span className={v.inspection_overdue ? 'text-red-600 font-medium' : 'text-slate-400'}>{v.inspection_due ? `Due by ${day(v.inspection_due)}${v.inspection_overdue ? ' (overdue)' : ''}` : 'Not yet'}</span>}
        </li>
        {rec?.deductions?.length > 0 && (
          <li className="pl-0 sm:pl-[6.5rem]">
            <ul className="text-xs text-slate-600 space-y-0.5">
              {rec.deductions.map((d, i) => <li key={i}>{d.label}{d.quantity > 1 ? ` (${d.quantity})` : ''}: {d.description} · {money(d.amount)}</li>)}
            </ul>
            {rec.inspection_notes && <p className="text-xs text-slate-500 mt-1 whitespace-pre-wrap">{rec.inspection_notes}</p>}
          </li>
        )}
        <li className="flex flex-wrap gap-x-2">
          <span className="text-slate-500 w-24">Refund</span>
          {rec?.refunded_at
            ? <span className="text-slate-800">{money(v.refunded)} sent {day(rec.refunded_at)} by {rec.refund_method}{rec.refund_reference ? ` (ref ${rec.refund_reference})` : ''}</span>
            : v.status === 'refund_due' ? <span className="text-amber-700 font-medium">{money(v.refund_due)} to send</span>
            : v.status === 'kept' ? <span className="text-slate-700">None: the deductions use up the deposit</span>
            : <span className="text-slate-400">After the inspection</span>}
        </li>
      </ol>

      {v.excess > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-100 p-3 text-sm text-amber-800 flex flex-wrap items-center gap-2">
          <span>The deductions are {money(v.excess)} more than the deposit.</span>
          {v.excess_invoice
            ? <span>Invoiced, due {day(v.excess_invoice.due_date)}: {v.excess_invoice.paid ? 'paid' : 'not paid yet'}. <Link to="/payments" className="underline">Payments</Link></span>
            : <button className="btn-secondary text-xs ml-auto" disabled={busy}
                onClick={() => confirm(`Create an invoice for ${money(v.excess)}?`) && act(() => api.post(`/api/damage-deposits/couple/${coupleId}/excess-invoice`, {}), 'Invoice created')}>
                Create an invoice for {money(v.excess)}</button>}
        </div>
      )}

      {/* The next step */}
      {!mode && (
        <div className="flex flex-wrap items-center gap-2">
          {v.status === 'to_collect' && <button className="btn-primary" onClick={openReceive} disabled={busy}>Record deposit received</button>}
          {(v.status === 'to_collect' || v.status === 'held') && (
            <button className={v.status === 'held' ? 'btn-primary' : 'btn-ghost'} onClick={openInspect} disabled={busy}>Record the inspection</button>
          )}
          {v.status === 'refund_due' && <button className="btn-primary" onClick={openRefund} disabled={busy}>Record refund sent ({money(v.refund_due)})</button>}
          {rec?.inspected_at && !rec.refunded_at && !rec.excess_invoice_id && <button className="btn-ghost" onClick={openInspect} disabled={busy}>Change the inspection</button>}
          {rec?.inspected_at && (
            <button className="btn-ghost" onClick={statement} disabled={busy}>Email the couple a statement{rec.statement_sent_at ? ' again' : ''}</button>
          )}
          {isAdmin && (rec?.received_at || rec?.inspected_at) && <button className="btn-ghost text-xs ml-auto" onClick={undo} disabled={busy}>Undo last step</button>}
        </div>
      )}

      {mode === 'receive' && (
        <form className="space-y-3 border-t border-slate-100 pt-4" onSubmit={e => { e.preventDefault(); act(() => api.post(`/api/damage-deposits/couple/${coupleId}/received`, form), 'Deposit recorded') }}>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <Field id={`${p}-date`} label="Date received"><input id={`${p}-date`} name="dd-date" type="date" required max={todayLocal()} className="input-field" value={form.date} onChange={e => set('date', e.target.value)} /></Field>
            <Field id={`${p}-amount`} label="Amount ($)"><input id={`${p}-amount`} name="dd-amount" type="number" min="1" step="0.01" required className="input-field" value={form.amount} onChange={e => set('amount', e.target.value)} /></Field>
            <Field id={`${p}-method`} label="How"><select id={`${p}-method`} name="dd-method" className="input-field" value={form.method} onChange={e => set('method', e.target.value)}>{v.methods.map(m => <option key={m}>{m}</option>)}</select></Field>
            <Field id={`${p}-ref`} label="Reference (optional)"><input id={`${p}-ref`} name="dd-ref" className="input-field" value={form.reference} onChange={e => set('reference', e.target.value)} placeholder="e-Transfer ref" /></Field>
          </div>
          <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setMode(null)}>Cancel</button><button className="btn-primary" disabled={busy}>Save</button></div>
        </form>
      )}

      {mode === 'inspect' && (
        <form className="space-y-3 border-t border-slate-100 pt-4" onSubmit={e => { e.preventDefault(); act(() => api.post(`/api/damage-deposits/couple/${coupleId}/inspection`, { ...form, deductions }), 'Inspection saved') }}>
          <Field id={`${p}-idate`} label="Inspected on"><input id={`${p}-idate`} name="dd-idate" type="date" required max={todayLocal()} className="input-field w-48" value={form.date} onChange={e => set('date', e.target.value)} /></Field>
          <div>
            <div className="text-xs font-medium text-slate-600 mb-1">Deductions <span className="font-normal text-slate-400">(leave empty if everything was fine)</span></div>
            <div className="space-y-2">
              {deductions.map((d, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end rounded-lg bg-slate-50 p-2">
                  <div className="col-span-12 sm:col-span-4">
                    <label htmlFor={`${p}-cat-${i}`} className="sr-only">Reason</label>
                    <select id={`${p}-cat-${i}`} name={`dd-cat-${i}`} className="input-field" value={d.category} onChange={e => setDeduction(i, 'category', e.target.value)}>
                      {v.categories.map(c => <option key={c.key} value={c.key}>{c.label}{c.minimum ? ` ($${c.minimum} min each)` : ''}</option>)}
                    </select>
                  </div>
                  <div className="col-span-12 sm:col-span-4">
                    <label htmlFor={`${p}-desc-${i}`} className="sr-only">What happened</label>
                    <input id={`${p}-desc-${i}`} name={`dd-desc-${i}`} className="input-field" required placeholder="What happened (the couple sees this)" value={d.description} onChange={e => setDeduction(i, 'description', e.target.value)} />
                  </div>
                  {cats[d.category]?.per && (
                    <div className="col-span-4 sm:col-span-1">
                      <label htmlFor={`${p}-qty-${i}`} className="block text-[11px] text-slate-500">{cats[d.category].per}s</label>
                      <input id={`${p}-qty-${i}`} name={`dd-qty-${i}`} type="number" min="1" step="1" className="input-field" value={d.quantity} onChange={e => setDeduction(i, 'quantity', e.target.value)} />
                    </div>
                  )}
                  <div className={cats[d.category]?.per ? 'col-span-5 sm:col-span-2' : 'col-span-9 sm:col-span-3'}>
                    <label htmlFor={`${p}-amt-${i}`} className="sr-only">Amount</label>
                    <input id={`${p}-amt-${i}`} name={`dd-amt-${i}`} type="number" min="0.01" step="0.01" required className="input-field" placeholder="$" value={d.amount} onChange={e => setDeduction(i, 'amount', e.target.value)} />
                  </div>
                  <button type="button" className="col-span-3 sm:col-span-1 text-xs text-red-600 hover:underline pb-2" onClick={() => setDeductions(ds => ds.filter((_, j) => j !== i))}>Remove</button>
                </div>
              ))}
            </div>
            <button type="button" className="btn-ghost text-xs mt-2" onClick={addDeduction}>+ Add a deduction</button>
          </div>
          <Field id={`${p}-notes`} label="Notes (staff only)"><textarea id={`${p}-notes`} name="dd-notes" rows={2} className="input-field" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="e.g. walked the site with the couple at 11 AM; photos in Files & notes" /></Field>
          <p className="text-sm text-slate-700">
            Received {money(received)} − deductions {money(deductTotal)} = <strong>{deductTotal > received ? `${money(deductTotal - received)} owed beyond the deposit` : `${money(received - deductTotal)} to refund`}</strong>
          </p>
          <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setMode(null)}>Cancel</button><button className="btn-primary" disabled={busy}>Save inspection</button></div>
        </form>
      )}

      {mode === 'refund' && (
        <form className="space-y-3 border-t border-slate-100 pt-4" onSubmit={e => { e.preventDefault(); act(() => api.post(`/api/damage-deposits/couple/${coupleId}/refund`, form), 'Refund recorded') }}>
          <p className="text-sm text-slate-700">Refund <strong>{money(v.refund_due)}</strong> ({money(v.received)} received − {money(v.deducted)} in deductions).</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field id={`${p}-rdate`} label="Date sent"><input id={`${p}-rdate`} name="dd-rdate" type="date" required max={todayLocal()} className="input-field" value={form.date} onChange={e => set('date', e.target.value)} /></Field>
            <Field id={`${p}-rmethod`} label="How"><select id={`${p}-rmethod`} name="dd-rmethod" className="input-field" value={form.method} onChange={e => set('method', e.target.value)}>{v.methods.map(m => <option key={m}>{m}</option>)}</select></Field>
            <Field id={`${p}-rref`} label="Reference (optional)"><input id={`${p}-rref`} name="dd-rref" className="input-field" value={form.reference} onChange={e => set('reference', e.target.value)} /></Field>
          </div>
          <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setMode(null)}>Cancel</button><button className="btn-primary" disabled={busy}>Save</button></div>
        </form>
      )}
    </div>
  )
}
