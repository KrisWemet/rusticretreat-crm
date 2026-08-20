import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import Modal from '../../components/ui/Modal'
import Input, { Select } from '../../components/ui/Input'
import SignaturePad from '../../components/SignaturePad'
import PrepareContractModal from '../../components/PrepareContractModal'
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
  ExclamationTriangleIcon,
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
  // Default to the venue's real agreement. The free-text kind stays available
  // for one-offs, but the 2027 packet is what an actual booking uses.
  template_packet: 'rental-2027',
  couple_id: '', title: 'Event Venue Rental Agreement', terms: DEFAULT_TERMS,
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
  // Describes what just happened to a contract's signing chain. Held together
  // rather than as a bare link, because whether the email actually went out
  // changes what staff are being asked to do — nothing, or send it by hand.
  const [handoff, setHandoff] = useState(null)
  const [missingEmailFor, setMissingEmailFor] = useState(null)
  const [signatureView, setSignatureView] = useState(null)
  const [venueSignContract, setVenueSignContract] = useState(null)
  const [venueSig, setVenueSig] = useState(null)
  const [venueAgreed, setVenueAgreed] = useState(false)
  const [venueSigning, setVenueSigning] = useState(false)
  const [signers, setSigners] = useState({})
  const [form, setForm] = useState(EMPTY_FORM)
  const [packets, setPackets] = useState([])
  const [prepContract, setPrepContract] = useState(null)
  const [unreachable, setUnreachable] = useState(false)
  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  const fetchData = async () => {
    const api = getAdminAxios()
    try {
      const [cRes, cpRes, tpRes] = await Promise.all([
        api.get('/api/contracts'),
        api.get('/api/couples'),
        // Never fatal: a failure here only costs the template picker, and the
        // contracts list is what the page is for.
        api.get('/api/contracts/templates').catch(() => ({ data: [] })),
      ])
      setPackets(tpRes.data || [])
      setContracts(cRes.data)
      setCouples(cpRes.data)
      setUnreachable(false)
      // The open detail modal holds a copy taken when it was opened, so re-point
      // it at the refreshed row — otherwise it keeps showing the status the
      // contract had before the couple signed, right above their signatures.
      setViewContract(v => (v ? cRes.data.find(c => c.id === v.id) || v : v))
    } catch (err) {
      // This runs on a 60-second timer. Left unhandled, every tick threw an
      // uncaught rejection, so a server that was down for twenty minutes buried
      // the console under ~90 errors — and the screen still showed a normal
      // contracts list, just a stale one. Say it on the page instead.
      //
      // 401 is not this: the axios interceptor ends the session and redirects to
      // the login page, so an expired login must not be reported as an outage.
      if (err.response?.status === 401) return
      setUnreachable(true)
    }
  }

  useEffect(() => { fetchData().finally(() => setLoading(false)) }, [])

  // Contracts change without anyone touching this screen: couples sign from
  // their own phones, minutes or days later. Fetching only on mount meant the
  // list kept showing "Sent" for a contract that was already fully signed —
  // and the staleness is invisible, because a wrong status looks exactly like
  // a right one. Refresh when the tab regains focus, which is precisely when
  // someone has come back to check, and on a slow timer while it stays open.
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') fetchData() }
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    const timer = setInterval(refresh, 60000)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
      clearInterval(timer)
    }
  }, [])

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
    const usingTemplate = !!form.template_packet
    // A template packet carries its own text; only a free-text contract needs
    // the assembled body.
    const content = usingTemplate ? undefined : buildContent(coupleNames, form, form.terms)
    try {
      const created = await getAdminAxios().post('/api/contracts', {
        couple_id: form.couple_id,
        title: form.title,
        template_packet: form.template_packet || undefined,
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
      toast.success('Contract created')
      setShowCreate(false)
      setForm(EMPTY_FORM)
      await fetchData()
      // Straight into the prep screen. A template contract is unusable until the
      // venue's own details are in it, so dropping the user back on the list
      // would just hide the next required step.
      if (usingTemplate && created?.data?.id) setPrepContract(created.data)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create contract')
    }
  }

  const sendContract = async (id) => {
    try {
      const r = await getAdminAxios().post(`/api/contracts/${id}/send`)
      setHandoff({
        url: `${window.location.origin}${r.data.signing_url}`,
        name: r.data.signer_name,
        email: r.data.sent_to,
        delivered: r.data.delivered,
        error: r.data.delivery_error,
        resent: true,
      })
      if (r.data.delivered) toast.success(`Link re-sent to ${r.data.signer_name}`)
      else toast.error('Email failed — send the link manually.')
      fetchData()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send')
    }
  }

  // The venue signs first. That locks the terms and releases partner 1's link.
  const openVenueSign = async (c) => {
    setVenueSignContract(c)
    setVenueSig(null)
    setVenueAgreed(false)
  }

  const submitVenueSignature = async () => {
    if (!venueSig) { toast.error('Please draw your signature first'); return }
    if (!venueAgreed) { toast.error('Please confirm the terms'); return }
    setVenueSigning(true)
    try {
      const r = await getAdminAxios().post(
        `/api/contracts/${venueSignContract.id}/sign-venue`,
        { signature_data: venueSig, agreed: true },
      )
      const next = r.data.next_signer
      if (next) {
        setHandoff({
          url: `${window.location.origin}${next.signing_url}`,
          name: next.name,
          email: next.email,
          delivered: next.delivered,
          error: next.delivery_error,
        })
        if (next.delivered) {
          toast.success(`Signed and locked. ${next.name} has been emailed their link.`)
        } else {
          // Never claim the couple was emailed when they were not — staff would
          // wait on a signature that is never coming.
          toast.error(`Signed, but the email to ${next.name} failed — send the link manually.`)
        }
      } else {
        setHandoff(null)
        toast.success('Signed and locked.')
      }
      setVenueSignContract(null)
      fetchData()
    } catch (err) {
      const data = err.response?.data
      // A couple who came in through the website has no partner 2 address, so
      // this refusal is the common case rather than an edge one. Say where to
      // fix it — a toast that only states the problem leaves staff stuck.
      if (data?.missing_partner2_email || data?.duplicate_partner_email) {
        setMissingEmailFor(venueSignContract)
        setVenueSignContract(null)
      }
      toast.error(data?.error || 'Failed to sign')
    } finally {
      setVenueSigning(false)
    }
  }

  // Fetched on demand rather than sent with the list: signature images are
  // base64 PNGs, and shipping one per signer per row would bloat every load of
  // this page for something staff open occasionally.
  const viewSignature = async (contract, signer) => {
    setSignatureView({ loading: true, contract, signer })
    try {
      const r = await getAdminAxios().get(`/api/contracts/${contract.id}/signers/${signer.id}`)
      setSignatureView({ loading: false, contract, signer, detail: r.data })
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not load that signature')
      setSignatureView(null)
    }
  }

  const loadSigners = async (id) => {
    try {
      const r = await getAdminAxios().get(`/api/contracts/${id}/signers`)
      setSigners(s => ({ ...s, [id]: r.data }))
    } catch { /* progress display is optional — never block the page on it */ }
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

  const openView = (c) => { setViewContract(c); setShowView(true); loadSigners(c.id) }

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

      {/* The server being unreachable used to be silent on screen and loud in
          the console. A stale contract list looks exactly like a current one,
          so it has to be said here, where the person actually is. */}
      {unreachable && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3">
          <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-900">Can’t reach the server</p>
            <p className="text-xs text-amber-700 mt-0.5">
              What you see below may be out of date, and changes will not save. Retrying every
              minute — if this does not clear, the site may be restarting.
            </p>
          </div>
          <button onClick={() => fetchData()}
            className="ml-auto flex-shrink-0 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-lg transition-colors">
            Retry now
          </button>
        </div>
      )}

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

      {/* What just happened to the signing chain.
          The link used to headline this banner under "Share this link with your
          client", which read as an instruction even when the email had already
          gone out — so staff went and sent it by hand for no reason. Sending is
          automatic, so on success this states that plainly and keeps the link
          only as a fallback. It becomes the call to action solely when delivery
          actually failed. */}
      {/* Signing refused because the couple record is incomplete. Links straight
          to the place it gets fixed. */}
      {missingEmailFor && (
        <div className="card p-4 border-amber-300 bg-amber-50">
          <div className="flex items-start gap-3">
            <UserGroupIcon className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-900 mb-1">
                {missingEmailFor.partner2_name} needs their own email address
              </p>
              <p className="text-sm text-amber-800 mb-2">
                Each partner signs from their own address so the two signatures are separately
                attributable. Add it to the couple, then sign the contract.
              </p>
              <a href={`/clients/${missingEmailFor.couple_id}`} className="btn-secondary text-xs">
                Open {missingEmailFor.partner1_name} &amp; {missingEmailFor.partner2_name}
              </a>
            </div>
            <button onClick={() => setMissingEmailFor(null)} className="text-amber-400 hover:text-amber-600 text-lg leading-none flex-shrink-0">×</button>
          </div>
        </div>
      )}

      {handoff && (
        handoff.delivered ? (
          <div className="card p-4 border-emerald-200 bg-emerald-50">
            <div className="flex items-start gap-3">
              <CheckCircleSolid className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-emerald-900 mb-1">
                  {handoff.resent ? 'Link re-sent' : 'Signed, locked and sent'}
                </p>
                <p className="text-sm text-emerald-800">
                  Emailed to <strong>{handoff.name}</strong> at {handoff.email}. You don't need to
                  send anything — when they sign, the next signer is emailed automatically.
                </p>
                <details className="mt-2">
                  <summary className="text-xs text-emerald-700 cursor-pointer hover:text-emerald-900">
                    Need their link anyway?
                  </summary>
                  <div className="flex items-center gap-2 mt-2">
                    <code className="flex-1 bg-white border border-emerald-200 rounded-lg px-3 py-2 text-xs text-emerald-800 font-mono truncate">{handoff.url}</code>
                    <button onClick={() => copyLink(handoff.url)} className="btn-secondary text-xs flex-shrink-0">
                      <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                      Copy
                    </button>
                  </div>
                </details>
              </div>
              <button onClick={() => setHandoff(null)} className="text-emerald-400 hover:text-emerald-600 text-lg leading-none flex-shrink-0">×</button>
            </div>
          </div>
        ) : (
          <div className="card p-4 border-amber-300 bg-amber-50">
            <div className="flex items-start gap-3">
              <LinkIcon className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-900 mb-1">Email not delivered</p>
                <p className="text-sm text-amber-800 mb-2">
                  The contract is signed and locked, but we could not email <strong>{handoff.name}</strong>
                  {handoff.email ? ` at ${handoff.email}` : ''}. Send them this link yourself.
                  {handoff.error ? ` (${handoff.error})` : ''}
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-white border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-900 font-mono truncate">{handoff.url}</code>
                  <button onClick={() => copyLink(handoff.url)} className="btn-secondary text-xs flex-shrink-0">
                    <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                    Copy
                  </button>
                  <a href={handoff.url} target="_blank" rel="noopener noreferrer" className="btn-ghost text-xs flex-shrink-0">
                    <EyeIcon className="w-3.5 h-3.5" />
                    Preview
                  </a>
                </div>
              </div>
              <button onClick={() => setHandoff(null)} className="text-amber-400 hover:text-amber-600 text-lg leading-none flex-shrink-0">×</button>
            </div>
          </div>
        )
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
        // overflow-x-auto, not overflow-hidden: this table is seven columns wide
        // and the last one holds "Sign & Lock", the action that moves a contract
        // forward. With overflow hidden it was simply clipped on a narrow window
        // with no way to scroll to it.
        <div className="card overflow-x-auto">
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
                  {/* Every signer, not just the last one. contracts.signer_name
                      holds whoever signed most recently, so this column used to
                      credit a three-party agreement to partner 2 alone. */}
                  <td className="text-slate-600">
                    {c.signers?.length ? (
                      <div className="space-y-0.5">
                        {c.signers.map(s => (
                          <div key={s.id} className="flex items-center gap-1.5 whitespace-nowrap">
                            {s.status === 'signed' ? (
                              <>
                                <CheckCircleSolid className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                                <button
                                  onClick={() => viewSignature(c, s)}
                                  className="text-rose-600 hover:text-rose-700 hover:underline text-sm"
                                  title={`View ${s.name}'s signature`}
                                >
                                  {s.name}
                                </button>
                              </>
                            ) : (
                              <>
                                <ClockIcon className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
                                <span className="text-slate-400 text-sm">{s.name}</span>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (c.signer_name || <span className="text-slate-300">—</span>)}
                  </td>
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
                      {/* A template contract needs its venue details before it
                          can be signed, so that action comes first. */}
                      {c.template_key && !c.locked_at && c.status !== 'signed' && (
                        <button
                          onClick={() => setPrepContract(c)}
                          className="btn-ghost py-1 px-2 text-xs text-emerald-700 hover:bg-emerald-50 font-semibold"
                          title="Fill in the venue's details before sending"
                        >
                          Prepare
                        </button>
                      )}
                      {/* Before the venue signs there is nothing to send — the
                          couple's links do not exist yet. Show the action that
                          actually moves the contract forward. */}
                      {c.status !== 'signed' && !c.locked_at && (
                        <button
                          onClick={() => openVenueSign(c)}
                          className="btn-ghost py-1 px-2 text-xs text-rose-600 hover:bg-rose-50 font-semibold"
                          title="Sign as the venue — this locks the terms and sends partner 1 their link"
                        >
                          Sign &amp; Lock
                        </button>
                      )}
                      {c.status !== 'signed' && c.locked_at && (
                        <button
                          onClick={() => sendContract(c.id)}
                          className="btn-ghost py-1 px-2 text-xs text-blue-600 hover:bg-blue-50"
                          title="Re-send the current signer's link"
                        >
                          <PaperAirplaneIcon className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {c.status === 'draft' && !c.locked_at && (
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

      {/* ── Venue prep for template contracts ──────────────────────────── */}
      <PrepareContractModal
        contract={prepContract}
        api={getAdminAxios()}
        onClose={() => setPrepContract(null)}
        onSaved={fetchData}
      />

      {/* ── Create modal ───────────────────────────────────────────────── */}
      <Modal isOpen={showCreate} onClose={() => { setShowCreate(false); setForm(EMPTY_FORM) }} title="New Contract" size="xl">
        <form onSubmit={handleCreate} className="space-y-5">

          {/* Which kind of contract. The venue's real agreement is a fixed
              template; the free-text option is kept for one-offs that the
              template does not cover. */}
          <div className="space-y-2">
            <label className="label">Contract type</label>
            {packets.map(pk => (
              <label key={pk.key}
                className={`flex items-start gap-3 border rounded-xl px-4 py-3 cursor-pointer transition-colors
                  ${form.template_packet === pk.key ? 'border-rose-400 bg-rose-50' : 'border-slate-200 hover:border-slate-300'}`}>
                <input type="radio" name="ctype" className="mt-1 w-4 h-4 text-rose-600 focus:ring-rose-400"
                  checked={form.template_packet === pk.key}
                  onChange={() => setForm(v => ({ ...v, template_packet: pk.key, title: 'Event Venue Rental Agreement' }))} />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900">{pk.title}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {pk.documents.map(d => d.title).join(' + ')}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    You fill in the dates, package and price; the couple fills in their details,
                    initials 12 clauses and signs.
                  </div>
                </div>
              </label>
            ))}
            <label className={`flex items-start gap-3 border rounded-xl px-4 py-3 cursor-pointer transition-colors
              ${!form.template_packet ? 'border-rose-400 bg-rose-50' : 'border-slate-200 hover:border-slate-300'}`}>
              <input type="radio" name="ctype" className="mt-1 w-4 h-4 text-rose-600 focus:ring-rose-400"
                checked={!form.template_packet}
                onChange={() => setForm(v => ({ ...v, template_packet: '', title: 'Event Services Agreement' }))} />
              <div>
                <div className="text-sm font-semibold text-slate-900">Free-text contract</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Type your own terms. No initials, no fill-in boxes — one signature per party.
                </div>
              </div>
            </label>
          </div>

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

          {form.template_packet ? (
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
              <p className="text-sm text-slate-600">
                Event dates, package, price and payment schedule are part of the agreement itself —
                you will fill them in on the next screen.
              </p>
            </div>
          ) : (
          <>
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
              required={!form.template_packet}
              rows={12}
              className="input-field font-mono text-xs resize-y leading-relaxed"
            />
            <p className="text-xs text-slate-400 mt-1">
              The event details above will be automatically inserted at the top of the contract. Edit the legal terms here as needed.
            </p>
          </div>
          </>
          )}

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

            {/* Where the contract actually is right now — the question staff
                ask most often once something has been sent out. */}
            {signers[viewContract.id]?.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-400 mb-3">Signing progress</p>
                <ol className="space-y-2">
                  {signers[viewContract.id].map(s => (
                    <li key={s.sign_order} className="flex items-center gap-3 text-sm">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                        s.status === 'signed' ? 'bg-emerald-500 text-white'
                        : s.status === 'sent' ? 'bg-blue-500 text-white'
                        : 'bg-slate-200 text-slate-500'}`}>
                        {s.status === 'signed' ? '✓' : s.sign_order}
                      </span>
                      <span className="font-medium text-slate-700">{s.name}</span>
                      <span className="text-slate-400 text-xs">
                        {s.role === 'venue' ? 'Venue' : s.role === 'partner1' ? 'Partner 1' : 'Partner 2'}
                      </span>
                      <span className="ml-auto text-xs text-slate-500">
                        {s.status === 'signed'
                          ? `Signed ${s.signed_at ? format(parseISO(s.signed_at.replace(' ', 'T') + 'Z'), 'MMM d, h:mma') : ''}`
                          : s.status === 'sent' ? 'Waiting on them' : 'Not yet their turn'}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
              <button className="btn-secondary" onClick={() => setShowView(false)}>Close</button>
              <button className="btn-secondary" onClick={() => printContract(viewContract)}>
                <ArrowDownTrayIcon className="w-4 h-4" />
                Download PDF
              </button>
              {viewContract.status !== 'signed' && !viewContract.locked_at && (
                <button
                  className="btn-primary"
                  onClick={() => { setShowView(false); openVenueSign(viewContract) }}
                >
                  Sign &amp; Lock as Venue
                </button>
              )}
              {viewContract.status !== 'signed' && viewContract.locked_at && (
                <button
                  className="btn-primary"
                  onClick={async () => { await sendContract(viewContract.id); setShowView(false) }}
                >
                  <PaperAirplaneIcon className="w-4 h-4" />
                  Re-send Current Link
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* ── One signer's signature and audit trail ──────────────────────── */}
      <Modal
        isOpen={!!signatureView}
        onClose={() => setSignatureView(null)}
        title={signatureView ? `${signatureView.signer.name}'s signature` : ''}
      >
        {signatureView?.loading && (
          <div className="flex justify-center py-10">
            <div className="animate-spin rounded-full h-7 w-7 border-2 border-rose-200 border-t-rose-600" />
          </div>
        )}
        {signatureView?.detail && (
          <div className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400 mb-1">
                {signatureView.detail.role === 'venue' ? 'For the venue'
                  : signatureView.detail.role === 'partner1' ? 'Client — Partner 1'
                  : 'Client — Partner 2'}
              </p>
              <p className="font-semibold text-slate-900">{signatureView.detail.name}</p>
              {signatureView.detail.email && (
                <p className="text-sm text-slate-500">{signatureView.detail.email}</p>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              {/^data:image\/(png|jpeg);base64,/.test(signatureView.detail.signature_data || '') ? (
                <img
                  src={signatureView.detail.signature_data}
                  alt={`Signature of ${signatureView.detail.name}`}
                  className="max-h-28 mx-auto"
                />
              ) : (
                <p className="text-sm text-slate-400 text-center py-6">No signature image recorded</p>
              )}
              <div className="border-t border-slate-200 mt-3 pt-2 text-center">
                <span className="text-xs text-slate-400">{signatureView.detail.name}</span>
              </div>
            </div>

            {signatureView.detail.consent_text && (
              <div className="bg-slate-50 border-l-2 border-rose-400 px-3 py-2">
                <p className="text-xs font-semibold text-slate-600 mb-1">Consent recorded at signing</p>
                <p className="text-xs text-slate-600 leading-relaxed">{signatureView.detail.consent_text}</p>
              </div>
            )}

            {/* The evidence that makes the signature defensible if it is ever
                questioned — kept beside it rather than buried in the PDF. */}
            <table className="text-xs text-slate-500 w-full">
              <tbody>
                {[
                  ['Signed', signatureView.detail.signed_at],
                  ['First viewed', signatureView.detail.viewed_at],
                  ['Link sent', signatureView.detail.sent_at],
                ].filter(([, v]) => v).map(([k, v]) => (
                  <tr key={k}>
                    <td className="py-0.5 pr-4 text-slate-400 whitespace-nowrap">{k}</td>
                    <td>{format(parseISO(String(v).replace(' ', 'T') + 'Z'), 'MMM d, yyyy h:mm a')}</td>
                  </tr>
                ))}
                {signatureView.detail.signer_ip && (
                  <tr><td className="py-0.5 pr-4 text-slate-400">IP address</td><td>{signatureView.detail.signer_ip}</td></tr>
                )}
                {signatureView.detail.signer_user_agent && (
                  <tr><td className="py-0.5 pr-4 text-slate-400 align-top">Device</td><td className="break-all">{signatureView.detail.signer_user_agent}</td></tr>
                )}
              </tbody>
            </table>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button className="btn-secondary" onClick={() => setSignatureView(null)}>Close</button>
              <button className="btn-primary" onClick={() => { const c = signatureView.contract; setSignatureView(null); printContract(c) }}>
                <ArrowDownTrayIcon className="w-4 h-4" />
                Full signed contract
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Venue signature ─────────────────────────────────────────────────
          The venue signs before the couple sees the contract. Doing so freezes
          the terms, so the warning here is the real point of the screen. */}
      <Modal
        isOpen={!!venueSignContract}
        onClose={() => setVenueSignContract(null)}
        title="Sign as the venue"
        size="lg"
      >
        {venueSignContract && (
          <div className="space-y-5">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-sm text-amber-900 font-semibold mb-1">
                This locks the contract permanently.
              </p>
              <p className="text-sm text-amber-800">
                Once you sign, the wording and pricing can no longer be edited — the couple
                signs exactly what you see now. Read it through first. If the terms need to
                change afterwards you will have to delete this contract and issue a new one.
              </p>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400 mb-1">Contract</p>
              <p className="font-semibold text-slate-900">{venueSignContract.title}</p>
              <p className="text-sm text-slate-500">
                {venueSignContract.partner1_name} &amp; {venueSignContract.partner2_name}
              </p>
            </div>

            <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-4">
              <pre className="whitespace-pre-wrap text-xs text-slate-700 font-sans leading-relaxed">
                {venueSignContract.content}
              </pre>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Venue signature <span className="text-red-500">*</span>
              </label>
              <SignaturePad onChange={setVenueSig} />
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={venueAgreed}
                onChange={e => setVenueAgreed(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
              />
              <span className="text-sm text-slate-600 leading-relaxed">
                I am signing on behalf of Rustic Retreat Weddings &amp; Events, and I understand
                this locks the contract and sends it to{' '}
                <strong>{venueSignContract.partner1_name}</strong> to sign.
              </span>
            </label>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button className="btn-secondary" onClick={() => setVenueSignContract(null)}>
                Cancel
              </button>
              <button
                className="btn-primary"
                disabled={venueSigning || !venueSig || !venueAgreed}
                onClick={submitVenueSignature}
              >
                {venueSigning ? 'Signing…' : 'Sign & lock contract'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
