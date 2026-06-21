import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import {
  CurrencyDollarIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  ChatBubbleLeftRightIcon,
} from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid'
import { format, parseISO, isPast, isToday, differenceInDays } from 'date-fns'

export default function Payments() {
  const { getCoupleAxios } = useAuth()
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getCoupleAxios().get('/api/portal/invoices')
      .then(r => setInvoices(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const paid   = invoices.filter(i => i.paid)
  const unpaid = invoices.filter(i => !i.paid)
  const total  = invoices.reduce((s, i) => s + i.amount, 0)
  const collected = paid.reduce((s, i) => s + i.amount, 0)
  const remaining = unpaid.reduce((s, i) => s + i.amount, 0)

  const progressPct = total > 0 ? Math.round((collected / total) * 100) : 0

  function statusBadge(inv) {
    if (inv.paid) return { label: 'Paid', cls: 'bg-emerald-100 text-emerald-700', Icon: CheckCircleSolid }
    if (!inv.due_date) return { label: 'Pending', cls: 'bg-slate-100 text-slate-500', Icon: ClockIcon }
    const d = parseISO(inv.due_date)
    if (isPast(d) && !isToday(d)) return { label: 'Overdue', cls: 'bg-red-100 text-red-700', Icon: ExclamationTriangleIcon }
    const days = differenceInDays(d, new Date())
    if (days <= 30) return { label: `Due in ${days}d`, cls: 'bg-amber-100 text-amber-700', Icon: ClockIcon }
    return { label: 'Upcoming', cls: 'bg-blue-100 text-blue-700', Icon: ClockIcon }
  }

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      <div>
        <h1 className="page-title">Payment Schedule</h1>
        <p className="page-subtitle">Track your payments and upcoming due dates</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-7 w-7 border-2 border-rose-200 border-t-rose-500" /></div>
      ) : invoices.length === 0 ? (
        <div className="card py-16 text-center">
          <CurrencyDollarIcon className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">No payment schedule yet</p>
          <p className="text-xs text-slate-300 mt-1">Your coordinator will set up your payment schedule once your booking is confirmed.</p>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="card p-5 space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-xl font-bold text-slate-800">${total.toLocaleString()}</div>
                <div className="text-xs text-slate-400 mt-0.5">Total (CAD)</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-emerald-700">${collected.toLocaleString()}</div>
                <div className="text-xs text-slate-400 mt-0.5">Paid</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-blue-700">${remaining.toLocaleString()}</div>
                <div className="text-xs text-slate-400 mt-0.5">Balance Remaining</div>
              </div>
            </div>

            {/* Progress bar */}
            <div>
              <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                <span>Payment progress</span>
                <span>{progressPct}%</span>
              </div>
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          </div>

          {/* Invoice list */}
          <div className="space-y-3">
            {invoices.map((inv, idx) => {
              const badge = statusBadge(inv)
              const BadgeIcon = badge.Icon
              return (
                <div key={inv.id} className={`card p-5 ${inv.paid ? 'opacity-75' : ''}`}>
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-sm ${
                      inv.paid ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold text-slate-800">{inv.description}</h3>
                          {inv.due_date && (
                            <p className="text-xs text-slate-400 mt-0.5">
                              Due {format(parseISO(inv.due_date), 'MMMM d, yyyy')}
                            </p>
                          )}
                          {inv.paid && inv.paid_at && (
                            <p className="text-xs text-emerald-600 mt-0.5">
                              Paid {format(parseISO(inv.paid_at), 'MMMM d, yyyy')}
                            </p>
                          )}
                          {inv.notes && <p className="text-xs text-slate-400 mt-1">{inv.notes}</p>}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-lg font-bold text-slate-800">${inv.amount.toLocaleString()}</div>
                          <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium mt-1 ${badge.cls}`}>
                            <BadgeIcon className="w-3.5 h-3.5" />
                            {badge.label}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* How to pay */}
      <div className="card border-rose-100 bg-rose-50/40 p-4">
        <p className="text-sm font-medium text-slate-700 mb-1">How to pay</p>
        <p className="text-sm text-slate-500">
          We accept Interac e-Transfer (preferred), credit card, or cheque. For e-Transfer, send to{' '}
          <span className="font-medium text-slate-700">payments@rusticretreat.com</span> and include your names in the message.
          A receipt is emailed automatically once each payment is recorded.
        </p>
      </div>

      {/* Help */}
      <div className="card border-slate-100 bg-slate-50/50 p-4">
        <div className="flex items-start gap-3">
          <ChatBubbleLeftRightIcon className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-slate-700">Questions about payments?</p>
            <p className="text-sm text-slate-400 mt-0.5">
              Contact your coordinator via the <a href="/portal/messages" className="text-rose-600 hover:text-rose-700 font-medium">Messages</a> section.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
