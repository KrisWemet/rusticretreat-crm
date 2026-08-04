import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import {
  PlusIcon, TrashIcon, PaperAirplaneIcon, PencilIcon,
  DocumentDuplicateIcon, LinkIcon, CheckCircleIcon, PrinterIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'

const STATUS = {
  draft:    'bg-slate-100 text-slate-600',
  sent:     'bg-blue-100 text-blue-700',
  accepted: 'bg-emerald-100 text-emerald-700',
  declined: 'bg-rose-100 text-rose-700',
  expired:  'bg-amber-100 text-amber-700',
}

const emptyForm = {
  couple_id: '', title: '', package_name: '', event_date: '', end_date: '',
  guest_count: '', tax_rate: 5, deposit_pct: 25, valid_until: '', notes: '',
  items: [],
}

function fmtDate(v) {
  if (!v) return '—'
  try { return format(parseISO(v), 'MMM d, yyyy') } catch { return v }
}

export default function Proposals() {
  const { getAdminAxios } = useAuth()
  const api = getAdminAxios()
  const [proposals, setProposals] = useState([])
  const [couples, setCouples] = useState([])
  const [packages, setPackages] = useState([])
  const [addons, setAddons] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // null | 'new' | proposal id
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const [searchParams, setSearchParams] = useSearchParams()

  function load() {
    Promise.all([
      api.get('/api/proposals'),
      api.get('/api/couples'),
      api.get('/api/packages'),
      api.get('/api/addons?active=1'),
    ]).then(([p, c, pk, a]) => {
      setProposals(p.data); setCouples(c.data); setPackages(pk.data); setAddons(a.data)
    }).catch(() => toast.error('Failed to load proposals')).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  // Deep links from the client detail page: ?couple=ID&new=1 or ?open=ID
  useEffect(() => {
    if (loading) return
    const openId = searchParams.get('open')
    const newCouple = searchParams.get('new') && searchParams.get('couple')
    if (openId) {
      openEdit(Number(openId))
      setSearchParams({}, { replace: true })
    } else if (newCouple) {
      setForm({ ...emptyForm, couple_id: Number(searchParams.get('couple')) })
      setEditing('new')
      setSearchParams({}, { replace: true })
    }
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

  const subtotal = form.items.reduce((s, it) => s + (Number(it.amount) || 0), 0)
  const tax = Math.round(subtotal * (Number(form.tax_rate) / 100) * 100) / 100
  const total = Math.round((subtotal + tax) * 100) / 100
  const deposit = Math.round(total * (Number(form.deposit_pct) / 100) * 100) / 100

  function openNew() { setForm(emptyForm); setEditing('new') }

  async function openEdit(id) {
    try {
      const { data } = await api.get(`/api/proposals/${id}`)
      setForm({
        couple_id: data.couple_id, title: data.title, package_name: data.package_name || '',
        event_date: data.event_date || '', end_date: data.end_date || '',
        guest_count: data.guest_count || '', tax_rate: data.tax_rate, deposit_pct: data.deposit_pct,
        valid_until: data.valid_until || '', notes: data.notes || '',
        items: data.items.map(i => ({ label: i.label, description: i.description || '', quantity: i.quantity, unit_price: i.unit_price, amount: i.amount, kind: i.kind })),
      })
      setEditing(id)
    } catch { toast.error('Could not open proposal') }
  }

  function setItem(idx, patch) {
    setForm(f => {
      const items = f.items.map((it, i) => {
        if (i !== idx) return it
        const next = { ...it, ...patch }
        // Recompute amount from qty × unit price unless amount was the field edited
        if (!('amount' in patch)) next.amount = Math.round((Number(next.quantity) || 0) * (Number(next.unit_price) || 0) * 100) / 100
        return next
      })
      return { ...f, items }
    })
  }
  function removeItem(idx) { setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) })) }
  function addCustomItem() {
    setForm(f => ({ ...f, items: [...f.items, { label: '', description: '', quantity: 1, unit_price: 0, amount: 0, kind: 'custom' }] }))
  }
  function addPackage(pkg) {
    setForm(f => ({
      ...f,
      package_name: pkg.name,
      title: f.title || `${pkg.name} Proposal`,
      items: [{ label: pkg.name, description: pkg.description || '', quantity: 1, unit_price: pkg.price, amount: pkg.price, kind: 'package' }, ...f.items.filter(i => i.kind !== 'package')],
    }))
  }
  function addAddon(a) {
    const guests = Number(form.guest_count) || 0
    let qty = 1, label = a.name
    if (a.unit === 'per_guest') { qty = Math.max(0, guests - 60); label = `${a.name}` }
    const amount = Math.round(qty * a.price * 100) / 100
    setForm(f => ({ ...f, items: [...f.items, { label, description: a.description || '', quantity: qty, unit_price: a.price, amount, kind: 'addon' }] }))
  }

  async function save(thenSend = false) {
    if (!form.couple_id || !form.title) return toast.error('Pick a couple and add a title')
    if (form.items.length === 0) return toast.error('Add at least one line item')
    setSaving(true)
    try {
      const payload = {
        ...form,
        guest_count: form.guest_count ? Number(form.guest_count) : null,
        tax_rate: Number(form.tax_rate), deposit_pct: Number(form.deposit_pct),
      }
      let id = editing
      if (editing === 'new') {
        const { data } = await api.post('/api/proposals', payload)
        id = data.id
      } else {
        await api.put(`/api/proposals/${editing}`, payload)
      }
      if (thenSend) {
        await api.post(`/api/proposals/${id}/send`)
        toast.success('Proposal sent to couple')
      } else {
        toast.success('Proposal saved')
      }
      setEditing(null); load()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to save')
    } finally { setSaving(false) }
  }

  async function send(p) {
    try {
      await api.post(`/api/proposals/${p.id}/send`)
      toast.success('Proposal sent')
      load()
    } catch { toast.error('Failed to send') }
  }

  // Fetch the HTML through axios rather than linking straight to the endpoint:
  // a plain <a href> is a browser navigation, which carries cookies but never
  // the Authorization header, so the print route would 401 in a blank tab.
  async function printProposal(p) {
    try {
      const r = await api.get(`/api/proposals/${p.id}/print`, { responseType: 'text' })
      const w = window.open('', '_blank')
      if (!w) { toast.error('Allow pop-ups to download the PDF'); return }
      w.document.write(r.data)
      w.document.close()
    } catch {
      toast.error('Failed to open proposal')
    }
  }

  function copyLink(p) {
    if (!p.public_token) return toast.error('Send the proposal first to generate a link')
    const url = `${window.location.origin}/proposal/${p.public_token}`
    navigator.clipboard.writeText(url).then(() => toast.success('Link copied'))
  }

  async function del(p) {
    if (!confirm('Delete this proposal?')) return
    try { await api.delete(`/api/proposals/${p.id}`); toast.success('Deleted'); load() }
    catch { toast.error('Failed to delete') }
  }

  const coupleName = (id) => {
    const c = couples.find(x => x.id === Number(id))
    return c ? `${c.partner1_name} & ${c.partner2_name}` : ''
  }

  return (
    <div className="p-6 space-y-5 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Proposals</h1>
          <p className="page-subtitle">Build itemized quotes couples can accept online</p>
        </div>
        <button onClick={openNew} className="btn-primary"><PlusIcon className="w-4 h-4" /> New Proposal</button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-7 w-7 border-2 border-rose-200 border-t-rose-500" /></div>
      ) : proposals.length === 0 ? (
        <div className="card py-16 text-center">
          <DocumentDuplicateIcon className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">No proposals yet</p>
          <p className="text-xs text-slate-300 mt-1">Build a quote from a package + add-ons and send it for online acceptance.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="table">
            <thead><tr><th>Proposal</th><th>Couple</th><th>Event</th><th>Total</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {proposals.map(p => (
                <tr key={p.id}>
                  <td><span className="font-medium text-slate-800">{p.title}</span></td>
                  <td className="text-slate-600 text-sm">{p.partner1_name} & {p.partner2_name}</td>
                  <td className="text-slate-500 text-xs">{fmtDate(p.event_date)}</td>
                  <td className="font-semibold text-slate-800">${Number(p.total).toLocaleString()}</td>
                  <td><span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${STATUS[p.status]}`}>{p.status}</span></td>
                  <td>
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openEdit(p.id)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg" title="Edit"><PencilIcon className="w-4 h-4" /></button>
                      {p.status !== 'accepted' && (
                        <button onClick={() => send(p)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg" title="Send to couple"><PaperAirplaneIcon className="w-4 h-4" /></button>
                      )}
                      <button onClick={() => copyLink(p)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg" title="Copy link"><LinkIcon className="w-4 h-4" /></button>
                      <button onClick={() => printProposal(p)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg" title="Print / PDF"><PrinterIcon className="w-4 h-4" /></button>
                      <button onClick={() => del(p)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Delete"><TrashIcon className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Editor */}
      {editing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
              <h2 className="font-semibold text-slate-800">{editing === 'new' ? 'New Proposal' : 'Edit Proposal'}</h2>
              <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Couple</label>
                  <select className="input" value={form.couple_id} onChange={e => setForm(f => ({ ...f, couple_id: e.target.value }))}>
                    <option value="">Select couple…</option>
                    {couples.map(c => <option key={c.id} value={c.id}>{c.partner1_name} & {c.partner2_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Proposal Title</label>
                  <input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="3-Day Weekend Proposal" />
                </div>
                <div>
                  <label className="label">Check-In Date</label>
                  <input type="date" className="input" value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Check-Out Date</label>
                  <input type="date" className="input" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Guest Count</label>
                  <input type="number" min="1" max="80" className="input" value={form.guest_count} onChange={e => setForm(f => ({ ...f, guest_count: e.target.value }))} placeholder="e.g. 60" />
                </div>
                <div>
                  <label className="label">Valid Until</label>
                  <input type="date" className="input" value={form.valid_until} onChange={e => setForm(f => ({ ...f, valid_until: e.target.value }))} />
                </div>
              </div>

              {/* Quick-add pickers */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Add package:</span>
                  {packages.filter(p => p.is_active).map(pkg => (
                    <button key={pkg.id} onClick={() => addPackage(pkg)} className="text-xs px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 hover:bg-rose-100">
                      {pkg.name} · ${Number(pkg.price).toLocaleString()}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Add-on:</span>
                  {addons.map(a => (
                    <button key={a.id} onClick={() => addAddon(a)} className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200">
                      + {a.name} {a.unit === 'per_guest' ? `($${a.price}/guest)` : a.unit === 'per_night' ? `($${a.price}/night)` : `($${a.price})`}
                    </button>
                  ))}
                  <button onClick={addCustomItem} className="text-xs px-2.5 py-1 rounded-full border border-dashed border-slate-300 text-slate-500 hover:bg-slate-50">+ Custom line</button>
                </div>
              </div>

              {/* Line items */}
              <div className="border border-slate-100 rounded-xl overflow-hidden">
                <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  <div className="col-span-5">Item</div>
                  <div className="col-span-2 text-right">Qty</div>
                  <div className="col-span-2 text-right">Unit $</div>
                  <div className="col-span-2 text-right">Amount</div>
                  <div className="col-span-1"></div>
                </div>
                {form.items.length === 0 && <div className="px-3 py-6 text-center text-sm text-slate-300">Add a package or add-on above to start.</div>}
                {form.items.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 px-3 py-2 items-center border-t border-slate-50">
                    <input className="col-span-5 px-2 py-1.5 border border-slate-200 rounded-lg text-sm" value={it.label} onChange={e => setItem(idx, { label: e.target.value })} placeholder="Item name" />
                    <input type="number" className="col-span-2 px-2 py-1.5 border border-slate-200 rounded-lg text-sm text-right" value={it.quantity} onChange={e => setItem(idx, { quantity: e.target.value })} />
                    <input type="number" className="col-span-2 px-2 py-1.5 border border-slate-200 rounded-lg text-sm text-right" value={it.unit_price} onChange={e => setItem(idx, { unit_price: e.target.value })} />
                    <input type="number" className="col-span-2 px-2 py-1.5 border border-slate-200 rounded-lg text-sm text-right font-medium" value={it.amount} onChange={e => setItem(idx, { amount: e.target.value })} />
                    <button onClick={() => removeItem(idx)} className="col-span-1 text-slate-300 hover:text-red-500 flex justify-center"><TrashIcon className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="flex justify-end">
                <div className="w-64 space-y-1.5 text-sm">
                  <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>${subtotal.toLocaleString()}</span></div>
                  <div className="flex justify-between text-slate-500 items-center">
                    <span className="flex items-center gap-1">GST
                      <input type="number" className="w-12 px-1 py-0.5 border border-slate-200 rounded text-xs text-right" value={form.tax_rate} onChange={e => setForm(f => ({ ...f, tax_rate: e.target.value }))} />%
                    </span>
                    <span>${tax.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between font-bold text-slate-800 text-base border-t border-slate-100 pt-1.5"><span>Total</span><span>${total.toLocaleString()}</span></div>
                  <div className="flex justify-between text-rose-600 items-center">
                    <span className="flex items-center gap-1">Deposit
                      <input type="number" className="w-12 px-1 py-0.5 border border-slate-200 rounded text-xs text-right" value={form.deposit_pct} onChange={e => setForm(f => ({ ...f, deposit_pct: e.target.value }))} />%
                    </span>
                    <span>${deposit.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="label">Notes <span className="text-slate-400 font-normal">(shown to couple)</span></label>
                <textarea className="input" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="A personal note about this proposal…" />
              </div>
            </div>

            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setEditing(null)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={() => save(false)} disabled={saving} className="btn-secondary flex-1">{saving ? 'Saving…' : 'Save Draft'}</button>
              <button onClick={() => save(true)} disabled={saving} className="btn-primary flex-1"><PaperAirplaneIcon className="w-4 h-4" /> Save & Send</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
