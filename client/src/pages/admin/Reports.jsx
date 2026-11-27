import { useEffect, useRef, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../../contexts/AuthContext'
import { downloadFile } from '../../utils/files'

// Reports for the books and the business, each downloadable as a CSV for a
// spreadsheet or the accountant. Amounts include 5% GST, as everything in
// this CRM does, so "GST included" is 5/105 of the amount.

const money = (n) => `$${Number(n || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const thisYear = String(new Date().getFullYear())
const todayISO = () => new Date().toLocaleDateString('en-CA')

function Card({ title, subtitle, onCsv, children }) {
  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div><h2 className="font-semibold text-slate-900">{title}</h2>{subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}</div>
        {onCsv && <button className="btn-secondary" onClick={onCsv}><ArrowDownTrayIcon className="w-4 h-4" /> CSV</button>}
      </div>
      {children}
    </section>
  )
}
const Stat = ({ label, value }) => <div><div className="text-xl font-bold text-slate-900">{value}</div><div className="text-xs text-slate-500">{label}</div></div>
const Th = ({ children, right }) => <th className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 ${right ? 'text-right' : 'text-left'}`}>{children}</th>
const Td = ({ children, right }) => <td className={`px-3 py-2 ${right ? 'text-right tabular-nums' : ''}`}>{children}</td>

