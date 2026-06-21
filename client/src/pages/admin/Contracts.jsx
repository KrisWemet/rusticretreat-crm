import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import Modal from '../../components/ui/Modal'
import Input, { Select } from '../../components/ui/Input'
import {
  PlusIcon,
  DocumentTextIcon,
  PaperAirplaneIcon,
  LinkIcon,
  CheckCircleIcon,
  ClockIcon,
  TrashIcon,
  ClipboardDocumentIcon,
  EyeIcon,
  CalendarDaysIcon,
  UserGroupIcon,
  MapPinIcon,
  CurrencyDollarIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'

const statusStyle = {
  draft:    'bg-slate-100 text-slate-600',
  sent:     'bg-blue-100 text-blue-700',
  signed:   'bg-emerald-100 text-emerald-700',
  declined: 'bg-red-100 text-red-600',
}

const DEFAULT_TERMS = `1. EXCLUSIVE USE & DURATION
The entire Rustic Retreat property is reserved exclusively for the Clients during the full package period. Check-in is 8:00 AM on the first day; checkout is 8:00 PM on the final day. No other events will be hosted during this time.

2. PAYMENT TERMS
A non-refundable deposit of 25% of the total package price is required to secure the date. Remaining payments are scheduled per this agreement. The venue accepts e-transfer, credit card, or cheque.

3. CANCELLATION POLICY
Cancellations more than 90 days before the event forfeit the deposit only. Cancellations within 60–90 days incur a charge of 50% of the total. Cancellations within 60 days incur 100% of the total balance.

4. ALCOHOL & AGLC LICENSING
Clients are responsible for obtaining an AGLC (Alberta Gaming, Liquor & Cannabis) Special Event Licence. All bar service must comply with Alberta liquor laws. Rustic Retreat staff may hold vehicle keys to prevent impaired driving. ID checks are required for anyone appearing under 25.

5. QUIET HOURS
Amplified music must be reduced to a minimal level at the property line by 11:00 PM Sunday through Thursday, and by midnight on Friday, Saturday, and the wedding night. All guest generators must be turned off by 10:00 PM, no exceptions.

6. OFF-GRID PROPERTY & POWER
The property runs entirely on solar power. Clients must disclose all electrical requirements in advance. Generator rentals are available for additional power needs and must be arranged before the event.

7. VENDORS & CATERING
Clients may bring any licensed and insured vendors. There is no kitchen on-site — all food service must be self-contained. Vendors must carry their own liability insurance. All fireworks must be purchased and coordinated through Rustic Retreat.

8. DÉCOR & PROPERTY CARE
Nothing may be nailed, screwed, or stapled to any structure, tree, arch, or table. Loose glitter and confetti are prohibited. All borrowed décor items must be cleaned and returned to the décor shed before checkout.

9. PETS
Well-behaved, pre-approved pets are welcome. Pets staying in the cabin incur a $50 cleaning fee. No pets in the Bridal Suite or Décor Shed.

10. DAMAGE & LIABILITY
Clients are responsible for all damage caused by Clients, their guests, or their vendors. Clients are encouraged to obtain event liability insurance.

11. GOVERNING LAW
This Agreement is governed by the laws of the Province of Alberta, Canada.

IN WITNESS WHEREOF, the Clients confirm they have read and agree to be legally bound by the terms of this Agreement, as evidenced by their electronic signature below.`

function fmtDate(v) {
  try { return v ? format(parseISO(v), 'MMMM d, yyyy') : '___________________' } catch { return '___________________' }
}
function fmtPrice(v) {
  return v ? `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '___________________'
}
function blank(v) { return v || '___________________' }

function buildContent(coupleNames, f, terms) {
  return `RUSTIC RETREAT WEDDINGS
EVENT SERVICES AGREEMENT — Alberta, Canada

This Event Services Agreement ("Agreement") is entered into between Rustic Retreat Weddings ("Venue") and the clients identified below ("Clients").

EVENT DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Clients:              ${blank(coupleNames)}
Wedding Date:         ${fmtDate(f.wedding_date)}
Event Hours:          ${blank(f.start_time)} – ${blank(f.end_time)}
Guest Count:          ${f.guest_count ? f.guest_count + ' guests' : '___________________'}
Package:              ${blank(f.package_name)}
Ceremony Location:    ${blank(f.ceremony_location)}
Reception Location:   ${blank(f.reception_location)}
Total Contract Price: ${fmtPrice(f.total_price)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${terms}`
}

const EMPTY_FORM = {
  couple_id: '', title: 'Event Services Agreement', terms: DEFAULT_TERMS,
  wedding_date: '', start_time: '', end_time: '', guest_count: '',
  ceremony_location: '', reception_location: '', package_name: '', total_price: '',
}

export default function Contracts() {
  const { getAdminAxios } = useAuth()
  const [contracts, setContracts] = useState([])
  const [couples, setCouples] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [showView, setShowView] = useState(false)
  const [viewContract, setViewContract] = useState(null)
  const [signingLink, setSigningLink] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  const fetchData = async () => {
    const api = getAdminAxios()
    const [cRes, cpRes] = await Promise.all([api.get('/api/contracts'), api.get('/api/couples')])
    setContracts(cRes.data)
    setCouples(cpRes.data)
  }

  useEffect(() => { fetchData().finally(() => setLoading(false)) }, [])

  // When couple is selected, pre-fill event details from their existing booking
  const handleCoupleChange = async (e) => {
    const coupleId = e.target.value
    setForm(p => ({ ...p, couple_id: coupleId }))
    if (!coupleId) return

    const couple = couples.find(c => String(c.id) === String(coupleId))
    if (!couple) return

    try {
      const api = getAdminAxios()
      const bRes = await api.get(`/api/bookings/couple/${coupleId}`)
      const booking = bRes.data[0]
      setForm(p => ({
        ...p,
        couple_id: coupleId,
        wedding_date:       booking?.event_date          || couple.wedding_date    || '',
        start_time:         booking?.start_time          || '',
        end_time:           booking?.end_time            || '',
        guest_count:        booking?.guest_count         ? String(booking.guest_count) : '',
        ceremony_location:  booking?.ceremony_location   || '',
        reception_location: booking?.reception_location  || '',
        package_name:       booking?.package_name        || couple.venue_package   || '',
        total_price:        booking?.total_price         ? String(booking.total_price) : '',
      }))
    } catch {
      // No booking yet — pre-fill what we have from couple record
      setForm(p => ({
        ...p,
        couple_id: coupleId,
        wedding_date: couple.wedding_date  || '',
        package_name: couple.venue_package || '',
      }))
    }
  }

  const selectedCouple = couples.find(c => String(c.id) === String(form.couple_id))
  const coupleNames = selectedCouple
    ? `${selectedCouple.partner1_name} & ${selectedCouple.partner2_name}`
    : ''

  const handleCreate = async (e) => {
    e.preventDefault()
    const content = buildContent(coupleNames, form, form.terms)
    try {
      await getAdminAxios().post('/api/contracts', {
        couple_id: form.couple_id,
        title: form.title,
        content,
        wedding_date:       form.wedding_date       || null,
        start_time:         form.start_time         || null,
        end_time:           form.end_time           || null,
        guest_count:        form.guest_count        ? Number(form.guest_count) : null,
        ceremony_location:  form.ceremony_location  || null,
        reception_location: form.reception_location || null,
        package_name:       form.package_name       || null,
        total_price:        form.total_price        ? Number(form.total_price) : null,
      })
      toast.success('Contract created!')
      setShowCreate(false)
      setForm(EMPTY_FORM)
      fetchData()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create contract')
    }
  }

  const sendContract = async (id) => {
    try {
      const r = await getAdminAxios().post(`/api/contracts/${id}/send`)
      const url = `${window.location.origin}${r.data.signing_url}`
      setSigningLink(url)
      toast.success('Signing link generated!')
      fetchData()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send')
    }
  }

  const deleteContract = async (id) => {
    if (!confirm('Delete this contract?')) return
    await getAdminAxios().delete(`/api/contracts/${id}`)
    toast.success('Deleted')
    fetchData()
  }

  const copyLink = (link) => {
    navigator.clipboard.writeText(link)
    toast.success('Link copied to clipboard!')
  }

  const openView = (c) => { setViewContract(c); setShowView(true) }

  // Open a printable version of the contract (browser "Save as PDF").
  const printContract = async (c) => {
    try {
      const r = await getAdminAxios().get(`/api/contracts/${c.id}/print`, { responseType: 'text' })
      const w = window.open('', '_blank')
      if (!w) { toast.error('Allow pop-ups to download the PDF'); return }
      w.document.write(r.data)
      w.document.close()
    } catch {
      toast.error('Failed to open contract')
    }
  }

  const stats = {
    total:  contracts.length,
    sent:   contracts.filter(c => c.status === 'sent').length,
    signed: contracts.filter(c => c.status === 'signed').length,
    draft:  contracts.filter(c => c.status === 'draft').length,
  }

  return (
    <div className="p-6 space-y-5 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Contracts</h1>
          <p className="page-subtitle">{contracts.length} contracts · {stats.signed} signed</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          <PlusIcon className="w-4 h-4" />
          New Contract
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total',              value: stats.total,  color: 'text-slate-800' },
          { label: 'Draft',              value: stats.draft,  color: 'text-slate-500' },
          { label: 'Awaiting Signature', value: stats.sent,   color: 'text-blue-700'  },
          { label: 'Signed',             value: stats.signed, color: 'text-emerald-700' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card p-4 text-center">
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
            <div className="text-xs text-slate-400 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Signing link banner */}
      {signingLink && (
        <div className="card p-4 border-blue-200 bg-blue-50">
          <div className="flex items-start gap-3">
            <LinkIcon className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-blue-900 mb-1">Signing Link Ready</p>
              <p className="text-xs text-blue-700 mb-2">Share this link with your client so they can review and sign the contract:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-white border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-800 font-mono truncate">{signingLink}</code>
                <button onClick={() => copyLink(signingLink)} className="btn-secondary text-xs flex-shrink-0">
                  <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                  Copy
                </button>
                <a href={signingLink} target="_blank" rel="noopener noreferrer" className="btn-ghost text-xs flex-shrink-0">
                  <EyeIcon className="w-3.5 h-3.5" />
                  Preview
                </a>
              </div>
            </div>
            <button onClick={() => setSigningLink(null)} className="text-blue-400 hover:text-blue-600 text-lg leading-none flex-shrink-0">×</button>
          </div>
        </div>
      )}

      {/* Contracts table */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-7 w-7 border-2 border-rose-200 border-t-rose-600" /></div>
      ) : contracts.length === 0 ? (
        <div className="card py-16 text-center">
          <DocumentTextIcon className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">No contracts yet</p>
          <p className="text-xs text-slate-300 mt-1">Create your first contract and send it to a couple for digital signing.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="table">
            <thead>
              <tr>
                <th>Contract</th>
                <th>Client</th>
                <th>Wedding Date</th>
                <th>Status</th>
                <th>Signed By</th>
                <th>Signed Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {contracts.map(c => (
                <tr key={c.id}>
                  <td>
                    <button onClick={() => openView(c)} className="font-medium text-slate-800 hover:text-rose-600 transition-colors text-left">
                      {c.title}
                    </button>
                  </td>
                  <td>
                    <div className="text-slate-700">{c.partner1_name} & {c.partner2_name}</div>
                    <div className="text-xs text-slate-400">{c.couple_email}</div>
                  </td>
                  <td className="text-slate-500 text-xs">
                    {c.wedding_date ? format(parseISO(c.wedding_date), 'MMM d, yyyy') : <span className="text-slate-300">—</span>}
                  </td>
                  <td>
                    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium capitalize ${statusStyle[c.status]}`}>
                      {c.status === 'signed' && <CheckCircleSolid className="w-3.5 h-3.5" />}
                      {c.status}
                    </span>
                  </td>
                  <td className="text-slate-600">{c.signer_name || <span className="text-slate-300">—</span>}</td>
                  <td className="text-slate-500 text-xs">
                    {c.signed_at ? format(parseISO(c.signed_at), 'MMM d, yyyy h:mm a') : <span className="text-slate-300">—</span>}
                  </td>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => openView(c)} className="btn-ghost py-1 px-2 text-xs">
                        <EyeIcon className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => printContract(c)} className="btn-ghost py-1 px-2 text-xs" title="Download / print PDF">
                        <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                      </button>
                      {c.status !== 'signed' && (
                        <button
                          onClick={() => sendContract(c.id)}
                          className="btn-ghost py-1 px-2 text-xs text-blue-600 hover:bg-blue-50"
                          title="Generate signing link"
                        >
                          <PaperAirplaneIcon className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {c.status === 'draft' && (
                        <button onClick={() => deleteContract(c.id)} className="btn-ghost py-1 px-2 text-xs text-red-400 hover:bg-red-50">
                          <TrashIcon className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Create modal ───────────────────────────────────────────────── */}
      <Modal isOpen={showCreate} onClose={() => { setShowCreate(false); setForm(EMPTY_FORM) }} title="New Contract" size="xl">
        <form onSubmit={handleCreate} className="space-y-5">

          {/* Basic info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Client Couple <span className="text-red-500">*</span></label>
              <select
                value={form.couple_id}
                onChange={handleCoupleChange}
                required
                className="input-field"
              >
                <option value="">Select couple...</option>
                {couples.map(c => (
                  <option key={c.id} value={c.id}>{c.partner1_name} & {c.partner2_name}</option>
                ))}
              </select>
            </div>
            <Input label="Contract Title" value={form.title} onChange={f('title')} required />
          </div>

          {/* Event details */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center gap-2">
              <CalendarDaysIcon className="w-4 h-4 text-slate-500" />
              <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Event Details</span>
              <span className="text-xs text-slate-400 ml-1">— auto-filled into contract · synced to client profile on signing</span>
            </div>
            <div className="p-4 grid grid-cols-3 gap-4">
              <Input type="date" label="Wedding Date" value={form.wedding_date} onChange={f('wedding_date')} />
              <Input label="Start Time" value={form.start_time} onChange={f('start_time')} placeholder="e.g. 4:00 PM" />
              <Input label="End Time" value={form.end_time} onChange={f('end_time')} placeholder="e.g. 11:00 PM" />

              <Input type="number" label="Guest Count" value={form.guest_count} onChange={f('guest_count')} placeholder="e.g. 150" min="1" />
              <Input label="Package" value={form.package_name} onChange={f('package_name')} placeholder="e.g. 3-Day Weekend" />
              <div>
                <label className="label">Total Price (CAD $)</label>
                <div className="relative">
                  <CurrencyDollarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="number"
                    value={form.total_price}
                    onChange={f('total_price')}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    className="input-field pl-8"
                  />
                </div>
              </div>

              <Input label="Ceremony Location" value={form.ceremony_location} onChange={f('ceremony_location')} placeholder="e.g. Forest Clearing" className="col-span-1" />
              <Input label="Reception Location" value={form.reception_location} onChange={f('reception_location')} placeholder="e.g. Clear-Top Gazebo" className="col-span-1" />
            </div>
          </div>

          {/* Terms body */}
          <div>
            <label className="label">Contract Terms</label>
            <textarea
              value={form.terms}
              onChange={f('terms')}
              required
              rows={12}
              className="input-field font-mono text-xs resize-y leading-relaxed"
            />
            <p className="text-xs text-slate-400 mt-1">
              The event details above will be automatically inserted at the top of the contract. Edit the legal terms here as needed.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button type="button" className="btn-secondary" onClick={() => { setShowCreate(false); setForm(EMPTY_FORM) }}>Cancel</button>
            <button type="submit" className="btn-primary">Create Contract</button>
          </div>
        </form>
      </Modal>

      {/* ── View / preview modal ──────────────────────────────────────── */}
      <Modal isOpen={showView} onClose={() => setShowView(false)} title={viewContract?.title} size="xl">
        {viewContract && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 text-sm text-slate-500">
              <span>Client: <strong className="text-slate-800">{viewContract.partner1_name} & {viewContract.partner2_name}</strong></span>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${statusStyle[viewContract.status]}`}>{viewContract.status}</span>
            </div>

            {/* Event details summary */}
            {(viewContract.wedding_date || viewContract.guest_count || viewContract.package_name) && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {viewContract.wedding_date && (
                  <div className="bg-rose-50 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 text-xs text-rose-500 mb-1">
                      <CalendarDaysIcon className="w-3.5 h-3.5" />
                      Wedding Date
                    </div>
                    <div className="text-sm font-semibold text-rose-900">{format(parseISO(viewContract.wedding_date), 'MMM d, yyyy')}</div>
                    {(viewContract.start_time || viewContract.end_time) && (
                      <div className="text-xs text-rose-600 mt-0.5">{viewContract.start_time} – {viewContract.end_time}</div>
                    )}
                  </div>
                )}
                {viewContract.guest_count && (
                  <div className="bg-blue-50 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 text-xs text-blue-500 mb-1">
                      <UserGroupIcon className="w-3.5 h-3.5" />
                      Guest Count
                    </div>
                    <div className="text-sm font-semibold text-blue-900">{viewContract.guest_count} guests</div>
                  </div>
                )}
                {viewContract.package_name && (
                  <div className="bg-violet-50 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 text-xs text-violet-500 mb-1">
                      <DocumentTextIcon className="w-3.5 h-3.5" />
                      Package
                    </div>
                    <div className="text-sm font-semibold text-violet-900">{viewContract.package_name}</div>
                  </div>
                )}
                {viewContract.total_price > 0 && (
                  <div className="bg-emerald-50 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 text-xs text-emerald-500 mb-1">
                      <CurrencyDollarIcon className="w-3.5 h-3.5" />
                      Total Price
                    </div>
                    <div className="text-sm font-semibold text-emerald-900">${Number(viewContract.total_price).toLocaleString()}</div>
                  </div>
                )}
              </div>
            )}

            {viewContract.status === 'signed' && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircleSolid className="w-5 h-5 text-emerald-600" />
                  <span className="font-semibold text-emerald-800">Contract Signed</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-emerald-600">Signed by:</span> <strong>{viewContract.signer_name}</strong></div>
                  <div><span className="text-emerald-600">Signed on:</span> <strong>{viewContract.signed_at ? format(parseISO(viewContract.signed_at), 'MMM d, yyyy h:mm a') : '—'}</strong></div>
                </div>
                {viewContract.signature_data && (
                  <div className="mt-3">
                    <p className="text-xs text-emerald-600 mb-1">Captured Signature:</p>
                    <div className="bg-white rounded-lg border border-emerald-200 p-3 inline-block">
                      <img src={viewContract.signature_data} alt="Signature" className="h-16" />
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="bg-slate-50 rounded-xl border border-slate-100 p-5 max-h-96 overflow-y-auto">
              <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">{viewContract.content}</pre>
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
              <button className="btn-secondary" onClick={() => setShowView(false)}>Close</button>
              <button className="btn-secondary" onClick={() => printContract(viewContract)}>
                <ArrowDownTrayIcon className="w-4 h-4" />
                Download PDF
              </button>
              {viewContract.status !== 'signed' && (
                <button
                  className="btn-primary"
                  onClick={async () => { await sendContract(viewContract.id); setShowView(false) }}
                >
                  <PaperAirplaneIcon className="w-4 h-4" />
                  Send for Signature
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
