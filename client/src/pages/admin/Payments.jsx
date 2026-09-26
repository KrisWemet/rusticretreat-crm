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
  ScissorsIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid'
import toast from 'react-hot-toast'
import { format, parseISO, isPast, isToday, addDays } from 'date-fns'

const EMPTY_FORM = {
  couple_id: '', description: '', amount: '', due_date: '', notes: '', payment: '',
}
const EMPTY_SCHEDULE = { couple_id: '', total_price: '', wedding_date: '' }

const round2 = (n) => Math.round(Number(n) * 100) / 100
const money = (n) => `$${Number(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
// When a payment is split, the second part is due this many days after the first.
const SPLIT_GAP_DAYS = 14

// Payment choices in Add Invoice. `key` picks the matching row of the standard
// schedule (for its label and due date); `pct` is the share of the booking total.
const PAYMENT_CHOICES = [
  { value: 'deposit', label: 'Deposit (25%)', key: 'deposit', pct: 25 },
  { value: 'second', label: 'Second payment (25%)', key: 'second', pct: 25 },
  { value: 'balance', label: 'Final balance (50%)', key: 'balance', pct: 50 },
  { value: 'deposit-half', label: 'Half of the deposit (12.5%)', key: 'deposit', pct: 12.5 },
]

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
  const [scheduleForm, setScheduleForm] = useState(EMPTY_SCHEDULE)
  const [scheduleItems, setScheduleItems] = useState([])
  // Booking total and standard schedule for the couple picked in Add Invoice.
  const [addBooking, setAddBooking] = useState(null)
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

  useEffect(() => { fetchData().catch(() => {}).finally(() => setLoading(false)) }, [])

  const preview = async (total, checkIn) =>
    (await getAdminAxios().post('/api/invoices/schedule-preview', { total_price: Number(total), wedding_date: checkIn || null })).data

  // When couple is selected in Add form, load their booking so a payment can be
  // picked as a share of its total.
  const handleCoupleSelectAdd = async (coupleId) => {
    setForm(p => ({ ...p, couple_id: coupleId, payment: '' }))
    setAddBooking(null)
    if (!coupleId) return
    try {
      const r = await getAdminAxios().get(`/api/bookings/couple/${coupleId}`)
      const b = r.data[0]
      if (b) setForm(p => ({ ...p, due_date: b.event_date || '' }))
      if (b && Number(b.total_price) > 0) {
        setAddBooking({ total: Number(b.total_price), checkIn: b.event_date, schedule: await preview(b.total_price, b.event_date) })
      }
    } catch {}
  }

  const choosePayment = (value) => {
    const choice = PAYMENT_CHOICES.find(c => c.value === value)
    if (!choice || !addBooking) { setForm(p => ({ ...p, payment: value })); return }
    const row = addBooking.schedule.find(s => s.key === choice.key)
    setForm(p => ({
      ...p,
      payment: value,
      amount: String(round2(addBooking.total * choice.pct / 100)),
      description: choice.value === 'deposit-half' ? 'Booking Deposit (25%) — half payment (12.5%)' : row.label,
      due_date: row.due_date || '',
    }))
  }

  // Paid invoices stay when the schedule is replaced, so the new payments only
  // need to cover what is left.
  const alreadyPaid = round2(invoices
    .filter(i => String(i.couple_id) === String(scheduleForm.couple_id) && i.paid)
    .reduce((s, i) => s + i.amount, 0))
  const scheduleOwed = round2(Number(scheduleForm.total_price || 0) - alreadyPaid)
  const scheduleSum = round2(scheduleItems.reduce((s, i) => s + (Number(i.amount) || 0), 0))
  const scheduleBalanced = scheduleItems.length > 0 && Math.abs(scheduleSum - scheduleOwed) < 0.005

  // The standard schedule reloads whenever the total or date changes; staff
  // then adjust it (split a payment, move a date) before saving.
  useEffect(() => {
    if (!showSchedule || !(Number(scheduleForm.total_price) > 0)) { setScheduleItems([]); return }
    let cancelled = false
    preview(scheduleForm.total_price, scheduleForm.wedding_date)
      .then(rows => { if (!cancelled) setScheduleItems(rows.map(r => ({ description: r.label, amount: String(r.amount), due_date: r.due_date || '' }))) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [showSchedule, scheduleForm.total_price, scheduleForm.wedding_date])

  const editItem = (i, k) => (e) => setScheduleItems(items => items.map((it, j) => j === i ? { ...it, [k]: e.target.value } : it))
  const removeItem = (i) => setScheduleItems(items => items.filter((_, j) => j !== i))
  const addItem = () => setScheduleItems(items => [...items, { description: '', amount: '', due_date: '' }])
  const splitItem = (i) => setScheduleItems(items => {
    const it = items[i]
    const first = round2((Number(it.amount) || 0) / 2)
    const second = round2((Number(it.amount) || 0) - first)
    const later = it.due_date ? format(addDays(parseISO(it.due_date), SPLIT_GAP_DAYS), 'yyyy-MM-dd') : ''
    return [
      ...items.slice(0, i),
      { ...it, description: `${it.description} — part 1 of 2`, amount: String(first) },
      { ...it, description: `${it.description} — part 2 of 2`, amount: String(second), due_date: later },
      ...items.slice(i + 1),
    ]
  })

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
      const bRes = await getAdminAxios().get(`/api/bookings/couple/${scheduleForm.couple_id}`)
      const booking = bRes.data[0]
      await getAdminAxios().post(`/api/invoices/schedule/${scheduleForm.couple_id}`, {
        booking_id: booking?.id || null,
        total_price: Number(scheduleForm.total_price),
        wedding_date: scheduleForm.wedding_date || booking?.event_date || null,
        items: scheduleItems.map(i => ({ description: i.description, amount: Number(i.amount), due_date: i.due_date || null })),
      })
      toast.success('Payment schedule created!')
      setShowSchedule(false)
      setScheduleForm(EMPTY_SCHEDULE)
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
              <div className="text-xl font-bold text-slate-800">{money(totalCollected)}</div>
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
              <div className="text-xl font-bold text-slate-800">{money(totalOwed)}</div>
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
                    <td className="font-semibold text-slate-800">{money(inv.amount)}</td>
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
      <Modal isOpen={showAdd} onClose={() => { setShowAdd(false); setForm(EMPTY_FORM); setAddBooking(null) }} title="Add Invoice">
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
          <div>
            <Select label="Payment" value={form.payment} onChange={e => choosePayment(e.target.value)} disabled={!addBooking}>
              <option value="">Custom amount</option>
              {PAYMENT_CHOICES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
            <p className="text-xs text-slate-400 mt-1">
              {!form.couple_id ? 'Pick a couple to choose a share of their booking total.'
                : !addBooking ? 'This couple has no booking total yet, so enter the amount yourself.'
                : form.payment ? `${PAYMENT_CHOICES.find(c => c.value === form.payment).pct}% of the ${money(addBooking.total)} booking total.`
                : `Booking total ${money(addBooking.total)}.`}
            </p>
          </div>
          <Input label="Description" value={form.description} onChange={f('description')} required placeholder="e.g. Booking Deposit (25%)" />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="payment-amount" className="label">Amount ($) <span className="text-red-500">*</span></label>
              <input id="payment-amount" name="payment-amount" type="number" min="0" step="0.01" required value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value, payment: '' }))} className="input-field" placeholder="0.00" />
            </div>
            <Input type="date" label="Due Date" value={form.due_date} onChange={f('due_date')} />
          </div>
          <Input label="Notes (optional)" value={form.notes} onChange={f('notes')} />
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button type="button" className="btn-secondary" onClick={() => { setShowAdd(false); setForm(EMPTY_FORM); setAddBooking(null) }}>Cancel</button>
            <button type="submit" className="btn-primary">Add Invoice</button>
          </div>
        </form>
      </Modal>

      {/* Auto schedule modal */}
      <Modal isOpen={showSchedule} onClose={() => setShowSchedule(false)} title="Generate Payment Schedule" size="lg">
        <form onSubmit={handleSchedule} className="space-y-4">
          <p className="text-sm text-slate-500">Starts from the three payments in the signed agreement: 25% deposit now, 25% at 180 days before check-in, and the 50% balance at 90 days before check-in. If you've agreed a different plan with the couple, adjust the payments below. For example, split the deposit into two payments two weeks apart.</p>
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
          {scheduleItems.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="label mb-0">Payments</span>
                <span className="text-xs text-slate-400">Changing the total or date resets these.</span>
              </div>
              {alreadyPaid > 0 && (
                <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg p-2">
                  This couple has already paid {money(alreadyPaid)}. Those invoices are kept, so remove or reduce the payments below that they cover.
                </p>
              )}
              {scheduleItems.map((it, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <input aria-label={`Payment ${i + 1} description`} className="input-field col-span-6" value={it.description} onChange={editItem(i, 'description')} required />
                  <input aria-label={`Payment ${i + 1} amount`} type="number" min="0.01" step="0.01" className="input-field col-span-2" value={it.amount} onChange={editItem(i, 'amount')} required />
                  <input aria-label={`Payment ${i + 1} due date`} type="date" className="input-field col-span-3" value={it.due_date} onChange={editItem(i, 'due_date')} />
                  <div className="col-span-1 flex">
                    <button type="button" title="Split into two payments" aria-label={`Split payment ${i + 1} into two`} onClick={() => splitItem(i)} className="btn-ghost p-1 text-slate-500"><ScissorsIcon className="w-4 h-4" /></button>
                    <button type="button" title="Remove" aria-label={`Remove payment ${i + 1}`} onClick={() => removeItem(i)} className="btn-ghost p-1 text-red-400"><XMarkIcon className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between pt-1">
                <button type="button" className="text-xs text-rose-600 hover:underline" onClick={addItem}>+ Add payment</button>
                <span data-testid="schedule-sum" className={`text-xs font-medium ${scheduleBalanced ? 'text-emerald-600' : 'text-red-600'}`}>
                  {money(scheduleSum)} of {money(scheduleOwed)}{alreadyPaid > 0 ? ` still owed (${money(alreadyPaid)} already paid)` : ''}
                  {!scheduleBalanced && ` · ${scheduleSum > scheduleOwed ? 'over' : 'short'} by ${money(Math.abs(scheduleSum - scheduleOwed))}`}
                </span>
              </div>
            </div>
          )}
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
            This will delete any unpaid invoices for this couple and replace them with the new schedule. Paid invoices are kept.
          </p>
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button type="button" className="btn-secondary" onClick={() => setShowSchedule(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={!scheduleBalanced}>Create Schedule</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
