import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import Modal from '../../components/ui/Modal'
import Input, { Select } from '../../components/ui/Input'
import { PlusIcon, MagnifyingGlassIcon, FunnelIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'

const STATUS_OPTIONS = ['lead', 'inquiry', 'booked', 'completed', 'cancelled']

const statusStyle = {
  lead: 'bg-blue-100 text-blue-700',
  inquiry: 'bg-amber-100 text-amber-700',
  booked: 'bg-emerald-100 text-emerald-700',
  completed: 'bg-slate-100 text-slate-600',
  cancelled: 'bg-red-100 text-red-600',
}

const emptyForm = {
  partner1_name: '', partner2_name: '', email: '', partner2_email: '', phone: '',
  wedding_date: '', venue_package: '', status: 'lead', notes: '', budget_total: ''
}

export default function Clients() {
  const { getAdminAxios } = useAuth()
  const [couples, setCouples] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  const fetchCouples = async () => {
    const api = getAdminAxios()
    const params = new URLSearchParams()
    if (search) params.append('search', search)
    if (statusFilter) params.append('status', statusFilter)
    const r = await api.get(`/api/couples?${params}`)
    setCouples(r.data)
  }

  // Debounced: the search box used to fire a request on every keystroke, so
  // typing a name meant one round trip per letter. The status dropdown is not
  // debounced separately — it changes at most once per click and rides the same
  // 300ms with no perceptible delay.
  useEffect(() => {
    const t = setTimeout(() => {
      fetchCouples().catch(() => {}).finally(() => setLoading(false))
    }, search ? 300 : 0)
    return () => clearTimeout(t)
  }, [search, statusFilter])

  const handleAdd = async (e) => {
    e.preventDefault()
    try {
      const api = getAdminAxios()
      await api.post('/api/couples', { ...form, budget_total: form.budget_total ? parseFloat(form.budget_total) : 0 })
      toast.success('Couple added!')
      setShowAdd(false)
      setForm(emptyForm)
      fetchCouples()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add couple')
    }
  }

  const counts = STATUS_OPTIONS.reduce((acc, s) => {
    acc[s] = couples.filter(c => c.status === s).length
    return acc
  }, {})

  return (
    <div className="p-6 space-y-5 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Clients & Leads</h1>
          <p className="page-subtitle">{couples.length} total records</p>
        </div>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>
          <PlusIcon className="w-4 h-4" />
          Add Couple
        </button>
      </div>

      {/* Status tabs + Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 flex-shrink-0">
          <button
            onClick={() => setStatusFilter('')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${!statusFilter ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-700'}`}
          >
            All ({couples.length})
          </button>
          {STATUS_OPTIONS.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s === statusFilter ? '' : s)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize ${statusFilter === s ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            id="clients-search"
            name="clients-search"
            type="text"
            aria-label="Search clients by name or email"
            placeholder="Search by name or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-field pl-9"
          />
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-7 w-7 border-2 border-rose-200 border-t-rose-600" />
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Couple</th>
                <th>Contact</th>
                <th>Wedding Date</th>
                <th>Package</th>
                <th>Status</th>
                <th>Budget</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {couples.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400">No couples found</td></tr>
              ) : couples.map(c => (
                <tr key={c.id}>
                  <td>
                    <Link to={`/clients/${c.id}`} className="flex items-center gap-3 group">
                      <div className="w-9 h-9 bg-rose-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-rose-700 text-xs font-bold">
                          {c.partner1_name?.charAt(0)}{c.partner2_name?.charAt(0)}
                        </span>
                      </div>
                      <span className="font-medium text-slate-800 group-hover:text-rose-600 transition-colors">
                        {c.partner1_name} & {c.partner2_name}
                      </span>
                    </Link>
                  </td>
                  <td>
                    <div className="text-slate-700">{c.email}</div>
                    <div className="text-xs text-slate-400">{c.phone}</div>
                  </td>
                  <td className="text-slate-600">
                    {c.wedding_date ? format(parseISO(c.wedding_date), 'MMM d, yyyy') : <span className="text-slate-300">TBD</span>}
                  </td>
                  <td className="text-slate-600">{c.venue_package || <span className="text-slate-300">—</span>}</td>
                  <td>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${statusStyle[c.status]}`}>{c.status}</span>
                  </td>
                  <td className="font-medium text-slate-800">
                    {c.budget_total > 0 ? `$${c.budget_total.toLocaleString()}` : <span className="text-slate-300">—</span>}
                  </td>
                  <td>
                    <Link to={`/clients/${c.id}`} className="text-xs text-rose-600 hover:text-rose-700 font-medium">View →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Modal */}
      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add New Couple" size="lg">
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Partner 1 Name" value={form.partner1_name} onChange={f('partner1_name')} required />
            <Input label="Partner 2 Name" value={form.partner2_name} onChange={f('partner2_name')} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Partner 1 Email" type="email" value={form.email} onChange={f('email')} required />
            <Input
              label="Partner 2 Email"
              type="email"
              value={form.partner2_email}
              onChange={f('partner2_email')}
              required
            />
          </div>
          <p className="-mt-2 text-xs text-slate-400">
            Each partner signs the contract separately from their own address, so their signatures
            are independently attributable. Both addresses are required and must be different.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Phone" value={form.phone} onChange={f('phone')} />
            <Input label="Venue Package" value={form.venue_package} onChange={f('venue_package')} placeholder="e.g. Grand Estate" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Wedding Date" type="date" value={form.wedding_date} onChange={f('wedding_date')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Status" value={form.status} onChange={f('status')}>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </Select>
            <Input label="Budget" type="number" value={form.budget_total} onChange={f('budget_total')} placeholder="0" />
          </div>
          <div>
            <label htmlFor="clients-notes-1" className="label">Notes</label>
            <textarea id="clients-notes-1" name="clients-notes-1" value={form.notes} onChange={f('notes')} rows={3} className="input-field resize-none" />
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button type="button" className="btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
            <button type="submit" className="btn-primary">Add Couple</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
