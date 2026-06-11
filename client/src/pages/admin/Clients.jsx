import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input, { Select } from '../../components/ui/Input'
import { PlusIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const STATUS_OPTIONS = ['lead', 'inquiry', 'booked', 'completed', 'cancelled']

export default function Clients() {
  const { getAdminAxios } = useAuth()
  const [couples, setCouples] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({
    partner1_name: '', partner2_name: '', email: '', phone: '',
    wedding_date: '', venue_package: '', status: 'lead', notes: '', budget_total: ''
  })

  const fetchCouples = async () => {
    const api = getAdminAxios()
    const params = new URLSearchParams()
    if (search) params.append('search', search)
    if (statusFilter) params.append('status', statusFilter)
    const r = await api.get(`/api/couples?${params}`)
    setCouples(r.data)
  }

  useEffect(() => {
    fetchCouples().finally(() => setLoading(false))
  }, [search, statusFilter])

  const handleAdd = async (e) => {
    e.preventDefault()
    try {
      const api = getAdminAxios()
      await api.post('/api/couples', { ...form, budget_total: form.budget_total ? parseFloat(form.budget_total) : 0 })
      toast.success('Couple added successfully!')
      setShowAdd(false)
      setForm({ partner1_name: '', partner2_name: '', email: '', phone: '', wedding_date: '', venue_package: '', status: 'lead', notes: '', budget_total: '' })
      fetchCouples()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add couple')
    }
  }

  const statusColor = {
    lead: 'lead', inquiry: 'inquiry', booked: 'booked',
    completed: 'completed', cancelled: 'cancelled'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clients & Leads</h1>
          <p className="text-gray-500 text-sm mt-1">{couples.length} total records</p>
        </div>
        <Button onClick={() => setShowAdd(true)}>
          <PlusIcon className="w-4 h-4" />
          Add Couple
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white"
        >
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map(s => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-600"></div>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wide">Couple</th>
                <th className="text-left py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wide">Contact</th>
                <th className="text-left py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wide">Wedding Date</th>
                <th className="text-left py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wide">Package</th>
                <th className="text-left py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-left py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wide">Budget</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {couples.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-400 text-sm">
                    No couples found
                  </td>
                </tr>
              ) : couples.map(couple => (
                <tr key={couple.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="py-4 px-6">
                    <Link to={`/clients/${couple.id}`} className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-rose-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-rose-700 text-xs font-bold">
                          {couple.partner1_name?.charAt(0)}{couple.partner2_name?.charAt(0)}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900 hover:text-rose-700">
                          {couple.partner1_name} & {couple.partner2_name}
                        </p>
                      </div>
                    </Link>
                  </td>
                  <td className="py-4 px-6">
                    <p className="text-sm text-gray-600">{couple.email}</p>
                    <p className="text-xs text-gray-400">{couple.phone}</p>
                  </td>
                  <td className="py-4 px-6">
                    <span className="text-sm text-gray-600">
                      {couple.wedding_date
                        ? new Date(couple.wedding_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : <span className="text-gray-300">TBD</span>}
                    </span>
                  </td>
                  <td className="py-4 px-6">
                    <span className="text-sm text-gray-600">{couple.venue_package || <span className="text-gray-300">—</span>}</span>
                  </td>
                  <td className="py-4 px-6">
                    <Badge variant={statusColor[couple.status]}>
                      {couple.status?.charAt(0).toUpperCase() + couple.status?.slice(1)}
                    </Badge>
                  </td>
                  <td className="py-4 px-6">
                    <span className="text-sm font-medium text-gray-900">
                      {couple.budget_total > 0
                        ? `$${couple.budget_total.toLocaleString()}`
                        : <span className="text-gray-300">—</span>}
                    </span>
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
            <Input label="Partner 1 Name" value={form.partner1_name} onChange={e => setForm(f => ({...f, partner1_name: e.target.value}))} required />
            <Input label="Partner 2 Name" value={form.partner2_name} onChange={e => setForm(f => ({...f, partner2_name: e.target.value}))} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Email" type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} required />
            <Input label="Phone" value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Wedding Date" type="date" value={form.wedding_date} onChange={e => setForm(f => ({...f, wedding_date: e.target.value}))} />
            <Input label="Venue Package" value={form.venue_package} onChange={e => setForm(f => ({...f, venue_package: e.target.value}))} placeholder="e.g. Grand Estate" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Status" value={form.status} onChange={e => setForm(f => ({...f, status: e.target.value}))}>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </Select>
            <Input label="Budget Total" type="number" value={form.budget_total} onChange={e => setForm(f => ({...f, budget_total: e.target.value}))} placeholder="0" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({...f, notes: e.target.value}))}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 resize-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button type="submit">Add Couple</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
