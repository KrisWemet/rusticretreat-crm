import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import Modal from '../../components/ui/Modal'
import Input, { Select, Textarea } from '../../components/ui/Input'
import { PlusIcon, CalendarDaysIcon, MapPinIcon, UsersIcon, CurrencyDollarIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'

const paymentStyle = {
  pending: 'bg-amber-100 text-amber-700',
  partial: 'bg-blue-100 text-blue-700',
  paid: 'bg-emerald-100 text-emerald-700',
  overdue: 'bg-red-100 text-red-700',
}

const emptyForm = {
  couple_id: '', event_date: '', start_time: '', end_time: '',
  package_name: '', guest_count: '', ceremony_location: '', reception_location: '',
  catering_type: '', special_requests: '', payment_status: 'pending', deposit_paid: '', total_price: ''
}

export default function Bookings() {
  const { getAdminAxios } = useAuth()
  const [bookings, setBookings] = useState([])
  const [couples, setCouples] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editBooking, setEditBooking] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  const fetchData = async () => {
    const api = getAdminAxios()
    const [bRes, cRes] = await Promise.all([api.get('/api/bookings'), api.get('/api/couples')])
    setBookings(bRes.data)
    setCouples(cRes.data)
  }

  useEffect(() => { fetchData().finally(() => setLoading(false)) }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const api = getAdminAxios()
      const data = { ...form, guest_count: form.guest_count ? parseInt(form.guest_count) : null, deposit_paid: parseFloat(form.deposit_paid) || 0, total_price: parseFloat(form.total_price) || 0 }
      if (editBooking) { await api.put(`/api/bookings/${editBooking.id}`, data); toast.success('Booking updated!') }
      else { await api.post('/api/bookings', data); toast.success('Booking created!') }
      setShowForm(false); setEditBooking(null); setForm(emptyForm); fetchData()
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to save') }
  }

  const openEdit = (b) => {
    setEditBooking(b)
    setForm({ couple_id: b.couple_id, event_date: b.event_date || '', start_time: b.start_time || '', end_time: b.end_time || '', package_name: b.package_name || '', guest_count: b.guest_count || '', ceremony_location: b.ceremony_location || '', reception_location: b.reception_location || '', catering_type: b.catering_type || '', special_requests: b.special_requests || '', payment_status: b.payment_status || 'pending', deposit_paid: b.deposit_paid || '', total_price: b.total_price || '' })
    setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this booking?')) return
    await getAdminAxios().delete(`/api/bookings/${id}`)
    toast.success('Deleted'); fetchData()
  }

  return (
    <div className="p-6 space-y-5 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Bookings</h1>
          <p className="page-subtitle">{bookings.length} total bookings</p>
        </div>
        <button className="btn-primary" onClick={() => { setForm(emptyForm); setEditBooking(null); setShowForm(true) }}>
          <PlusIcon className="w-4 h-4" />
          New Booking
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-7 w-7 border-2 border-rose-200 border-t-rose-600" /></div>
      ) : bookings.length === 0 ? (
        <div className="card py-16 text-center">
          <CalendarDaysIcon className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400">No bookings yet. Create your first booking above.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="table">
            <thead>
              <tr>
                <th>Couple</th>
                <th>Event Date</th>
                <th>Package</th>
                <th>Details</th>
                <th>Financials</th>
                <th>Payment</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {bookings.map(b => (
                <tr key={b.id}>
                  <td>
                    <div className="font-medium text-slate-800">{b.partner1_name} & {b.partner2_name}</div>
                    {b.catering_type && <div className="text-xs text-slate-400 mt-0.5">{b.catering_type}</div>}
                  </td>
                  <td>
                    <div className="font-medium text-slate-700">
                      {b.event_date ? format(parseISO(b.event_date), 'MMM d, yyyy') : 'TBD'}
                    </div>
                    {b.start_time && <div className="text-xs text-slate-400">{b.start_time}{b.end_time ? ` – ${b.end_time}` : ''}</div>}
                  </td>
                  <td className="text-slate-600">{b.package_name || '—'}</td>
                  <td>
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      <UsersIcon className="w-3.5 h-3.5" />
                      {b.guest_count || '—'} guests
                    </div>
                    {b.ceremony_location && (
                      <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                        <MapPinIcon className="w-3.5 h-3.5" />
                        {b.ceremony_location}
                      </div>
                    )}
                  </td>
                  <td>
                    <div className="text-sm font-medium text-slate-800">${(b.total_price || 0).toLocaleString()}</div>
                    <div className="text-xs text-slate-400">Deposit: ${(b.deposit_paid || 0).toLocaleString()}</div>
                  </td>
                  <td>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${paymentStyle[b.payment_status] || 'bg-slate-100 text-slate-500'}`}>
                      {b.payment_status}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <button className="btn-ghost py-1 px-2 text-xs" onClick={() => openEdit(b)}>Edit</button>
                      <button className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition-colors" onClick={() => handleDelete(b.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={showForm} onClose={() => { setShowForm(false); setEditBooking(null) }} title={editBooking ? 'Edit Booking' : 'New Booking'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Select label="Couple" value={form.couple_id} onChange={f('couple_id')} required>
            <option value="">Select couple...</option>
            {couples.map(c => <option key={c.id} value={c.id}>{c.partner1_name} & {c.partner2_name}</option>)}
          </Select>
          <div className="grid grid-cols-3 gap-4">
            <Input label="Event Date" type="date" value={form.event_date} onChange={f('event_date')} required />
            <Input label="Start Time" value={form.start_time} onChange={f('start_time')} placeholder="4:00 PM" />
            <Input label="End Time" value={form.end_time} onChange={f('end_time')} placeholder="11:00 PM" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Package Name" value={form.package_name} onChange={f('package_name')} placeholder="e.g. Grand Estate" />
            <Input label="Guest Count" type="number" value={form.guest_count} onChange={f('guest_count')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Ceremony Location" value={form.ceremony_location} onChange={f('ceremony_location')} />
            <Input label="Reception Location" value={form.reception_location} onChange={f('reception_location')} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Input label="Catering Type" value={form.catering_type} onChange={f('catering_type')} />
            <Select label="Payment Status" value={form.payment_status} onChange={f('payment_status')}>
              {['pending','partial','paid','overdue'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </Select>
            <Input label="Total Price ($)" type="number" value={form.total_price} onChange={f('total_price')} />
          </div>
          <Input label="Deposit Paid ($)" type="number" value={form.deposit_paid} onChange={f('deposit_paid')} />
          <Textarea label="Special Requests" value={form.special_requests} onChange={f('special_requests')} />
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button type="button" className="btn-secondary" onClick={() => { setShowForm(false); setEditBooking(null) }}>Cancel</button>
            <button type="submit" className="btn-primary">{editBooking ? 'Update' : 'Create'} Booking</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
