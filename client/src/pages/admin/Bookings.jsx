import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import Modal from '../../components/ui/Modal'
import Input, { Select, Textarea } from '../../components/ui/Input'
import { PlusIcon, CalendarDaysIcon, MapPinIcon, UsersIcon, CurrencyDollarIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'
import { packagePriceFor, withGst } from '../../utils/packagePrice'
import { CEREMONY_SPACES, RECEPTION_SPACES } from '../../utils/options'

const paymentStyle = {
  pending: 'bg-amber-100 text-amber-700',
  partial: 'bg-blue-100 text-blue-700',
  paid: 'bg-emerald-100 text-emerald-700',
  overdue: 'bg-red-100 text-red-700',
}

const money = (n) => `$${Number(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// Package price for the check-in year plus GST, or null when the package isn't
// one we know (a retired or hand-typed name on an older booking).
function expectedTotal(packages, form) {
  const pkg = packages.find(p => p.name === form.package_name)
  return pkg ? withGst(packagePriceFor(pkg, form.event_date)) : null
}

const emptyForm = {
  couple_id: '', wedding_date: '', event_date: '', end_date: '',
  package_name: '', guest_count: '', ceremony_location: '', reception_location: '',
  catering_type: '', add_ons: '', special_requests: '', payment_status: 'pending', deposit_paid: '', total_price: ''
}

export default function Bookings() {
  const { getAdminAxios } = useAuth()
  const [bookings, setBookings] = useState([])
  const [couples, setCouples] = useState([])
  const [packages, setPackages] = useState([])
  const [addons, setAddons] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [search, setSearch] = useState('')
  const [when, setWhen] = useState('upcoming')
  const [showForm, setShowForm] = useState(false)
  const [editBooking, setEditBooking] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  // Changing the package or check-in date refills the total, unless staff have
  // typed their own figure (anything other than the previous suggestion).
  const fPriced = (k) => (e) => setForm(p => {
    const next = { ...p, [k]: e.target.value }
    const before = expectedTotal(packages, p)
    const after = expectedTotal(packages, next)
    const untouched = p.total_price === '' || (before != null && Number(p.total_price) === before)
    if (after != null && untouched) next.total_price = String(after)
    return next
  })

  // Locations offered: the venue's spaces plus anything typed on earlier bookings.
  const spaces = (base, key) => [...new Set([...base, ...bookings.map(b => b[key]).filter(Boolean)])]
  const unitLabel = { per_guest: ' per guest', per_night: ' per night' }
  const addAddon = (e) => {
    const a = addons.find(x => String(x.id) === e.target.value)
    if (!a) return
    const item = `${a.name} – $${Number(a.price).toLocaleString('en-CA')}${unitLabel[a.unit] || ''}`
    setForm(p => ({ ...p, add_ons: p.add_ons ? `${p.add_ons}, ${item}` : item }))
  }

  const expected = expectedTotal(packages, form)
  const selectedPkg = packages.find(p => p.name === form.package_name)
  const totalDiffers = expected != null && form.total_price !== '' && Math.abs(Number(form.total_price) - expected) > 0.005
  const packageOptions = packages.filter(p => p.is_active || p.name === form.package_name)
  const unknownPackage = form.package_name && !packages.some(p => p.name === form.package_name)

  const fetchData = async () => {
    const api = getAdminAxios()
    const [bRes, cRes, pRes, aRes] = await Promise.all([api.get('/api/bookings'), api.get('/api/couples'), api.get('/api/packages'), api.get('/api/addons?active=1')])
    setBookings(bRes.data)
    setCouples(cRes.data)
    setPackages(pRes.data)
    setAddons(aRes.data)
  }

  useEffect(() => {
    fetchData()
      .then(() => setLoadError(null))
      .catch(err => setLoadError(err.response?.data?.error || 'Could not load bookings'))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    setForm({ couple_id: b.couple_id, wedding_date: b.wedding_date || '', event_date: b.event_date || '', end_date: b.end_date || '', package_name: b.package_name || '', guest_count: b.guest_count || '', ceremony_location: b.ceremony_location || '', reception_location: b.reception_location || '', catering_type: b.catering_type || '', add_ons: b.add_ons || '', special_requests: b.special_requests || '', payment_status: b.payment_status || 'pending', deposit_paid: b.deposit_paid || '', total_price: b.total_price || '' })
    setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this booking?')) return
    try {
      await getAdminAxios().delete(`/api/bookings/${id}`)
      toast.success('Deleted'); fetchData()
    } catch (err) { toast.error(err.response?.data?.error || 'Could not delete the booking') }
  }

  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const q = search.trim().toLowerCase()
  const lastDay = (b) => (b.end_date || b.event_date || '').slice(0, 10)
  const shown = bookings
    .filter(b => !b.couple_archived_at)
    .filter(b => when === 'all' || (when === 'upcoming' ? (!b.event_date || lastDay(b) >= todayStr) : (b.event_date && lastDay(b) < todayStr)))
    .filter(b => !q || `${b.partner1_name} ${b.partner2_name} ${b.package_name || ''} ${b.couple_email || ''}`.toLowerCase().includes(q))
  // Past bookings read best newest first.
  if (when === 'past') shown.reverse()

  return (
    <div className="p-6 space-y-5 max-w-7xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Bookings</h1>
          <p className="page-subtitle">{bookings.length} total bookings</p>
        </div>
        <button className="btn-primary" onClick={() => { setForm(emptyForm); setEditBooking(null); setShowForm(true) }}>
          <PlusIcon className="w-4 h-4" />
          New Booking
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
          {[['upcoming', 'Upcoming'], ['past', 'Past'], ['all', 'All']].map(([key, label]) => (
            <button key={key} onClick={() => setWhen(key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${when === key ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-700'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[10rem]">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="search" aria-label="Search bookings" placeholder="Search by couple, package or email…" value={search} onChange={e => setSearch(e.target.value)} className="input-field pl-9" />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-7 w-7 border-2 border-rose-200 border-t-rose-600" /></div>
      ) : loadError ? (
        <div className="card py-10 text-center text-sm text-red-600">{loadError}</div>
      ) : shown.length === 0 && bookings.length > 0 ? (
        <div className="card py-12 text-center text-slate-400">No {when === 'all' ? '' : when} bookings{q ? ' match your search' : ''}.</div>
      ) : bookings.length === 0 ? (
        <div className="card py-16 text-center">
          <CalendarDaysIcon className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400">No bookings yet. Create your first booking above.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
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
              {shown.map(b => (
                <tr key={b.id}>
                  <td>
                    <Link to={`/clients/${b.couple_id}`} className="font-medium text-slate-800 hover:text-rose-600">{b.partner1_name} & {b.partner2_name}</Link>
                    {b.add_ons && <div className="text-xs text-slate-400 mt-0.5">Add-ons: {b.add_ons}</div>}
                  </td>
                  <td>
                    <div className="font-medium text-slate-700">
                      {b.event_date ? format(parseISO(b.event_date), 'MMM d') : 'TBD'}
                      {b.end_date && b.end_date !== b.event_date ? ` – ${format(parseISO(b.end_date), 'MMM d')}` : ''}
                      {b.event_date ? `, ${format(parseISO(b.event_date), 'yyyy')}` : ''}
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
                    <div className="text-sm font-medium text-slate-800">${(b.total_price || 0).toLocaleString()} CAD</div>
                    <div className="text-xs text-slate-400">{b.invoiced_total > 0 ? `Paid ${money(b.paid_total)} of ${money(b.invoiced_total)}` : 'No invoices yet'}</div>
                  </td>
                  <td>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${paymentStyle[b.payment_status] || 'bg-slate-100 text-slate-500'}`}>
                      {b.payment_schedule_missing ? 'No invoices' : b.payment_status}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Wedding / Ceremony Date" type="date" value={form.wedding_date} onChange={f('wedding_date')} />
            <Input label="Check-In Date" type="date" value={form.event_date} onChange={fPriced('event_date')} required />
            <Input label="Check-Out Date" type="date" value={form.end_date} onChange={f('end_date')} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select label="Package" value={form.package_name} onChange={fPriced('package_name')}>
              <option value="">Select package...</option>
              {packageOptions.map(p => <option key={p.id} value={p.name}>{p.name}{p.is_active ? '' : ' (retired)'}</option>)}
              {unknownPackage && <option value={form.package_name}>{form.package_name} (not in package list)</option>}
            </Select>
            <Input label="Guest Count" type="number" min="1" max="100" value={form.guest_count} onChange={f('guest_count')} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Ceremony Location" value={form.ceremony_location} onChange={f('ceremony_location')} placeholder="Pick or type a location" list="ceremony-spaces" />
            <Input label="Reception / Dancing" value={form.reception_location} onChange={f('reception_location')} placeholder="Pick or type a location" list="reception-spaces" />
            <datalist id="ceremony-spaces">{spaces(CEREMONY_SPACES, 'ceremony_location').map(s => <option key={s} value={s} />)}</datalist>
            <datalist id="reception-spaces">{spaces(RECEPTION_SPACES, 'reception_location').map(s => <option key={s} value={s} />)}</datalist>
          </div>
          <Input label="Food & Beverage Notes" value={form.catering_type} onChange={f('catering_type')} placeholder="e.g. Self-arranged BBQ + food truck Saturday. No kitchen on-site." />
          <div className="space-y-1">
            <Input label="Add-Ons" value={form.add_ons} onChange={f('add_ons')} placeholder="e.g. Fireworks – $250, Generator rental, Pet cabin stay – $50" />
            {addons.length > 0 && (
              <select aria-label="Add an add-on from the list" className="input-field text-sm" value="" onChange={addAddon}>
                <option value="">+ Add from the add-on list...</option>
                {addons.map(a => <option key={a.id} value={a.id}>{a.name} – ${Number(a.price).toLocaleString('en-CA')}{unitLabel[a.unit] || ''}</option>)}
              </select>
            )}
          </div>
          <div>
            <div className="space-y-1">
              <Input label="Total Package Price (CAD, incl. GST)" type="number" step="0.01" value={form.total_price} onChange={f('total_price')} placeholder="6825" />
              {expected != null && !totalDiffers && (
                <p className="text-xs text-slate-500">{money(packagePriceFor(selectedPkg, form.event_date))} + 5% GST</p>
              )}
              {totalDiffers && (
                <p className="text-xs text-amber-700">
                  {form.package_name}{form.event_date ? ` (${form.event_date.slice(0, 4)})` : ''} with 5% GST is {money(expected)}. Fine if this total includes add-ons, otherwise{' '}
                  <button type="button" className="underline font-medium" onClick={() => setForm(p => ({ ...p, total_price: String(expected) }))}>use {money(expected)}</button>.
                </p>
              )}
            </div>
          </div>
          <p className="text-xs text-slate-400">Payments are tracked as invoices on the Payments page; this booking's payment status follows them.</p>
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
