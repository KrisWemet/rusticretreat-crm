import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import {
  HeartIcon, CheckCircleIcon, ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import { format, parseISO } from 'date-fns'

function fmtDate(v) {
  if (!v) return null
  try { return format(parseISO(v), 'MMMM d, yyyy') } catch { return v }
}

export default function PublicProposal() {
  const { token } = useParams()
  const [proposal, setProposal] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(null) // 'accepted' | 'declined'

  useEffect(() => {
    axios.get(`/api/proposals/public/${token}`)
      .then(r => setProposal(r.data))
      .catch(e => setError(e.response?.data?.error || 'Proposal not found or the link has expired.'))
      .finally(() => setLoading(false))
  }, [token])

  async function accept() {
    if (!name.trim()) return setError('Please type your name to accept.')
    setSubmitting(true); setError(null)
    try {
      await axios.post(`/api/proposals/public/${token}/accept`, { accepted_name: name.trim() })
      setDone('accepted')
    } catch (e) {
      setError(e.response?.data?.error || 'Something went wrong. Please try again.')
    } finally { setSubmitting(false) }
  }

  async function decline() {
    if (!confirm('Decline this proposal? You can always reach out to us for an updated quote.')) return
    setSubmitting(true)
    try {
      await axios.post(`/api/proposals/public/${token}/decline`)
      setDone('declined')
    } catch { setError('Something went wrong.') }
    finally { setSubmitting(false) }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-2 border-rose-200 border-t-rose-500" /></div>
  }

  if (error && !proposal) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-amber-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-slate-100 p-10 text-center">
          <ExclamationTriangleIcon className="w-12 h-12 text-amber-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">Proposal Unavailable</h2>
          <p className="text-slate-500">{error}</p>
        </div>
      </div>
    )
  }

  if (done === 'accepted') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-amber-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-slate-100 p-10 text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5"><CheckCircleIcon className="w-9 h-9 text-emerald-600" /></div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">You're Booked! 🎉</h2>
          <p className="text-slate-500 mb-4">Thank you, {name}! We've received your acceptance and your weekend is reserved. We'll be in touch shortly with your deposit invoice and next steps.</p>
          <p className="text-sm text-rose-700 bg-rose-50 rounded-xl p-3">Keep an eye on your inbox for your contract and wedding portal login.</p>
        </div>
      </div>
    )
  }

  if (done === 'declined') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-amber-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-slate-100 p-10 text-center">
          <h2 className="text-xl font-bold text-slate-900 mb-2">Thanks for letting us know</h2>
          <p className="text-slate-500">We've noted your response. If anything changes or you'd like an updated quote, we'd love to hear from you.</p>
        </div>
      </div>
    )
  }

  const isOpen = proposal.status === 'sent'
  const coupleNames = `${proposal.partner1_name} & ${proposal.partner2_name}`

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-amber-50">
      <header className="bg-white border-b border-slate-100">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-8 h-8 bg-rose-600 rounded-lg flex items-center justify-center"><HeartIcon className="w-4 h-4 text-white" /></div>
          <div>
            <div className="font-semibold text-slate-900 text-sm">Rustic Retreat</div>
            <div className="text-xs text-slate-400">Wedding Proposal</div>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {/* Header */}
          <div className="px-8 py-6 border-b border-slate-100">
            <div className="text-xs uppercase tracking-widest text-rose-500 font-semibold mb-1">Proposal for {coupleNames}</div>
            <h1 className="text-2xl font-bold text-slate-900">{proposal.title}</h1>
            <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-sm text-slate-500">
              {proposal.event_date && <span><strong className="text-slate-700">Dates:</strong> {fmtDate(proposal.event_date)}{proposal.end_date ? ` – ${fmtDate(proposal.end_date)}` : ''}</span>}
              {proposal.guest_count && <span><strong className="text-slate-700">Guests:</strong> {proposal.guest_count}</span>}
            </div>
            {!isOpen && (
              <div className="mt-3 inline-block text-xs px-3 py-1 rounded-full bg-amber-50 text-amber-700 font-medium capitalize">
                This proposal is {proposal.status}
              </div>
            )}
          </div>

          {/* Line items */}
          <div className="px-8 py-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100">
                  <th className="text-left font-semibold py-2">Item</th>
                  <th className="text-right font-semibold py-2">Qty</th>
                  <th className="text-right font-semibold py-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {proposal.items.map(it => (
                  <tr key={it.id} className="border-b border-slate-50">
                    <td className="py-3">
                      <div className="font-medium text-slate-800">{it.label}</div>
                      {it.description && <div className="text-xs text-slate-400 mt-0.5">{it.description}</div>}
                    </td>
                    <td className="text-right text-slate-500 align-top py-3">{it.quantity}</td>
                    <td className="text-right font-medium text-slate-800 align-top py-3">${Number(it.amount).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex justify-end mt-5">
              <div className="w-56 space-y-1.5 text-sm">
                <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>${Number(proposal.subtotal).toLocaleString()}</span></div>
                <div className="flex justify-between text-slate-500"><span>GST ({proposal.tax_rate}%)</span><span>${Number(proposal.tax).toLocaleString()}</span></div>
                <div className="flex justify-between font-bold text-slate-900 text-lg border-t border-slate-100 pt-1.5"><span>Total</span><span>${Number(proposal.total).toLocaleString()} CAD</span></div>
                <div className="flex justify-between text-rose-600 text-xs pt-1"><span>Deposit to book ({proposal.deposit_pct}%)</span><span>${Math.round(proposal.total * proposal.deposit_pct / 100).toLocaleString()}</span></div>
              </div>
            </div>

            {proposal.notes && (
              <div className="mt-6 bg-rose-50/60 border border-rose-100 rounded-xl p-4 text-sm text-slate-600">{proposal.notes}</div>
            )}
            {proposal.valid_until && isOpen && (
              <p className="text-xs text-slate-400 mt-3 text-center">This pricing is held until {fmtDate(proposal.valid_until)}.</p>
            )}
          </div>

          {/* Accept */}
          {isOpen && (
            <div className="px-8 py-6 bg-slate-50 border-t border-slate-100">
              <p className="text-sm text-slate-600 mb-3">Ready to make it official? Type your name below to accept this proposal and reserve your dates. A deposit invoice will follow.</p>
              {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-2.5 mb-3">{error}</div>}
              <input
                value={name} onChange={e => setName(e.target.value)} placeholder="Type your full name to sign"
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 mb-3"
              />
              <div className="flex gap-3">
                <button onClick={decline} disabled={submitting} className="px-4 py-3 rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-100 transition-colors">Decline</button>
                <button onClick={accept} disabled={submitting} className="flex-1 inline-flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white font-semibold py-3 rounded-xl transition-colors">
                  {submitting ? 'Submitting…' : <><CheckCircleIcon className="w-5 h-5" /> Accept & Reserve Our Dates</>}
                </button>
              </div>
            </div>
          )}
        </div>
        <p className="text-center text-xs text-slate-400 mt-6">Questions? Reply to the email this proposal came from and we'll be happy to help.</p>
      </div>
    </div>
  )
}
