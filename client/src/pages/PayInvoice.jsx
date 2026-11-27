import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import axios from 'axios'

// The page a couple opens from an invoice's private pay link. No login: the
// link's token is the key. e-Transfer is shown first (free, preferred); card
// payment appears only when the venue has switched it on, with its fee shown
// as its own line before they pay.

const money = (n) => `$${Number(n || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const day = (d) => (d ? new Intl.DateTimeFormat('en-CA', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(String(d).slice(0, 10) + 'T00:00:00Z')) : '')

export default function PayInvoice() {
  const { token } = useParams()
  const [params] = useSearchParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    axios.get(`/api/payments/public/${token}`).then(r => setData(r.data))
      .catch(err => setError(err.response?.data?.error || 'This payment link could not be loaded.'))
  }, [token])

  const payByCard = async () => {
    setBusy(true); setError('')
    try { const { data: r } = await axios.post(`/api/payments/public/${token}/checkout`); window.location.href = r.url }
    catch (err) { setError(err.response?.data?.error || 'Could not start the card payment.'); setBusy(false) }
  }

  const shell = (body) => (
    <div className="min-h-screen bg-stone-50 py-10 px-4">
      <div className="max-w-xl mx-auto bg-white rounded-2xl shadow-sm border border-stone-200 p-6 sm:p-8">
        <p className="text-xs uppercase tracking-widest text-rose-600 font-semibold mb-1">Rustic Retreat</p>
        {body}
      </div>
    </div>
  )
  if (!data) return shell(<p className="text-slate-600 mt-2">{error || 'Loading…'}</p>)

  const paidNow = params.get('paid') === '1'
  if (data.paid || paidNow) {
    return shell(
      <div className="py-6">
        <h1 className="text-2xl font-semibold text-slate-800 mb-2">Thank you!</h1>
        <p className="text-slate-600">{data.paid ? `"${data.description}" is paid.` : 'Your card payment went through. It can take a minute to show as paid.'} You'll get a receipt by email.</p>
      </div>
    )
  }

  return shell(
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">{data.description}</h1>
        <p className="text-sm text-slate-500 mt-1">For {data.couple}{data.due_date ? ` · due ${day(data.due_date)}` : ''}</p>
        <p className="text-3xl font-bold text-slate-900 mt-4">{money(data.card.amount)}</p>
        {data.items.length > 0 && (
          <ul className="mt-3 text-sm text-slate-600 space-y-0.5">
            {data.items.map((l, i) => <li key={i} className="flex justify-between gap-3"><span>{l.label}{l.kind === 'item' && Number(l.quantity) !== 1 ? ` × ${Number(l.quantity)}` : ''}</span><span>{money(l.amount)}</span></li>)}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <h2 className="font-semibold text-emerald-900">Pay by Interac e-Transfer (no fee)</h2>
        <p className="text-sm text-emerald-900 mt-1">Send {money(data.card.amount)} to <strong>{data.etransfer_email}</strong>, with "{data.description}" in the message.</p>
      </div>

      {data.card.enabled && (
        <div className="rounded-xl border border-slate-200 p-4 space-y-3">
          <h2 className="font-semibold text-slate-800">Pay by credit card</h2>
          <table className="w-full text-sm">
            <tbody>
              <tr><td className="py-0.5 text-slate-600">{data.description}</td><td className="py-0.5 text-right">{money(data.card.amount)}</td></tr>
              {data.card.fee > 0 && <tr><td className="py-0.5 text-slate-600">Credit card fee ({data.card.fee_pct}%)</td><td className="py-0.5 text-right">{money(data.card.fee)}</td></tr>}
              <tr className="border-t border-slate-200"><td className="pt-1 font-semibold">Total by card</td><td className="pt-1 text-right font-semibold">{money(data.card.total)}</td></tr>
            </tbody>
          </table>
          {data.card.fee > 0 && <p className="text-xs text-slate-500">The fee covers card processing and applies to credit cards only. Pay by e-Transfer above to avoid it.</p>}
          {params.get('cancelled') === '1' && <p className="text-sm text-amber-700">The card payment was cancelled. Nothing was charged.</p>}
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          <button onClick={payByCard} disabled={busy} className="w-full bg-rose-600 hover:bg-rose-700 text-white font-semibold py-3 rounded-lg disabled:opacity-60">
            {busy ? 'Opening secure payment…' : `Pay ${money(data.card.total)} by card`}
          </button>
        </div>
      )}
      <p className="text-xs text-slate-400">Questions? Reply to any email from Rustic Retreat.</p>
    </div>
  )
}
