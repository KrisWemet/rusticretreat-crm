import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input, { Select, Textarea } from '../../components/ui/Input'
import {
  ArrowLeftIcon, PencilIcon, TrashIcon, PlusIcon, DocumentDuplicateIcon,
  PrinterIcon, DocumentCheckIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import axios from 'axios'
import { format, parseISO } from 'date-fns'

const PROPOSAL_STATUS = {
  draft:    'bg-slate-100 text-slate-600',
  sent:     'bg-blue-100 text-blue-700',
  accepted: 'bg-emerald-100 text-emerald-700',
  declined: 'bg-rose-100 text-rose-700',
  expired:  'bg-amber-100 text-amber-700',
}

const STAGE_LABEL = {
  inquiry: 'Inquiry', tour: 'Tour', proposal: 'Proposal', booked: 'Booked', lost: 'Lost',
}

export default function ClientDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { getAdminAxios } = useAuth()
  const [couple, setCouple] = useState(null)
  const [stats, setStats] = useState(null)
  const [proposals, setProposals] = useState([])
  const [loading, setLoading] = useState(true)
  const [showEdit, setShowEdit] = useState(false)
  const [form, setForm] = useState({})

  const fetchData = async () => {
    const api = getAdminAxios()
    const [coupleRes, statsRes, proposalsRes] = await Promise.all([
      api.get(`/api/couples/${id}`),
      api.get(`/api/couples/${id}/stats`),
      api.get('/api/proposals'),
    ])
    setCouple(coupleRes.data)
    setStats(statsRes.data)
    setProposals(proposalsRes.data.filter(p => p.couple_id === Number(id)))
    setForm(coupleRes.data)
  }

  useEffect(() => {
    fetchData().finally(() => setLoading(false))
  }, [id])

  const handleEdit = async (e) => {
    e.preventDefault()
    try {
      const api = getAdminAxios()
      await api.put(`/api/couples/${id}`, form)
      toast.success('Couple updated!')
      setShowEdit(false)
      fetchData()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update')
    }
  }

  // Via axios, not a bare <a href> — a navigation sends cookies but not the
  // Authorization header, so linking directly would 401 in a blank tab.
  const printProposal = async (proposalId) => {
    try {
      const r = await getAdminAxios().get(`/api/proposals/${proposalId}/print`, { responseType: 'text' })
      const w = window.open('', '_blank')
      if (!w) { toast.error('Allow pop-ups to download the PDF'); return }
      w.document.write(r.data)
      w.document.close()
    } catch {
      toast.error('Failed to open proposal')
    }
  }

  const generateContract = async (proposalId) => {
    try {
      const api = getAdminAxios()
      await api.post(`/api/contracts/from-proposal/${proposalId}`)
      toast.success('Contract created — go to Contracts to send for signing')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to generate contract')
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this couple? This cannot be undone.')) return
    try {
      const api = getAdminAxios()
      await api.delete(`/api/couples/${id}`)
      toast.success('Couple deleted')
      navigate('/clients')
    } catch (err) {
      toast.error('Failed to delete')
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-rose-600" />
    </div>
  )

  if (!couple) return <div className="text-center py-12 text-gray-400">Couple not found</div>

  const statusColor = {
    lead: 'lead', inquiry: 'inquiry', booked: 'booked',
    completed: 'completed', cancelled: 'cancelled'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/clients')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeftIcon className="w-5 h-5 text-gray-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">
            {couple.partner1_name} & {couple.partner2_name}
          </h1>
          <p className="text-gray-500 text-sm">{couple.email}</p>
        </div>
        {couple.pipeline_stage && (
          <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 font-medium">
            {STAGE_LABEL[couple.pipeline_stage] || couple.pipeline_stage}
          </span>
        )}
        <Badge variant={statusColor[couple.status]} className="text-sm px-3 py-1">
          {couple.status?.charAt(0).toUpperCase() + couple.status?.slice(1)}
        </Badge>
        <Button variant="secondary" size="sm" onClick={() => setShowEdit(true)}>
          <PencilIcon className="w-4 h-4" /> Edit
        </Button>
        <Button variant="danger" size="sm" onClick={handleDelete}>
          <TrashIcon className="w-4 h-4" /> Delete
        </Button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <p className="text-sm text-gray-500">Guests</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{stats.guests?.total || 0}</p>
            <div className="flex gap-4 mt-2 text-xs text-gray-400">
              <span className="text-green-600">{stats.guests?.accepted || 0} accepted</span>
              <span className="text-red-500">{stats.guests?.declined || 0} declined</span>
              <span className="text-amber-500">{stats.guests?.pending || 0} pending</span>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <p className="text-sm text-gray-500">Budget</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              ${stats.budget?.total_actual?.toLocaleString() || 0}
            </p>
            <p className="text-xs text-gray-400 mt-2">
              of ${stats.budget?.total_estimated?.toLocaleString() || 0} estimated
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <p className="text-sm text-gray-500">Checklist Progress</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {stats.checklist?.completed || 0}/{stats.checklist?.total || 0}
            </p>
            <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-rose-500 rounded-full transition-all"
                style={{ width: `${stats.checklist?.total ? (stats.checklist.completed / stats.checklist.total * 100) : 0}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Main info cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Contact Info */}
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Contact Information</h2>
          <dl className="space-y-3">
            {[
              { label: 'Email', value: couple.email },
              { label: 'Phone', value: couple.phone || 'Not provided' },
              { label: 'Created', value: couple.created_at ? format(parseISO(couple.created_at), 'MMM d, yyyy') : '—' },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between text-sm">
                <dt className="text-gray-500">{label}</dt>
                <dd className="font-medium text-gray-900">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Wedding Info */}
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Wedding Details</h2>
          <dl className="space-y-3">
            {[
              { label: 'Wedding Date', value: couple.wedding_date ? new Date(couple.wedding_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'TBD' },
              { label: 'Package', value: couple.venue_package || 'Not selected' },
              { label: 'Budget', value: couple.budget_total > 0 ? `$${couple.budget_total.toLocaleString()}` : 'TBD' },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between text-sm">
                <dt className="text-gray-500">{label}</dt>
                <dd className="font-medium text-gray-900">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {/* Proposals */}
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">Proposals</h2>
          <Link
            to={`/proposals?couple=${id}&new=1`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-rose-600 hover:text-rose-700"
          >
            <PlusIcon className="w-4 h-4" /> New Proposal
          </Link>
        </div>
        {proposals.length === 0 ? (
          <div className="text-center py-8">
            <DocumentDuplicateIcon className="w-10 h-10 text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No proposals yet</p>
            <p className="text-xs text-slate-300 mt-0.5">Build a quote from a package + add-ons and send it for online acceptance.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {proposals.map(p => (
              <div key={p.id} className="flex items-center justify-between gap-3 py-3">
                <Link
                  to={`/proposals?open=${p.id}`}
                  className="flex-1 min-w-0 hover:bg-slate-50 -mx-2 px-2 py-1 rounded-lg transition-colors"
                >
                  <div className="text-sm font-medium text-slate-800 truncate">{p.title}</div>
                  <div className="text-xs text-slate-400">
                    {p.event_date ? format(parseISO(p.event_date), 'MMM d, yyyy') : 'No date'}
                    {p.sent_at ? ` · sent ${format(parseISO(p.sent_at), 'MMM d')}` : ''}
                  </div>
                </Link>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-sm font-semibold text-slate-800">${Number(p.total).toLocaleString()}</span>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${PROPOSAL_STATUS[p.status]}`}>{p.status}</span>
                  <button
                    onClick={() => printProposal(p.id)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
                    title="Print / PDF"
                  >
                    <PrinterIcon className="w-4 h-4" />
                  </button>
                  {p.status === 'accepted' && (
                    <button
                      onClick={() => generateContract(p.id)}
                      className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg"
                      title="Generate Contract"
                    >
                      <DocumentCheckIcon className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Notes */}
      {couple.notes && (
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <h2 className="font-semibold text-gray-900 mb-3">Notes</h2>
          <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{couple.notes}</p>
        </div>
      )}

      {/* Edit Modal */}
      <Modal isOpen={showEdit} onClose={() => setShowEdit(false)} title="Edit Couple" size="lg">
        <form onSubmit={handleEdit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Partner 1 Name" value={form.partner1_name || ''} onChange={e => setForm(f => ({...f, partner1_name: e.target.value}))} required />
            <Input label="Partner 2 Name" value={form.partner2_name || ''} onChange={e => setForm(f => ({...f, partner2_name: e.target.value}))} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Email" type="email" value={form.email || ''} onChange={e => setForm(f => ({...f, email: e.target.value}))} required />
            <Input label="Phone" value={form.phone || ''} onChange={e => setForm(f => ({...f, phone: e.target.value}))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Wedding Date" type="date" value={form.wedding_date || ''} onChange={e => setForm(f => ({...f, wedding_date: e.target.value}))} />
            <Input label="Venue Package" value={form.venue_package || ''} onChange={e => setForm(f => ({...f, venue_package: e.target.value}))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Status" value={form.status || 'lead'} onChange={e => setForm(f => ({...f, status: e.target.value}))}>
              {['lead', 'inquiry', 'booked', 'completed', 'cancelled'].map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </Select>
            <Input label="Budget Total" type="number" value={form.budget_total || ''} onChange={e => setForm(f => ({...f, budget_total: e.target.value}))} />
          </div>
          <Textarea label="Notes" value={form.notes || ''} onChange={e => setForm(f => ({...f, notes: e.target.value}))} />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button type="submit">Save Changes</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
