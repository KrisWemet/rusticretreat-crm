import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import {
  CurrencyDollarIcon,
  BanknotesIcon,
  ExclamationCircleIcon,
  ArrowTrendingUpIcon,
  ChartBarIcon,
  UsersIcon,
} from '@heroicons/react/24/outline'
import { format, subMonths, startOfMonth } from 'date-fns'

function fmt(n) {
  if (!n) return '$0'
  return '$' + Math.round(n).toLocaleString()
}

function StatCard({ label, value, icon: Icon, color, sub }) {
  return (
    <div className="card p-5 flex items-start gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-2xl font-bold text-slate-900">{value}</div>
        <div className="text-sm text-slate-500 mt-0.5">{label}</div>
        {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
      </div>
    </div>
  )
}

export default function Analytics() {
  const { getAdminAxios } = useAuth()
  const [summary, setSummary] = useState(null)
  const [revenue, setRevenue] = useState([])
  const [funnel, setFunnel] = useState(null)
  const [referrals, setReferrals] = useState([])
  const [pkgPerf, setPkgPerf] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const api = getAdminAxios()
    Promise.all([
      api.get('/api/analytics/summary'),
      api.get('/api/analytics/revenue'),
      api.get('/api/analytics/funnel'),
      api.get('/api/analytics/referrals'),
      api.get('/api/analytics/packages'),
    ]).then(([s, r, f, ref, p]) => {
      setSummary(s.data)
      setRevenue(r.data)
      setFunnel(f.data)
      setReferrals(ref.data)
      setPkgPerf(p.data)
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  // Build 12-month chart data
  const chartMonths = Array.from({ length: 12 }, (_, i) => {
    const d = subMonths(startOfMonth(new Date()), 11 - i)
    return { key: format(d, 'yyyy-MM'), label: format(d, 'MMM'), year: format(d, 'yy') }
  })
  const revenueMap = Object.fromEntries(revenue.map(r => [r.month, r.revenue]))
  const chartData = chartMonths.map(m => ({ ...m, revenue: revenueMap[m.key] || 0 }))
  const maxRevenue = Math.max(...chartData.map(d => d.revenue), 1)

  const funnelTotal = funnel ? (funnel.lead + funnel.inquiry + funnel.booked + funnel.completed + funnel.cancelled) : 1
  const funnelStages = funnel ? [
    { label: 'Leads', count: funnel.lead, color: 'bg-blue-500' },
    { label: 'Inquiry', count: funnel.inquiry, color: 'bg-amber-500' },
    { label: 'Booked', count: funnel.booked, color: 'bg-emerald-500' },
    { label: 'Completed', count: funnel.completed, color: 'bg-slate-400' },
  ] : []

  const refTotal = referrals.reduce((a, r) => a + r.count, 0) || 1

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-rose-200 border-t-rose-600" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div>
        <h1 className="page-title">Revenue & Analytics</h1>
        <p className="page-subtitle">{new Date().getFullYear()} business performance overview</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Revenue YTD" value={fmt(summary?.revenue_ytd)} icon={ArrowTrendingUpIcon} color="bg-emerald-100 text-emerald-600" sub={`${new Date().getFullYear()} collected`} />
        <StatCard label="Total Collected" value={fmt(summary?.revenue_collected)} icon={BanknotesIcon} color="bg-blue-100 text-blue-600" sub="all time" />
        <StatCard label="Outstanding" value={fmt(summary?.revenue_outstanding)} icon={CurrencyDollarIcon} color={summary?.overdue_invoices > 0 ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'} sub={summary?.overdue_invoices > 0 ? `${summary.overdue_invoices} overdue` : 'upcoming'} />
        <StatCard label="Avg Deal Size" value={fmt(summary?.avg_deal_size)} icon={ChartBarIcon} color="bg-violet-100 text-violet-600" sub={`${summary?.conversion_rate || 0}% close rate`} />
      </div>

      {/* Monthly Revenue Chart */}
      <div className="card p-6">
        <h2 className="text-sm font-semibold text-slate-800 mb-1">Monthly Revenue</h2>
        <p className="text-xs text-slate-400 mb-6">Last 12 months · paid invoices only</p>
        <div className="flex items-end gap-1.5 h-40">
          {chartData.map(({ key, label, year, revenue: rev }) => {
            const pct = (rev / maxRevenue) * 100
            const height = rev > 0 ? Math.max(pct, 3) : 0
            return (
              <div key={key} className="flex-1 flex flex-col items-center gap-1 group">
                <div
                  className="w-full relative"
                  style={{ height: '128px', display: 'flex', alignItems: 'flex-end' }}
                >
                  {rev > 0 && (
                    <div
                      className="w-full bg-rose-500 rounded-t group-hover:bg-rose-600 transition-colors cursor-default"
                      style={{ height: `${height}%` }}
                      title={fmt(rev)}
                    />
                  )}
                  {rev === 0 && <div className="w-full h-0.5 bg-slate-100 self-end" />}
                </div>
                <span className="text-xs text-slate-400 font-medium">{label}</span>
              </div>
            )
          })}
        </div>
        {revenue.length === 0 && (
          <p className="text-center text-sm text-slate-400 mt-4">No revenue data yet — mark invoices as paid to see revenue trends.</p>
        )}
      </div>

      {/* Funnel + Referrals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Conversion Funnel */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-1">
            <UsersIcon className="w-4 h-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-800">Conversion Funnel</h2>
          </div>
          <p className="text-xs text-slate-400 mb-5">{summary?.total_couples || 0} total couples · {summary?.conversion_rate || 0}% book</p>
          <div className="space-y-3">
            {funnelStages.map(({ label, count, color }) => (
              <div key={label} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600 font-medium">{label}</span>
                  <span className="text-slate-900 font-bold">{count}</span>
                </div>
                <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${color} rounded-full transition-all`}
                    style={{ width: `${Math.max((count / (funnelTotal || 1)) * 100, count > 0 ? 4 : 0)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          {funnel && (
            <div className="mt-5 pt-4 border-t border-slate-50 flex gap-4 text-xs text-slate-500">
              <span><strong className="text-slate-700">{funnel.cancelled}</strong> cancelled</span>
              <span><strong className="text-slate-700">{funnel.completed}</strong> completed</span>
            </div>
          )}
        </div>

        {/* Referral Sources */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-1">
            <ArrowTrendingUpIcon className="w-4 h-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-800">Referral Sources</h2>
          </div>
          <p className="text-xs text-slate-400 mb-5">Where your couples find you</p>
          {referrals.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No referral data yet</p>
          ) : (
            <div className="space-y-3">
              {referrals.map(({ source, count }) => (
                <div key={source} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 font-medium">{source}</span>
                    <span className="text-slate-900 font-bold">{count} <span className="font-normal text-slate-400">({Math.round((count / refTotal) * 100)}%)</span></span>
                  </div>
                  <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-violet-500 rounded-full transition-all"
                      style={{ width: `${Math.max((count / refTotal) * 100, 4)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Package Performance */}
      {pkgPerf.length > 0 && (
        <div className="card">
          <div className="px-5 py-4 border-b border-slate-50">
            <h2 className="text-sm font-semibold text-slate-800">Package Performance</h2>
            <p className="text-xs text-slate-400 mt-0.5">Revenue breakdown by venue package</p>
          </div>
          <div className="table-container rounded-none rounded-b-xl border-0">
            <table className="table">
              <thead>
                <tr>
                  <th>Package</th>
                  <th>Bookings</th>
                  <th>Total Revenue</th>
                  <th>Avg Price</th>
                </tr>
              </thead>
              <tbody>
                {pkgPerf.map(p => (
                  <tr key={p.package_name}>
                    <td className="font-medium text-slate-800">{p.package_name}</td>
                    <td className="text-slate-600">{p.bookings}</td>
                    <td className="text-slate-900 font-semibold">{fmt(p.revenue)}</td>
                    <td className="text-slate-600">{fmt(p.avg_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