export default function Reports() {
  const { getAdminAxios } = useAuth()
  const api = useRef(getAdminAxios()).current
  const [range, setRange] = useState({ from: `${thisYear}-01-01`, to: todayISO() })
  const [year, setYear] = useState(thisYear)
  const [payments, setPayments] = useState(null)
  const [owed, setOwed] = useState(null)
  const [bookings, setBookings] = useState(null)
  const [leads, setLeads] = useState(null)
  const [showRows, setShowRows] = useState(false)

  const loadRange = useCallback(async () => {
    const q = `from=${range.from}&to=${range.to}`
    const [p, l] = await Promise.all([api.get(`/api/reports/payments?${q}`), api.get(`/api/reports/leads?${q}`)])
    setPayments(p.data); setLeads(l.data)
  }, [api, range])
  useEffect(() => { loadRange().catch(() => toast.error('Could not load the reports')) }, [loadRange])
  useEffect(() => { api.get(`/api/reports/bookings?year=${year}`).then(r => setBookings(r.data)).catch(() => toast.error('Could not load bookings')) }, [api, year])
  useEffect(() => { api.get('/api/reports/outstanding').then(r => setOwed(r.data)).catch(() => toast.error('Could not load what is owed')) }, [api])

  const csv = (path, name) => async () => {
    try { await downloadFile(api, path, name) } catch { toast.error('Could not download the CSV') }
  }
  const q = `from=${range.from}&to=${range.to}`
  const years = Array.from({ length: 5 }, (_, i) => String(Number(thisYear) - 2 + i))

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-subtitle">Money in, money owed, weddings booked and where couples come from. Each one downloads as CSV.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={csv('/api/damage-deposits?format=csv', `damage-deposits-${todayISO()}.csv`)}><ArrowDownTrayIcon className="w-4 h-4" /> Damage deposits</button>
          <button className="btn-secondary" onClick={csv('/api/reports/couples.csv', `couples-${todayISO()}.csv`)}><ArrowDownTrayIcon className="w-4 h-4" /> All couples’ contact details</button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 card p-4">
        <div className="space-y-1"><label htmlFor="rep-from" className="block text-xs font-medium text-slate-600">From</label><input id="rep-from" name="rep-from" type="date" className="input-field" value={range.from} onChange={e => setRange(r => ({ ...r, from: e.target.value }))} /></div>
        <div className="space-y-1"><label htmlFor="rep-to" className="block text-xs font-medium text-slate-600">To</label><input id="rep-to" name="rep-to" type="date" className="input-field" value={range.to} onChange={e => setRange(r => ({ ...r, to: e.target.value }))} /></div>
        <div className="flex flex-wrap gap-1.5">
          {[['This year', `${thisYear}-01-01`, todayISO()], ['Last year', `${Number(thisYear) - 1}-01-01`, `${Number(thisYear) - 1}-12-31`],
            ['Last 30 days', new Date(Date.now() - 30 * 86400000).toLocaleDateString('en-CA'), todayISO()]].map(([label, from, to]) => (
            <button key={label} className="btn-ghost text-xs" onClick={() => setRange({ from, to })}>{label}</button>
          ))}
        </div>
        <p className="text-xs text-slate-500 basis-full">The dates apply to payments received and to enquiries.</p>
      </div>

      <Card title="Payments received" subtitle={`${range.from} to ${range.to} · by the day the money arrived`} onCsv={csv(`/api/reports/payments?${q}&format=csv`, `payments-${range.from}-to-${range.to}.csv`)}>
        {!payments ? <p className="text-sm text-slate-400">Loading…</p> : (
          <>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <Stat label="Received" value={money(payments.total)} />
              <Stat label="GST included (5/105)" value={money(payments.gst)} />
              <Stat label="Payments" value={payments.rows.length} />
            </div>
            {payments.by_month.length > 0 && (
              <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-slate-50"><Th>Month</Th><Th right>Payments</Th><Th right>Received</Th><Th right>GST included</Th></tr></thead>
                <tbody className="divide-y divide-slate-100">{payments.by_month.map(m => <tr key={m.month}><Td>{m.month}</Td><Td right>{m.count}</Td><Td right>{money(m.amount)}</Td><Td right>{money(m.gst)}</Td></tr>)}</tbody></table></div>
            )}
            {payments.rows.length > 0 && <button className="btn-ghost text-xs mt-2" onClick={() => setShowRows(v => !v)}>{showRows ? 'Hide' : 'Show'} each payment</button>}
            {showRows && (
              <div className="overflow-x-auto mt-2"><table className="w-full text-sm"><thead><tr className="bg-slate-50"><Th>Date</Th><Th>Couple</Th><Th>For</Th><Th>Method</Th><Th right>Amount</Th></tr></thead>
                <tbody className="divide-y divide-slate-100">{payments.rows.map((r, i) => <tr key={i}><Td>{r.date}</Td><Td><Link className="text-rose-600 hover:underline" to={`/clients/${r.couple_id}`}>{r.couple}</Link></Td><Td>{r.description}</Td><Td>{[r.method, r.reference].filter(Boolean).join(' · ')}</Td><Td right>{money(r.amount)}</Td></tr>)}</tbody></table></div>
            )}
            {payments.rows.length === 0 && <p className="text-sm text-slate-400">No payments recorded in these dates.</p>}
          </>
        )}
      </Card>

      <Card title="Still owed" subtitle={owed ? `As of ${owed.as_of}, oldest first. Cancelled and archived couples are left out.` : ''} onCsv={csv('/api/reports/outstanding?format=csv', `outstanding-${todayISO()}.csv`)}>
        {!owed ? <p className="text-sm text-slate-400">Loading…</p> : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-4">
              <Stat label="Total owed" value={money(owed.total)} />
              {owed.buckets.map(b => <Stat key={b.bucket} label={`${b.bucket} (${b.count})`} value={money(b.amount)} />)}
            </div>
            {owed.rows.length > 0 ? (
              <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-slate-50"><Th>Couple</Th><Th>For</Th><Th>Due</Th><Th>Status</Th><Th right>Amount</Th></tr></thead>
                <tbody className="divide-y divide-slate-100">{owed.rows.map((r, i) => (
                  <tr key={i}><Td><Link className="text-rose-600 hover:underline" to={`/clients/${r.couple_id}`}>{r.couple}</Link></Td><Td>{r.description}</Td><Td>{r.due_date || '—'}</Td>
                    <Td><span className={r.status === 'Not yet due' ? 'text-slate-500' : 'text-red-600 font-medium'}>{r.status}</span></Td><Td right>{money(r.amount)}</Td></tr>))}</tbody></table></div>
            ) : <p className="text-sm text-slate-400">Nothing owed.</p>}
          </>
        )}
      </Card>

      <Card title="Weddings by year" subtitle="Booked weddings with check-in in the chosen year" onCsv={csv(`/api/reports/bookings?year=${year}&format=csv`, `bookings-${year}.csv`)}>
        <div className="mb-4 w-40">
          <label htmlFor="rep-year" className="block text-xs font-medium text-slate-600 mb-1">Year</label>
          <select id="rep-year" name="rep-year" className="input-field" value={year} onChange={e => setYear(e.target.value)}>{years.map(y => <option key={y} value={y}>{y}</option>)}</select>
        </div>
        {!bookings ? <p className="text-sm text-slate-400">Loading…</p> : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <Stat label="Weddings" value={bookings.count} /><Stat label="Booked value" value={money(bookings.booked_value)} />
              <Stat label="Paid" value={money(bookings.paid)} /><Stat label="Balance" value={money(bookings.balance)} />
            </div>
            {bookings.rows.length > 0 ? (
              <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-slate-50"><Th>Couple</Th><Th>Dates</Th><Th>Package</Th><Th right>Guests</Th><Th right>Paid</Th><Th right>Balance</Th></tr></thead>
                <tbody className="divide-y divide-slate-100">{bookings.rows.map((r, i) => (
                  <tr key={i} className={r.status === 'cancelled' ? 'text-slate-400 line-through' : ''}><Td><Link className="text-rose-600 hover:underline" to={`/clients/${r.couple_id}`}>{r.couple}</Link></Td><Td>{r.check_in} – {r.check_out}</Td><Td>{r.package}</Td><Td right>{r.guests}</Td><Td right>{money(r.paid)}</Td><Td right>{money(r.balance)}</Td></tr>))}</tbody></table></div>
            ) : <p className="text-sm text-slate-400">No weddings booked for {year}.</p>}
          </>
        )}
      </Card>

      <Card title="Enquiries by source" subtitle={`${range.from} to ${range.to} · where couples heard about you, and how many booked`} onCsv={csv(`/api/reports/leads?${q}&format=csv`, `leads-${range.from}-to-${range.to}.csv`)}>
        {!leads ? <p className="text-sm text-slate-400">Loading…</p> : (
          <>
            <div className="grid grid-cols-3 gap-4 mb-4"><Stat label="Enquiries" value={leads.total} /><Stat label="Booked" value={leads.won} /><Stat label="Booking rate" value={`${leads.conversion}%`} /></div>
            {leads.sources.length > 0 ? (
              <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-slate-50"><Th>Heard about us</Th><Th right>Enquiries</Th><Th right>Booked</Th><Th right>Lost</Th><Th right>Open</Th><Th right>Rate</Th><Th right>Booked value</Th></tr></thead>
                <tbody className="divide-y divide-slate-100">{leads.sources.map(s => <tr key={s.source}><Td>{s.source}</Td><Td right>{s.leads}</Td><Td right>{s.won}</Td><Td right>{s.lost}</Td><Td right>{s.open}</Td><Td right>{s.conversion}%</Td><Td right>{money(s.value)}</Td></tr>)}</tbody></table></div>
            ) : <p className="text-sm text-slate-400">No enquiries in these dates.</p>}
          </>
        )}
      </Card>
    </div>
  )
}
