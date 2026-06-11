import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import Modal from '../../components/ui/Modal'
import Input, { Select, Textarea } from '../../components/ui/Input'
import { PlusIcon, UserGroupIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const rsvpStyle = {
  accepted: 'bg-emerald-100 text-emerald-700',
  pending: 'bg-amber-100 text-amber-700',
  declined: 'bg-red-100 text-red-700',
}

const emptyForm = {
  first_name: '', last_name: '', email: '', phone: '',
  rsvp_status: 'pending', meal_preference: '', plus_one: false,
  dietary_restrictions: '', notes: ''
}

export default function GuestList() {
  const { getCoupleAxios } = useAuth()
  const [guests, setGuests] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [rsvpFilter, setRsvpFilter] = useState('all')
  const [showAdd, setShowAdd] = useState(false)
  const [editGuest, setEditGuest] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  const fetchGuests = async () => {
    const r = await getCoupleAxios().get('/api/guests/portal')
    setGuests(r.data)
  }

  useEffect(() => { fetchGuests().finally(() => setLoading(false)) }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const api = getCoupleAxios()
      if (editGuest) { await api.put(`/api/guests/${editGuest.id}`, form); toast.success('Guest updated!') }
      else { await api.post('/api/guests/portal', form); toast.success('Guest added!') }
      setShowAdd(false); setEditGuest(null); setForm(emptyForm); fetchGuests()
    } catch { toast.error('Failed to save guest') }
  }

  const openEdit = (guest) => {
    setEditGuest(guest)
    setForm({ first_name: guest.first_name, last_name: guest.last_name, email: guest.email || '', phone: guest.phone || '', rsvp_status: guest.rsvp_status, meal_preference: guest.meal_preference || '', plus_one: guest.plus_one === 1, dietary_restrictions: guest.dietary_restrictions || '', notes: guest.notes || '' })
    setShowAdd(true)
  }

  const deleteGuest = async (id) => {
    if (!confirm('Remove this guest?')) return
    await getCoupleAxios().delete(`/api/guests/${id}`)
    toast.success('Guest removed'); fetchGuests()
  }

  const filtered = guests.filter(g => {
    const ms = !search || `${g.first_name} ${g.last_name} ${g.email}`.toLowerCase().includes(search.toLowerCase())
    const mr = rsvpFilter === 'all' || g.rsvp_status === rsvpFilter
    return ms && mr
  })

  const stats = {
    total: guests.length,
    accepted: guests.filter(g => g.rsvp_status === 'accepted').length,
    declined: guests.filter(g => g.rsvp_status === 'declined').length,
    pending: guests.filter(g => g.rsvp_status === 'pending').length,
    plusOnes: guests.filter(g => g.plus_one).length,
  }

  return (
    <div className="p-6 space-y-5 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Guest List</h1>
          <p className="page-subtitle">{stats.total} guests · {stats.plusOnes} with +1</p>
        </div>
        <button className="btn-primary" onClick={() => { setForm(emptyForm); setEditGuest(null); setShowAdd(true) }}>
          <PlusIcon className="w-4 h-4" />
          Add Guest
        </button>
      </div>

      {/* RSVP Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total', value: stats.total, color: 'bg-slate-50 border-slate-200', val: 'text-slate-800' },
          { label: 'Accepted', value: stats.accepted, color: 'bg-emerald-50 border-emerald-100', val: 'text-emerald-700' },
          { label: 'Pending', value: stats.pending, color: 'bg-amber-50 border-amber-100', val: 'text-amber-700' },
          { label: 'Declined', value: stats.declined, color: 'bg-red-50 border-red-100', val: 'text-red-700' },
        ].map(({ label, value, color, val }) => (
          <div key={label} className={`rounded-xl border p-4 text-center ${color}`}>
            <div className={`text-2xl font-bold ${val}`}>{value}</div>
            <div className="text-xs text-slate-500 mt-0.5 font-medium">{label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Search guests by name or email..." value={search} onChange={e => setSearch(e.target.value)} className="input-field pl-9" />
        </div>
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
          {['all', 'accepted', 'pending', 'declined'].map(s => (
            <button key={s} onClick={() => setRsvpFilter(s)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize ${rsvpFilter === s ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-700'}`}>
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-7 w-7 border-2 border-rose-200 border-t-rose-500" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center"><UserGroupIcon className="w-12 h-12 text-slate-200 mx-auto mb-3" /><p className="text-slate-400">No guests found</p></div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Contact</th>
                <th>RSVP</th>
                <th>Meal</th>
                <th>+1</th>
                <th>Dietary</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(guest => (
                <tr key={guest.id}>
                  <td className="font-medium text-slate-800">{guest.first_name} {guest.last_name}</td>
                  <td>
                    <div className="text-slate-600">{guest.email || '—'}</div>
                    {guest.phone && <div className="text-xs text-slate-400">{guest.phone}</div>}
                  </td>
                  <td>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${rsvpStyle[guest.rsvp_status]}`}>{guest.rsvp_status}</span>
                  </td>
                  <td className="text-slate-600 capitalize">{guest.meal_preference || '—'}</td>
                  <td>
                    <span className={`text-xs font-medium ${guest.plus_one ? 'text-emerald-600' : 'text-slate-300'}`}>{guest.plus_one ? 'Yes' : 'No'}</span>
                  </td>
                  <td className="text-xs text-amber-600">{guest.dietary_restrictions || <span className="text-slate-300">—</span>}</td>
                  <td>
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(guest)} className="text-xs text-rose-600 hover:text-rose-700 font-medium">Edit</button>
                      <button onClick={() => deleteGuest(guest.id)} className="text-xs text-slate-400 hover:text-red-500">Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal isOpen={showAdd} onClose={() => { setShowAdd(false); setEditGuest(null) }} title={editGuest ? 'Edit Guest' : 'Add Guest'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="First Name" value={form.first_name} onChange={f('first_name')} required />
            <Input label="Last Name" value={form.last_name} onChange={f('last_name')} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Email" type="email" value={form.email} onChange={f('email')} />
            <Input label="Phone" value={form.phone} onChange={f('phone')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="RSVP Status" value={form.rsvp_status} onChange={f('rsvp_status')}>
              <option value="pending">Pending</option>
              <option value="accepted">Accepted</option>
              <option value="declined">Declined</option>
            </Select>
            <Select label="Meal Preference" value={form.meal_preference} onChange={f('meal_preference')}>
              <option value="">No preference</option>
              {['Chicken', 'Beef', 'Fish', 'Vegetarian', 'Vegan'].map(m => <option key={m} value={m.toLowerCase()}>{m}</option>)}
            </Select>
          </div>
          <Input label="Dietary Restrictions" value={form.dietary_restrictions} onChange={f('dietary_restrictions')} placeholder="Allergies, halal, gluten-free..." />
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" checked={form.plus_one} onChange={e => setForm(p => ({ ...p, plus_one: e.target.checked }))} className="w-4 h-4 rounded text-rose-600 border-slate-300" />
            <span className="text-sm text-slate-700">Bringing a plus one (+1)</span>
          </label>
          <Textarea label="Notes" value={form.notes} onChange={f('notes')} rows={2} />
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button type="button" className="btn-secondary" onClick={() => { setShowAdd(false); setEditGuest(null) }}>Cancel</button>
            <button type="submit" className="btn-primary">{editGuest ? 'Update' : 'Add'} Guest</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
