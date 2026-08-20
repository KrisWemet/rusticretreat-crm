import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import Modal from '../../components/ui/Modal'
import Input, { Select } from '../../components/ui/Input'
import {
  PlusIcon,
  CurrencyDollarIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  TrashIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid'
import toast from 'react-hot-toast'
import { format, parseISO, isPast, isToday } from 'date-fns'

const EMPTY_FORM = {
  couple_id: '', description: '', amount: '', due_date: '', notes: '',
}

function dueBadge(due_date, paid) {
  if (paid) return null
  if (!due_date) return null
  const d = parseISO(due_date)
  if (isPast(d) && !isToday(d)) return { label: 'Overdue', cls: 'bg-red-100 text-red-700' }
  if (isToday(d)) return { label: 'Due Today', cls: 'bg-amber-100 text-amber-700' }
  return null
}

export default function Payments() {
  const { getAdminAxios } = useAuth()
  const [invoices, setInvoices] = useState([])
  const [couples, setCouples] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)
  const [scheduleForm, setScheduleForm] = useState({ couple_id: '', total_price: '', wedding_date: '' })
  const [form, setForm] = useState(EMPTY_FORM)
  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))
  const sf = (k) => (e) => setScheduleForm(p => ({ ...p, [k]: e.target.value }))
  const [filterCouple, setFilterCouple] = useState('')

  const fetchData = async () => {
    const api = getAdminAxios()
    const [iRes, cRes] = await Promise.all([api.get('/api/invoices'), api.get('/api/couples')])
    setInvoices(iRes.data)
    setCouples(cRes.data)
  }

  useEffect(() => { fetchData().finally(() => setLoading(false)) }, [])

  // When couple is selected in Add form, auto-fill from their booking
  const handleCoupleSelectAdd = async (coupleId) => {
    setForm(p => ({ ...p, couple_id: coupleId }))
    if (!coupleId) return
    try {
      const r = await getAdminAxios().get(`/api/bookings/couple/${coupleId}`)
      const b = r.data[0]
      if (b) setForm(p => ({ ...p, due_date: b.event_date || '' }))
    } catch {}
  }

  // When couple selected for schedule, auto-fill total + wedding date
  const handleCoupleSelectSchedule = async (coupleId) => {
    setScheduleForm(p => ({ ...p, couple_id: coupleId }))
    if (!coupleId) return
    try {
      const r = await getAdminAxios().get(`/api/bookings/couple/${coupleId}`)
      const b = r.data[0]
      if (b) setScheduleForm(p => ({ ...p, total_price: String(b.total_price || ''), wedding_date: b.event_date || '' }))
      else {
        const couple = couples.find(c => String(c.id) === String(coupleId))
        if (couple) setScheduleForm(p => ({ ...p, wedding_date: couple.wedding_date || '' }))
      }
    } catch {}
  }

  const handleAdd = async (e) => {
    e.preventDefault()
    try {
      await getAdminAxios().post('/api/invoices', {
        couple_id: form.couple_id,
        description: form.description,
        amount: Number(form.amount),
        due_date: form.due_date || null,
        notes: form.notes || null,
      })
      toast.success('Invoice added!')
      setShowAdd(false)
      setForm(EMPTY_FORM)
      fetchData()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add invoice')
    }
  }

  const handleSchedule = async (e) => {
    e.preventDefault()
    try {
      const couple = couples.find(c => String(c.id) === String(scheduleForm.couple_id))
      const bRes = await getAdminAxios().get(`/api/bookings/couple/${scheduleForm.couple_id}`)
      const booking = bRes.data[0]
      await getAdminAxios().post(`/api/invoices/schedule/${scheduleForm.couple_id}`, {
        booking_id: booking?.id || null,
        total_price: Number(scheduleForm.total_price),
        wedding_date: scheduleForm.wedding_date || booking?.event_date || null,
      })
      toast.success('Payment schedule created!')
      setShowSchedule(false)
      setScheduleForm({ couple_id: '', total_price: '', wedding_date: '' })
      fetchData()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create schedule')
    }
  }

  const togglePaid = async (inv) => {
    try {
      await getAdminAxios().patch(`/api/invoices/${inv.id}/paid`, { paid: !inv.paid })
      toast.success(inv.paid ? 'Marked unpaid' : 'Marked paid!')
      fetchData()
    } catch {
      toast.error('Failed to update')
    }
  }

  const deleteInvoice = async (id) => {
    if (!confirm('Delete this invoice?')) return
    await getAdminAxios().delete(`/api/invoices/${id}`)
    toast.success('Deleted')
    fetchData()
  }

  const filtered = filterCouple ? invoices.filter(i => String(i.couple_id) === filterCouple) : invoices
  const totalOwed    = filtered.filter(i => !i.paid).reduce((s, i) => s + i.amount, 0)
  const totalCollected = filtered.filter(i => i.paid).reduce((s, i) => s + i.amount, 0)
  const overdue      = filtered.filter(i => !i.paid && i.due_date && isPast(parseISO(i.due_date)) && !isToday(parseISO(i.due_date)))

  return (
    <div className="p-6 space-y-5 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Payments</h1>
          <p className="page-subtitle">{invoices.length} invoices · {overdue.length > 0 ? `${overdue.length} overdue` : 'no overdue'}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setShowSchedule(true)}>
            <SparklesIcon className="w-4 h-4" />
            Auto Schedule
          </button>
          <button className="btn-primary" onClick={() => setShowAdd(true)}>
            <PlusIcon className="w-4 h-4" />
            Add Invoice
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
              <CheckCircleIcon className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <div className="text-xl font-bold text-slate-800">${totalCollected.toLocaleString()}</div>
              <div className="text-xs text-slate-400">Collected</div>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <ClockIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="text-xl font-bold text-slate-800">${totalOwed.toLocaleString()}</div>
              <div className="text-xs text-slate-400">Outstanding</div>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${overdue.length > 0 ? 'bg-red-100' : 'bg-slate-100'}`}>
              <ExclamationTriangleIcon className={`w-5 h-5 ${overdue.length > 0 ? 'text-red-600' : 'text-slate-400'}`} />
            </div>
            <div>
              <div className={`text-xl font-bold ${overdue.length > 0 ? 'text-red-700' : 'text-slate-800'}`}>{overdue.length}</div>
              <div className="text-xs text-slate-400">Overdue</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <select
          id="payments-filter-couple"
          name="payments-filter-couple"
          aria-label="Filter invoices by client"
          value={filterCouple}
          onChange={e => setFilterCouple(e.target.value)}
          className="input-field w-64"
        >
          <option value="">All clients</option>
          {couples.map(c => (
            <option key={c.id} value={c.id}>{c.partner1_name} & {c.partner2_name}</option>
          ))}
        </select>
        {filterCouple && (
          <button onClick={() => setFilterCouple('')} className="text-xs text-slate-400 hover:text-slate-600">Clear filter</button>
        )}
      </div>

      {/* Invoice table */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-7 w-7 border-2 border-rose-200 border-t-rose-600" /></div>
      ) : filtered.length === 0 ? (
        <div className="card py-16 text-center">
          <CurrencyDollarIcon className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">No invoices yet</p>
          <p className="text-xs text-slate-300 mt-1">Use "Auto Schedule" to generate a standard 3-payment schedule, or add invoices manually.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Description</th>
                <th>Amount</th>
                <th>Due Date</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(inv => {
                const badge = dueBadge(inv.due_date, inv.paid)
                return (
                  <tr key={inv.id} className={inv.paid ? 'opacity-60' : ''}>
                    <td>
                      <Link to={`/clients/${inv.couple_id}`} className="font-medium text-slate-700 hover:text-rose-600">
                        {inv.partner1_name} & {inv.partner2_name}
                      </Link>
                    </td>
                    <td>
                      <div className="text-slate-700">{inv.description}</div>
                      {inv.notes && <div className="text-xs text-slate-400 mt-0.5">{inv.notes}</div>}
                    </td>
                    <td className="font-semibold text-slate-800">${inv.amount.toLocaleString()}</td>
                    <td>
                      {inv.due_date ? (
                        <div>
                          <div className="text-sm text-slate-600">{format(parseISO(inv.due_date), 'MMM d, yyyy')}</div>
                          {badge && (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.cls}`}>{badge.label}</span>
                          )}
                        </div>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td>
                      <button
                        onClick={() => togglePaid(inv)}
                        className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                          inv.paid
                            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        {inv.paid ? <CheckCircleSolid className="w-3.5 h-3.5" /> : <ClockIcon className="w-3.5 h-3.5" />}
                        {inv.paid ? 'Paid' : 'Unpaid'}
                      </button>
                      {/* !! matters: inv.paid is SQLite's integer 0, and React
                          renders a bare 0 as the text "0", not as nothing. */}
                      {!!inv.paid && inv.paid_at && (
                        <div className="text-xs text-slate-400 mt-0.5">{format(parseISO(inv.paid_at), 'MMM d')}</div>
                      )}
                    </td>
                    <td>
                      <button onClick={() => deleteInvoice(inv.id)} className="btn-ghost py-1 px-2 text-xs text-red-400 hover:bg-red-50">
                        <TrashIcon className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add invoice modal */}
      <Modal isOpen={showAdd} onClose={() => { setShowAdd(false); setForm(EMPTY_FORM) }} title="Add Invoice">
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label htmlFor="invoice-couple" className="label">Client Couple <span className="text-red-500">*</span></label>
            <select
              id="invoice-couple"
              name="invoice-couple"
              value={form.couple_id}
              onChange={e => handleCoupleSelectAdd(e.target.value)}
              required
              className="input-field"
            >
              <option value="">Select couple...</option>
              {couples.map(c => <option key={c.id} value={c.id}>{c.partner1_name} & {c.partner2_name}</option>)}
            </select>
          </div>
          <Input label="Description" value={form.description} onChange={f('description')} required placeholder="e.g. Booking Deposit (25%)" />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="payment-amount" className="label">Amount ($) <span className="text-red-500">*</span></label>
              <input id="payment-amount" name="payment-amount" type="number" min="0" step="0.01" required value={form.amount} onChange={f('amount')} className="input-field" placeholder="0.00" />
            </div>
            <Input type="date" label="Due Date" value={form.due_date} onChange={f('due_date')} />
          </div>
          <Input label="Notes (optional)" value={form.notes} onChange={f('notes')} />
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button type="button" className="btn-secondary" onClick={() => { setShowAdd(false); setForm(EMPTY_FORM) }}>Cancel</button>
            <button type="submit" className="btn-primary">Add Invoice</button>
          </div>
        </form>
      </Modal>

      {/* Auto schedule modal */}
      <Modal isOpen={showSchedule} onClose={() => setShowSchedule(false)} title="Generate Payment Schedule">
        <form onSubmit={handleSchedule} className="space-y-4">
          <p className="text-sm text-slate-500">Creates three standard invoices: 25% deposit, 25% at 90 days before event, and 50% final balance at 30 days before event.</p>
          <div>
            <label htmlFor="schedule-couple" className="label">Client Couple <span className="text-red-500">*</span></label>
            <select
              id="schedule-couple"
              name="schedule-couple"
              value={scheduleForm.couple_id}
              onChange={e => handleCoupleSelectSchedule(e.target.value)}
              required
              className="input-field"
            >
              <option value="">Select couple...</option>
              {couples.map(c => <option key={c.id} value={c.id}>{c.partner1_name} & {c.partner2_name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="schedule-total-price" className="label">Total Contract Price ($) <span className="text-red-500">*</span></label>
              <input id="schedule-total-price" name="schedule-total-price" type="number" min="0" step="0.01" required value={scheduleForm.total_price} onChange={sf('total_price')} className="input-field" placeholder="0.00" />
            </div>
            <Input type="date" label="Wedding Date" value={scheduleForm.wedding_date} onChange={sf('wedding_date')} />
          </div>
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
            This will delete any unpaid invoices for this couple and replace them with the new schedule.
          </p>
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button type="button" className="btn-secondary" onClick={() => setShowSchedule(false)}>Cancel</button>
            <button type="submit" className="btn-primary">Create Schedule</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
