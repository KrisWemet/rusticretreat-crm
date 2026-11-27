import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { dayLabel } from '../../utils/files'

// Extras billed to one couple after booking: propane phoned in, consumables
// counted at check-out, the linen laundry fee. Each order becomes its own
// invoice, one line per extra plus GST, so the signed payment schedule stays as
// it is. Prices are for the year of the couple's stay; a placeholder price has
// to be typed over.

const money = (n) => `$${Number(n || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const day = (d) => (d ? dayLabel(d, { month: 'short', day: 'numeric', year: 'numeric' }) : '')
const r2 = (n) => Math.round(Number(n) * 100) / 100
const qtyText = (q) => (Number.isInteger(Number(q)) ? String(Number(q)) : Number(q).toFixed(2))

export default function ExtrasCard({ api, coupleId, onChanged }) {
  const [v, setV] = useState(null)
  const [error, setError] = useState(null)
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState([])
  const [form, setForm] = useState({ description: 'Extras', due_date: '', notes: '' })
  const [busy, setBusy] = useState(false)
  const p = `ex-${coupleId}`

  const load = useCallback(async () => {
    try { const { data } = await api.get(`/api/extras/couple/${coupleId}`); setV(data); setError(null) }
    catch (err) { setError(err.response?.data?.error || 'Could not load the extras') }
  }, [api, coupleId])
  useEffect(() => { load() }, [load])

  if (error) return <div className="card p-6 text-sm text-red-600">{error}</div>
  if (!v) return <div className="card p-6 text-sm text-slate-400">Loading extras…</div>

  const byId = Object.fromEntries(v.catalog.map(a => [String(a.id), a]))
  const blankRow = () => ({ addon_id: '', label: '', quantity: 1, unit_price: '' })
  const start = () => { setRows([blankRow()]); setForm({ description: 'Extras', due_date: v.default_due, notes: '' }); setOpen(true) }
  const setRow = (i, patch) => setRows(rs => rs.map((r, j) => {
    if (j !== i) return r
    const next = { ...r, ...patch }
    // Choosing an extra fills in its price for the stay's year (blank if it is
    // still a placeholder, so the real price has to be typed).
    if ('addon_id' in patch) {
      const a = byId[patch.addon_id]
      next.unit_price = a ? (a.price_placeholder ? '' : String(a.year_price)) : ''
      next.label = ''
    }
    return next
  }))
  const lineTotal = (r) => r2((Number(r.quantity) || 0) * (Number(r.unit_price) || 0))
  const subtotal = r2(rows.reduce((s, r) => s + lineTotal(r), 0))
  const gst = r2(subtotal * v.gst_rate / 100)

  const submit = async (e) => {
    e.preventDefault()
    const items = rows.map(r => (r.addon_id === 'custom' || !r.addon_id
      ? { label: r.label, quantity: Number(r.quantity), unit_price: r.unit_price }
      : { addon_id: Number(r.addon_id), quantity: Number(r.quantity), unit_price: r.unit_price === '' ? null : r.unit_price }))
    if (!confirm(`Create an invoice for ${money(subtotal + gst)} (GST included), due ${day(form.due_date)}?`)) return
    setBusy(true)
    try {
      const { data } = await api.post(`/api/extras/couple/${coupleId}`, { ...form, items })
      setV(data); setOpen(false); toast.success(`Invoice created: ${money(data.total)}`); onChanged?.()
    } catch (err) { toast.error(err.response?.data?.error || 'Could not create the invoice') }
    finally { setBusy(false) }
  }

  return (
    <div id="extras-card" className="card p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-slate-900">Extras</h2>
          <p className="text-xs text-slate-500">Propane, firewood, signage, consumables, linens and other extras after booking. Each order is its own invoice with a line per item and GST{v.stay?.check_in ? `, priced for ${v.stay.check_in.slice(0, 4)}` : ''}.</p>
        </div>
        {!open && <button className="btn-primary" onClick={start}>Bill extras</button>}
      </div>

      {v.invoices.length > 0 && (
        <ul className="space-y-3">
          {v.invoices.map(inv => (
            <li key={inv.id} className="rounded-lg border border-slate-100 p-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-slate-800">{inv.description}</span>
                <span className="text-slate-600">{money(inv.amount)} · due {day(inv.due_date)} · <span className={inv.paid ? 'text-emerald-700 font-medium' : 'text-amber-700'}>{inv.paid ? 'paid' : 'not paid yet'}</span></span>
              </div>
              <ul className="mt-1 text-xs text-slate-500 space-y-0.5">
                {inv.items.map(l => (
                  <li key={l.id} className="flex justify-between gap-3">
                    <span>{l.label}{l.kind === 'item' && Number(l.quantity) !== 1 ? ` × ${qtyText(l.quantity)} @ ${money(l.unit_price)}` : ''}</span>
                    <span>{money(l.amount)}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
          <li className="text-xs text-slate-500">Record payments on <Link to="/payments" className="text-rose-600 hover:underline">Payments</Link>.</li>
        </ul>
      )}
      {!v.invoices.length && !open && <p className="text-sm text-slate-400">No extras billed yet.</p>}

      {open && (
        <form onSubmit={submit} className="space-y-3 border-t border-slate-100 pt-4">
          <div className="space-y-2">
            {rows.map((r, i) => {
              const a = byId[r.addon_id]
              const custom = r.addon_id === 'custom'
              return (
                <div key={i} className="grid grid-cols-12 gap-2 items-end rounded-lg bg-slate-50 p-2">
                  <div className={custom ? 'col-span-12 sm:col-span-3' : 'col-span-12 sm:col-span-6'}>
                    <label htmlFor={`${p}-item-${i}`} className="block text-[11px] text-slate-500">Extra</label>
                    <select id={`${p}-item-${i}`} name={`ex-item-${i}`} required className="input-field" value={r.addon_id} onChange={e => setRow(i, { addon_id: e.target.value })}>
                      <option value="">Choose…</option>
                      {v.catalog.map(x => <option key={x.id} value={x.id}>{x.name} · {x.price_placeholder ? 'placeholder price' : `${money(x.year_price)} ${x.unit_text}`}</option>)}
                      <option value="custom">Something else (type it)</option>
                    </select>
                  </div>
                  {custom && (
                    <div className="col-span-12 sm:col-span-3">
                      <label htmlFor={`${p}-label-${i}`} className="block text-[11px] text-slate-500">What for</label>
                      <input id={`${p}-label-${i}`} name={`ex-label-${i}`} required className="input-field" value={r.label} onChange={e => setRow(i, { label: e.target.value })} placeholder="e.g. Extra trash run" />
                    </div>
                  )}
                  <div className="col-span-4 sm:col-span-2">
                    <label htmlFor={`${p}-qty-${i}`} className="block text-[11px] text-slate-500">How many</label>
                    <input id={`${p}-qty-${i}`} name={`ex-qty-${i}`} type="number" min="0.01" step="0.01" required className="input-field" value={r.quantity} onChange={e => setRow(i, { quantity: e.target.value })} />
                  </div>
                  <div className="col-span-5 sm:col-span-2">
                    <label htmlFor={`${p}-price-${i}`} className="block text-[11px] text-slate-500">Price each ($)</label>
                    <input id={`${p}-price-${i}`} name={`ex-price-${i}`} type="number" min="0" step="0.01" required={custom || !!a?.price_placeholder} className="input-field" value={r.unit_price}
                      onChange={e => setRow(i, { unit_price: e.target.value })} placeholder={a?.price_placeholder ? 'Type it' : ''} />
                  </div>
                  <div className="col-span-3 sm:col-span-2 flex items-center justify-between gap-1 pb-2 text-sm">
                    <span className="text-slate-700">{money(lineTotal(r))}</span>
                    <button type="button" className="text-xs text-red-600 hover:underline" aria-label={`Remove line ${i + 1}`} onClick={() => setRows(rs => rs.filter((_, j) => j !== i))}>✕</button>
                  </div>
                  {a?.price_placeholder && <p className="col-span-12 text-xs text-amber-700">{a.name} still has a placeholder price. Type what you are charging, or set the real price in Packages &amp; Add-Ons.</p>}
                </div>
              )
            })}
            <button type="button" className="btn-ghost text-xs" onClick={() => setRows(rs => [...rs, blankRow()])}>+ Add a line</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor={`${p}-desc`} className="block text-xs font-medium text-slate-600">Invoice name</label>
              <input id={`${p}-desc`} name="ex-desc" className="input-field" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div>
              <label htmlFor={`${p}-due`} className="block text-xs font-medium text-slate-600">Due</label>
              <input id={`${p}-due`} name="ex-due" type="date" required className="input-field" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
            </div>
            <div>
              <label htmlFor={`${p}-notes`} className="block text-xs font-medium text-slate-600">Note (optional)</label>
              <input id={`${p}-notes`} name="ex-notes" className="input-field" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. phoned in by Lou" />
            </div>
          </div>
          <div className="text-sm text-right text-slate-700 space-y-0.5">
            <div>Subtotal {money(subtotal)}</div>
            <div>GST {v.gst_rate}% {money(gst)}</div>
            <div className="font-semibold text-slate-900">Total {money(subtotal + gst)}</div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" disabled={busy || !rows.length}>Create invoice</button>
          </div>
        </form>
      )}
    </div>
  )
}
