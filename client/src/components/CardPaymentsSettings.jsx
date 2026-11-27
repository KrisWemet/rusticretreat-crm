import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '../contexts/AuthContext'

// Card payments: whether they are switched on (Stripe keys in Railway) and the
// card fee passed on to couples. e-Transfer stays free and preferred.

export default function CardPaymentsSettings() {
  const { getAdminAxios, user } = useAuth()
  const api = useRef(getAdminAxios()).current
  const isAdmin = user?.role === 'admin'
  const [s, setS] = useState(null)
  const [pct, setPct] = useState('')
  useEffect(() => { api.get('/api/payments/card-settings').then(r => { setS(r.data); setPct(String(r.data.fee_pct)) }).catch(() => {}) }, [api])
  if (!s) return null
  const save = async () => {
    try { const { data } = await api.put('/api/payments/card-settings', { fee_pct: pct }); setS(data); setPct(String(data.fee_pct)); toast.success('Card fee saved') }
    catch (err) { toast.error(err.response?.data?.error || 'Could not save the card fee') }
  }
  return (
    <div className="card p-5 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-slate-900">Card payments</h2>
          <p className="text-xs text-slate-500 mt-0.5">Couples can pay an invoice by credit card from its private pay link, with the card fee added as its own line. e-Transfer stays free.</p>
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${s.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{s.enabled ? 'On' : 'Off'}</span>
      </div>
      {!s.enabled && <p className="text-sm text-slate-600">Off until a Stripe account is connected: its keys go into Railway's settings (STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET). Until then, pay links still show the invoice and your e-Transfer details.</p>}
      <div className="flex items-center gap-3">
        <label htmlFor="card-fee-pct" className="text-sm text-slate-700">Card fee (%)</label>
        <input id="card-fee-pct" name="card-fee-pct" type="number" min="0" max={s.max_fee_pct} step="0.1" disabled={!isAdmin} value={pct} onChange={e => setPct(e.target.value)} className="input-field w-24 text-right" />
        {isAdmin && <button className="btn-primary" onClick={save} disabled={String(s.fee_pct) === pct}>Save</button>}
      </div>
      <p className="text-xs text-slate-500">Canadian card rules: at most {s.max_fee_pct}% on credit cards, none on debit cards, and you must tell Visa, Mastercard and your card processor 30 days before you start charging it.</p>
    </div>
  )
}
