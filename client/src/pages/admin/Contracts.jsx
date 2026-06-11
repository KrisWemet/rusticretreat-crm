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
  PencilIcon,
  TrashIcon,
  ClipboardDocumentIcon,
  EyeIcon,
} from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'

const statusStyle = {
  draft: 'bg-slate-100 text-slate-600',
  sent: 'bg-blue-100 text-blue-700',
  signed: 'bg-emerald-100 text-emerald-700',
  declined: 'bg-red-100 text-red-600',
}

const DEFAULT_CONTRACT = `RUSTIC RETREAT WEDDING VENUE
EVENT SERVICES AGREEMENT

This Event Services Agreement ("Agreement") is entered into between Rustic Retreat Wedding Venue ("Venue") and the clients identified below ("Clients").

EVENT DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. VENUE RENTAL
The Venue agrees to reserve the property exclusively for the Clients' event on the date and times specified in the booking confirmation. The rental includes use of all designated event spaces, tables, chairs, and standard decor as outlined in the selected package.

2. PAYMENT TERMS
A non-refundable deposit of 25% of the total package price is required to secure the date. The remaining balance is due no later than 30 days prior to the event date. Payments may be made by check, credit card, or bank transfer.

3. CANCELLATION POLICY
Cancellations made more than 90 days before the event will forfeit the deposit only. Cancellations within 60–90 days will incur a charge of 50% of the total balance. Cancellations within 60 days of the event will incur a charge of 100% of the total balance.

4. VENDOR ACCESS
Clients may use approved outside vendors for catering, photography, florals, and music. All vendors must carry their own liability insurance and provide proof upon request. The Venue reserves the right to deny access to vendors who do not comply with facility policies.

5. DAMAGE & LIABILITY
Clients are responsible for any damage to the Venue property caused by the Clients, their guests, or their vendors. The Venue's liability is limited to the total contract value. Clients are encouraged to obtain event liability insurance.

6. EVENT TIMELINE
Events must conclude by the agreed end time. Extended hours may be arranged in advance at an additional charge of $500/hour. All vendors and guests must vacate the premises no later than 30 minutes after the event end time.

7. FORCE MAJEURE
Neither party shall be held liable for failure to perform their obligations under this Agreement if such failure results from events beyond reasonable control, including but not limited to natural disasters, government restrictions, or pandemic orders.

8. GOVERNING LAW
This Agreement shall be governed by the laws of the state in which the Venue is located. Any disputes shall be resolved through binding arbitration before resorting to litigation.

IN WITNESS WHEREOF, the Clients have read, understood, and agree to be legally bound by the terms of this Agreement, as evidenced by their electronic signature below.`

export default function Contracts() {
  const { getAdminAxios } = useAuth()
  const [contracts, setContracts] = useState([])
  const [couples, setCouples] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [showView, setShowView] = useState(false)
  const [viewContract, setViewContract] = useState(null)
  const [signingLink, setSigningLink] = useState(null)
  const [form, setForm] = useState({ couple_id: '', title: 'Event Services Agreement', content: DEFAULT_CONTRACT })
  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  const fetchData = async () => {
    const api = getAdminAxios()
    const [cRes, cpRes] = await Promise.all([api.get('/api/contracts'), api.get('/api/couples')])
    setContracts(cRes.data)
    setCouples(cpRes.data)
  }

  useEffect(() => { fetchData().finally(() => setLoading(false)) }, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    try {
      await getAdminAxios().post('/api/contracts', form)
      toast.success('Contract created!')
      setShowCreate(false)
      setForm({ couple_id: '', title: 'Event Services Agreement', content: DEFAULT_CONTRACT })
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

  const stats = {
    total: contracts.length,
    sent: contracts.filter(c => c.status === 'sent').length,
    signed: contracts.filter(c => c.status === 'signed').length,
    draft: contracts.filter(c => c.status === 'draft').length,
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
          { label: 'Total', value: stats.total, color: 'text-slate-800' },
          { label: 'Draft', value: stats.draft, color: 'text-slate-500' },
          { label: 'Awaiting Signature', value: stats.sent, color: 'text-blue-700' },
          { label: 'Signed', value: stats.signed, color: 'text-emerald-700' },
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
                <th>Status</th>
                <th>Signed By</th>
                <th>Signed Date</th>
                <th>Created</th>
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
                  <td className="text-slate-400 text-xs">{format(parseISO(c.created_at), 'MMM d')}</td>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => openView(c)} className="btn-ghost py-1 px-2 text-xs">
                        <EyeIcon className="w-3.5 h-3.5" />
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

      {/* Create modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="New Contract" size="xl">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Select label="Client Couple" value={form.couple_id} onChange={f('couple_id')} required>
              <option value="">Select couple...</option>
              {couples.map(c => <option key={c.id} value={c.id}>{c.partner1_name} & {c.partner2_name}</option>)}
            </Select>
            <Input label="Contract Title" value={form.title} onChange={f('title')} required />
          </div>
          <div>
            <label className="label">Contract Body</label>
            <textarea
              value={form.content}
              onChange={f('content')}
              required
              rows={16}
              className="input-field font-mono text-xs resize-y leading-relaxed"
            />
            <p className="text-xs text-slate-400 mt-1">Plain text — the client will see this exactly as written. Paste your template or edit the default above.</p>
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button type="button" className="btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
            <button type="submit" className="btn-primary">Create Contract</button>
          </div>
        </form>
      </Modal>

      {/* View/preview modal */}
      <Modal isOpen={showView} onClose={() => setShowView(false)} title={viewContract?.title} size="xl">
        {viewContract && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 text-sm text-slate-500">
              <span>Client: <strong className="text-slate-800">{viewContract.partner1_name} & {viewContract.partner2_name}</strong></span>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${statusStyle[viewContract.status]}`}>{viewContract.status}</span>
            </div>

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

            {viewContract.status !== 'signed' && (
              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button className="btn-secondary" onClick={() => setShowView(false)}>Close</button>
                <button
                  className="btn-primary"
                  onClick={async () => {
                    await sendContract(viewContract.id)
                    setShowView(false)
                  }}
                >
                  <PaperAirplaneIcon className="w-4 h-4" />
                  Send for Signature
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
