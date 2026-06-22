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
import { format, subMonths, startOfMonth, parseISO } from 'date-fns'

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
  const [occupancy, setOccupancy] = useState(null)
  const [occYear, setOccYear] = useState(new Date().getFullYear())
  const [propStats, setPropStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const api = getAdminAxios()
    Promise.all([
      api.get('/api/analytics/summary'),
      api.get('/api/analytics/revenue'),
      api.get('/api/analytics/funnel'),
      api.get('/api/analytics/referrals'),
      api.get('/api/analytics/packages'),
      api.get('/api/analytics/proposals'),
    ]).then(([s, r, f, ref, p, pr]) => {
      setSummary(s.data)
      setRevenue(r.data)
      setFunnel(f.data)
      setReferrals(ref.data)
      setPkgPerf(p.data)
      setPropStats(pr.data)
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    getAdminAxios().get(`/api/analytics/occupancy?year=${occYear}`)
      .then(r => setOccupancy(r.data)).catch(console.error)
  }, [occYear])

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

      {/* Proposal conversion */}
      {propStats && propStats.total > 0 && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">Proposal Conversion</h2>
              <p className="text-xs text-slate-400">How quotes are turning into booked weddings</p>
            </div>
            <span className="text-2xl font-bold text-emerald-600">{propStats.win_rate}%<span className="text-xs font-medium text-slate-400 ml-1">win rate</span></span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-blue-50 rounded-xl p-4">
              <div className="text-xl font-bold text-blue-700">{propStats.open_count}</div>
              <div className="text-xs text-slate-500 mt-0.5">Awaiting decision</div>
              <div className="text-xs text-blue-600 font-medium mt-1">{fmt(propStats.open_value)} in play</div>
            </div>
            <div className="bg-emerald-50 rounded-xl p-4">
              <div className="text-xl font-bold text-emerald-700">{propStats.accepted_count}</div>
              <div className="text-xs text-slate-500 mt-0.5">Accepted</div>
              <div className="text-xs text-emerald-600 font-medium mt-1">{fmt(propStats.accepted_value)} won</div>
            </div>
            <div className="bg-slate-50 rounded-xl p-4">
              <div className="text-xl font-bold text-slate-600">{propStats.declined_count}</div>
              <div className="text-xs text-slate-500 mt-0.5">Declined</div>
            </div>
            <div className="bg-amber-50 rounded-xl p-4">
              <div className="text-xl font-bold text-amber-600">{propStats.expired_count}</div>
              <div className="text-xs text-slate-500 mt-0.5">Expired</div>
            </div>
          </div>
        </div>
      )}

      {/* Season Occupancy */}
      {occupancy && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">Season Occupancy</h2>
              <p className="text-xs text-slate-400">One wedding per weekend · June–September</p>
            </div>
            <div className="flex items-center gap-1">
              {[occYear - 1, occYear, occYear + 1].map(y => (
                <button
                  key={y}
                  onClick={() => setOccYear(y)}
                  className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${y === occYear ? 'bg-rose-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
                >
                  {y}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-5">
            {/* Occupancy ring */}
            <div className="flex items-center gap-5">
              <div className="relative w-28 h-28 flex-shrink-0">
                <svg className="w-28 h-28 -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f1f5f9" strokeWidth="3.5" />
                  <circle
                    cx="18" cy="18" r="15.9" fill="none" stroke="#e11d48" strokeWidth="3.5"
                    strokeDasharray={`${occupancy.occupancy_rate} ${100 - occupancy.occupancy_rate}`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold text-slate-900">{occupancy.occupancy_rate}%</span>
                  <span className="text-[10px] text-slate-400">booked</span>
                </div>
              </div>
              <div>
                <div className="text-3xl font-bold text-slate-900">{occupancy.booked_weekends}<span className="text-lg text-slate-400 font-medium"> / {occupancy.total_weekends}</span></div>
                <div className="text-sm text-slate-500">weekends booked</div>
                <div className="text-xs text-emerald-600 font-medium mt-1">{occupancy.open_weekends} open weekend{occupancy.open_weekends === 1 ? '' : 's'} left</div>
              </div>
            </div>

            {/* Revenue figures */}
            <div className="flex flex-col justify-center gap-3">
              <div>
                <div className="text-xs text-slate-400">Season Revenue (booked)</div>
                <div className="text-xl font-bold text-slate-900">{fmt(occupancy.season_revenue)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Revenue per Available Weekend</div>
                <div className="text-xl font-bold text-slate-900">{fmt(occupancy.revenue_per_available_weekend)}</div>
              </div>
            </div>

            {/* Open weekends */}
            <div>
              <div className="text-xs text-slate-400 mb-2">Open weekends ({occYear})</div>
              {occupancy.open_weekend_dates.length === 0 ? (
                <p className="text-sm text-emerald-600 font-medium">Fully booked! 🎉</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {occupancy.open_weekend_dates.slice(0, 12).map(d => (
                    <span key={d} className="text-xs bg-emerald-50 text-emerald-700 rounded-md px-2 py-1 font-medium">
                      {format(parseISO(d), 'MMM d')}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
