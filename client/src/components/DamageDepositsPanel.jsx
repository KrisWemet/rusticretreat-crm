import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '../contexts/AuthContext'
import { downloadFile, dayLabel } from '../utils/files'

// Damage deposits on the Payments page: the money the venue is holding right
// now, and whose refund is still to send. Kept apart from invoices because a
// refundable deposit is not income.

const money = (n) => `$${Number(n || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const day = (d) => (d ? dayLabel(d, { month: 'short', day: 'numeric', year: 'numeric' }) : '')
const LABEL = { held: 'Holding · inspect after check-out', refund_due: 'Refund to send' }

export default function DamageDepositsPanel() {
  const { getAdminAxios } = useAuth()
  const api = useRef(getAdminAxios()).current
  const [data, setData] = useState(null)
  useEffect(() => { api.get('/api/damage-deposits').then(r => setData(r.data)).catch(() => setData(null)) }, [api])
  if (!data || !data.deposits.length) return null

  const open = data.deposits.filter(d => d.status === 'held' || d.status === 'refund_due')
  const csv = async () => {
    try { await downloadFile(api, '/api/damage-deposits?format=csv', 'damage-deposits.csv') }
    catch { toast.error('Could not download the deposits') }
  }
  return (
    <div className="card p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold text-slate-900">Damage deposits</h2>
          <p className="text-xs text-slate-500">Refundable deposits are held money, not income, so they are not in the invoice totals above.</p>
        </div>
        <button className="btn-ghost text-xs" onClick={csv}>Download all (CSV)</button>
      </div>
      <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm">
        <div><span className="text-slate-500">Holding now </span><span className="font-semibold text-slate-900">{money(data.totals.held_now)}</span> <span className="text-slate-400">({data.totals.held_count})</span></div>
        <div><span className="text-slate-500">Kept for deductions, all time </span><span className="font-semibold text-slate-900">{money(data.totals.kept)}</span></div>
      </div>
      {open.length > 0 && (
        <ul className="divide-y divide-slate-100 text-sm">
          {open.map(d => (
            <li key={d.couple_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <Link to={`/clients/${d.couple_id}?tab=event`} className="font-medium text-slate-800 hover:text-rose-600">{d.couple_names}</Link>
              <span className={`text-xs ${d.status === 'refund_due' ? 'text-amber-700 font-medium' : d.inspection_overdue ? 'text-red-600 font-medium' : 'text-slate-500'}`}>
                {d.status === 'refund_due' ? `${LABEL.refund_due}: ${money(d.refund_due)}` : `${money(d.received)} · ${d.inspection_overdue ? `inspection overdue (due ${day(d.inspection_due)})` : `inspect by ${day(d.inspection_due)}`}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
