import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input, { Select, Textarea } from '../../components/ui/Input'
import { PlusIcon, CalendarDaysIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'

export default function Bookings() {
  const { getAdminAxios } = useAuth()
  const [bookings, setBookings] = useState([])
  const [couples, setCouples] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editBooking, setEditBooking] = useState(null)
  const [form, setForm] = useState({
    couple_id: '', event_date: '', start_time: '', end_time: '',
    package_name: '', guest_count: '', ceremony_location: '', reception_location: '',
    catering_type: '', special_requests: '', payment_status: 'pending', deposit_paid: '', total_price: ''
  })

  const fetchData = async () => {
    const api = getAdminAxios()
    const [bookingsRes, couplesRes] = await Promise.all([
      api.get('/api/bookings'),
      api.get('/api/couples')
    ])
    setBookings(bookingsRes.data)
    setCouples(couplesRes.data)
  }

  useEffect(() => { fetchData().finally(() => setLoading(false)) }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const api = getAdminAxios()
      const data = {
        ...form,
        guest_count: form.guest_count ? parseInt(form.guest_count) : null,
        deposit_paid: form.deposit_paid ? parseFloat(form.deposit_paid) : 0,
        total_price: form.total_price ? parseFloat(form.total_price) : 0
      }
      if (editBooking) {
        await api.put(`/api/bookings/${editBooking.id}`, data)
        toast.success('Booking updated!')
      } else {
        await api.post('/api/bookings', data)
        toast.success('Booking created!')
      }
      setShowAdd(false)
      setEditBooking(null)
      resetForm()
      fetchData()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save booking')
    }
  }

  const resetForm = () => setForm({
    couple_id: '', event_date: '', start_time: '', end_time: '',
    package_name: '', guest_count: '', ceremony_location: '', reception_location: '',
    catering_type: '', special_requests: '', payment_status: 'pending', deposit_paid: '', total_price: ''
  })

  const openEdit = (booking) => {
    setEditBooking(booking)
    setForm({
      couple_id: booking.couple_id, event_date: booking.event_date || '',
      start_time: booking.start_time || '', end_time: booking.end_time || '',
      package_name: booking.package_name || '', guest_count: booking.guest_count || '',
      ceremony_location: booking.ceremony_location || '', reception_location: booking.reception_location || '',
      catering_type: booking.catering_type || '', special_requests: booking.special_requests || '',
      payment_status: booking.payment_status || 'pending',
      deposit_paid: booking.deposit_paid || '', total_price: booking.total_price || ''
    })
    setShowAdd(true)
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this booking?')) return
    const api = getAdminAxios()
    await api.delete(`/api/bookings/${id}`)
    toast.success('Booking deleted')
    fetchData()
  }

  const paymentColor = { pending: 'pending', partial: 'partial', paid: 'paid', overdue: 'overdue' }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bookings</h1>
          <p className="text-gray-500 text-sm mt-1">{bookings.length} total bookings</p>
        </div>
        <Button onClick={() => { resetForm(); setEditBooking(null); setShowAdd(true) }}>
          <PlusIcon className="w-4 h-4" />
          New Booking
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-600" />
        </div>
      ) : bookings.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 py-16 text-center">
          <CalendarDaysIcon className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400">No bookings yet</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {bookings.map(booking => (
            <div key={booking.id} className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-gray-900">
                      {booking.partner1_name} & {booking.partner2_name}
                    </h3>
                    <Badge variant={paymentColor[booking.payment_status]}>
                      {booking.payment_status}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-gray-400 text-xs">Event Date</p>
                      <p className="font-medium text-gray-900">
                        {booking.event_date ? format(parseISO(booking.event_date), 'MMM d, yyyy') : 'TBD'}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs">Time</p>
                      <p className="font-medium text-gray-900">
                        {booking.start_time && booking.end_time ? `${booking.start_time} – ${booking.end_time}` : 'TBD'}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs">Package</p>
                      <p className="font-medium text-gray-900">{booking.package_name || '—'}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs">Guests</p>
                      <p className="font-medium text-gray-900">{booking.guest_count || '—'}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs">Total Price</p>
                      <p className="font-medium text-gray-900">${booking.total_price?.toLocaleString() || 0}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs">Deposit Paid</p>
                      <p className="font-medium text-gray-900">${booking.deposit_paid?.toLocaleString() || 0}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs">Ceremony</p>
                      <p className="font-medium text-gray-900">{booking.ceremony_location || '—'}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs">Reception</p>
                      <p className="font-medium text-gray-900">{booking.reception_location || '—'}</p>
                    </div>
                  </div>
                  {booking.special_requests && (
                    <p className="text-xs text-gray-400 mt-2 bg-gray-50 p-2 rounded-lg">
                      <span className="font-medium">Special requests:</span> {booking.special_requests}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 ml-4">
                  <Button variant="secondary" size="sm" onClick={() => openEdit(booking)}>Edit</Button>
                  <Button variant="danger" size="sm" onClick={() => handleDelete(booking.id)}>Delete</Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={showAdd} onClose={() => { setShowAdd(false); setEditBooking(null) }}
        title={editBooking ? 'Edit Booking' : 'New Booking'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Select label="Couple" value={form.couple_id} onChange={e => setForm(f => ({...f, couple_id: e.target.value}))} required>
            <option value="">Select couple...</option>
            {couples.map(c => (
              <option key={c.id} value={c.id}>{c.partner1_name} & {c.partner2_name}</option>
            ))}
          </Select>
          <div className="grid grid-cols-3 gap-4">
            <Input label="Event Date" type="date" value={form.event_date} onChange={e => setForm(f => ({...f, event_date: e.target.value}))} required />
            <Input label="Start Time" value={form.start_time} onChange={e => setForm(f => ({...f, start_time: e.target.value}))} placeholder="4:00 PM" />
            <Input label="End Time" value={form.end_time} onChange={e => setForm(f => ({...f, end_time: e.target.value}))} placeholder="11:00 PM" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Package Name" value={form.package_name} onChange={e => setForm(f => ({...f, package_name: e.target.value}))} />
            <Input label="Guest Count" type="number" value={form.guest_count} onChange={e => setForm(f => ({...f, guest_count: e.target.value}))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Ceremony Location" value={form.ceremony_location} onChange={e => setForm(f => ({...f, ceremony_location: e.target.value}))} />
            <Input label="Reception Location" value={form.reception_location} onChange={e => setForm(f => ({...f, reception_location: e.target.value}))} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Input label="Catering Type" value={form.catering_type} onChange={e => setForm(f => ({...f, catering_type: e.target.value}))} />
            <Select label="Payment Status" value={form.payment_status} onChange={e => setForm(f => ({...f, payment_status: e.target.value}))}>
              <option value="pending">Pending</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
            </Select>
            <Input label="Total Price" type="number" value={form.total_price} onChange={e => setForm(f => ({...f, total_price: e.target.value}))} />
          </div>
          <Input label="Deposit Paid" type="number" value={form.deposit_paid} onChange={e => setForm(f => ({...f, deposit_paid: e.target.value}))} />
          <Textarea label="Special Requests" value={form.special_requests} onChange={e => setForm(f => ({...f, special_requests: e.target.value}))} />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => { setShowAdd(false); setEditBooking(null) }}>Cancel</Button>
            <Button type="submit">{editBooking ? 'Update' : 'Create'} Booking</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
