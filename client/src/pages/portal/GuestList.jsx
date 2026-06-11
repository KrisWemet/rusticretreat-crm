import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input, { Select, Textarea } from '../../components/ui/Input'
import { PlusIcon, UserGroupIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

export default function GuestList() {
  const { getCoupleAxios } = useAuth()
  const [guests, setGuests] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [rsvpFilter, setRsvpFilter] = useState('all')
  const [showAdd, setShowAdd] = useState(false)
  const [editGuest, setEditGuest] = useState(null)
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', phone: '',
    rsvp_status: 'pending', meal_preference: '', plus_one: false,
    dietary_restrictions: '', notes: ''
  })

  const fetchGuests = async () => {
    const api = getCoupleAxios()
    const r = await api.get('/api/guests/portal')
    setGuests(r.data)
  }

  useEffect(() => { fetchGuests().finally(() => setLoading(false)) }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const api = getCoupleAxios()
      if (editGuest) {
        await api.put(`/api/guests/${editGuest.id}`, form)
        toast.success('Guest updated!')
      } else {
        await api.post('/api/guests/portal', form)
        toast.success('Guest added!')
      }
      setShowAdd(false)
      setEditGuest(null)
      resetForm()
      fetchGuests()
    } catch (err) {
      toast.error('Failed to save guest')
    }
  }

  const resetForm = () => setForm({
    first_name: '', last_name: '', email: '', phone: '',
    rsvp_status: 'pending', meal_preference: '', plus_one: false,
    dietary_restrictions: '', notes: ''
  })

  const openEdit = (guest) => {
    setEditGuest(guest)
    setForm({
      first_name: guest.first_name, last_name: guest.last_name,
      email: guest.email || '', phone: guest.phone || '',
      rsvp_status: guest.rsvp_status, meal_preference: guest.meal_preference || '',
      plus_one: guest.plus_one === 1,
      dietary_restrictions: guest.dietary_restrictions || '', notes: guest.notes || ''
    })
    setShowAdd(true)
  }

  const deleteGuest = async (id) => {
    if (!confirm('Remove this guest?')) return
    const api = getCoupleAxios()
    await api.delete(`/api/guests/${id}`)
    toast.success('Guest removed')
    fetchGuests()
  }

  const filtered = guests.filter(g => {
    const matchSearch = !search || `${g.first_name} ${g.last_name} ${g.email}`.toLowerCase().includes(search.toLowerCase())
    const matchRsvp = rsvpFilter === 'all' || g.rsvp_status === rsvpFilter
    return matchSearch && matchRsvp
  })

  const stats = {
    total: guests.length,
    accepted: guests.filter(g => g.rsvp_status === 'accepted').length,
    declined: guests.filter(g => g.rsvp_status === 'declined').length,
    pending: guests.filter(g => g.rsvp_status === 'pending').length,
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Guest List</h1>
          <p className="text-gray-500 text-sm mt-1">{stats.total} total guests</p>
        </div>
        <Button onClick={() => { resetForm(); setEditGuest(null); setShowAdd(true) }}>
          <PlusIcon className="w-4 h-4" />
          Add Guest
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-emerald-50 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-emerald-700">{stats.accepted}</p>
          <p className="text-sm text-emerald-600">Accepted</p>
        </div>
        <div className="bg-amber-50 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-amber-700">{stats.pending}</p>
          <p className="text-sm text-amber-600">Pending</p>
        </div>
        <div className="bg-red-50 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-red-700">{stats.declined}</p>
          <p className="text-sm text-red-600">Declined</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search guests..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
          />
        </div>
        <select
          value={rsvpFilter}
          onChange={e => setRsvpFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white"
        >
          <option value="all">All RSVPs</option>
          <option value="accepted">Accepted</option>
          <option value="pending">Pending</option>
          <option value="declined">Declined</option>
        </select>
      </div>

      {/* Guest table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <UserGroupIcon className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400">No guests found</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left py-3 px-5 text-xs font-semibold text-gray-500 uppercase">Name</th>
                <th className="text-left py-3 px-5 text-xs font-semibold text-gray-500 uppercase">Contact</th>
                <th className="text-left py-3 px-5 text-xs font-semibold text-gray-500 uppercase">RSVP</th>
                <th className="text-left py-3 px-5 text-xs font-semibold text-gray-500 uppercase">Meal</th>
                <th className="text-left py-3 px-5 text-xs font-semibold text-gray-500 uppercase">+1</th>
                <th className="py-3 px-5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(guest => (
                <tr key={guest.id} className="hover:bg-gray-50/50">
                  <td className="py-3 px-5">
                    <p className="text-sm font-medium text-gray-900">{guest.first_name} {guest.last_name}</p>
                    {guest.dietary_restrictions && (
                      <p className="text-xs text-amber-600 mt-0.5">{guest.dietary_restrictions}</p>
                    )}
                  </td>
                  <td className="py-3 px-5">
                    <p className="text-sm text-gray-600">{guest.email || '—'}</p>
                    <p className="text-xs text-gray-400">{guest.phone}</p>
                  </td>
                  <td className="py-3 px-5">
                    <Badge variant={guest.rsvp_status}>
                      {guest.rsvp_status}
                    </Badge>
                  </td>
                  <td className="py-3 px-5">
                    <span className="text-sm text-gray-600 capitalize">{guest.meal_preference || '—'}</span>
                  </td>
                  <td className="py-3 px-5">
                    <span className={`text-sm ${guest.plus_one ? 'text-emerald-600' : 'text-gray-400'}`}>
                      {guest.plus_one ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="py-3 px-5">
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(guest)} className="text-xs text-rose-600 hover:text-rose-700">Edit</button>
                      <button onClick={() => deleteGuest(guest.id)} className="text-xs text-gray-400 hover:text-red-500">Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal isOpen={showAdd} onClose={() => { setShowAdd(false); setEditGuest(null) }}
        title={editGuest ? 'Edit Guest' : 'Add Guest'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="First Name" value={form.first_name} onChange={e => setForm(f => ({...f, first_name: e.target.value}))} required />
            <Input label="Last Name" value={form.last_name} onChange={e => setForm(f => ({...f, last_name: e.target.value}))} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Email" type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} />
            <Input label="Phone" value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="RSVP Status" value={form.rsvp_status} onChange={e => setForm(f => ({...f, rsvp_status: e.target.value}))}>
              <option value="pending">Pending</option>
              <option value="accepted">Accepted</option>
              <option value="declined">Declined</option>
            </Select>
            <Select label="Meal Preference" value={form.meal_preference} onChange={e => setForm(f => ({...f, meal_preference: e.target.value}))}>
              <option value="">No preference</option>
              <option value="chicken">Chicken</option>
              <option value="beef">Beef</option>
              <option value="fish">Fish</option>
              <option value="vegetarian">Vegetarian</option>
              <option value="vegan">Vegan</option>
            </Select>
          </div>
          <Input label="Dietary Restrictions" value={form.dietary_restrictions} onChange={e => setForm(f => ({...f, dietary_restrictions: e.target.value}))} placeholder="Allergies, special needs..." />
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.plus_one} onChange={e => setForm(f => ({...f, plus_one: e.target.checked}))} className="rounded text-rose-600" />
            <span className="text-sm text-gray-700">Plus one (+1)</span>
          </label>
          <Textarea label="Notes" value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} rows={2} />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => { setShowAdd(false); setEditGuest(null) }}>Cancel</Button>
            <Button type="submit">{editGuest ? 'Update' : 'Add'} Guest</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
