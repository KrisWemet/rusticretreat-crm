import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { differenceInDays, parseISO } from 'date-fns'
import {
  HeartIcon,
  ClipboardDocumentCheckIcon,
  UserGroupIcon,
  CurrencyDollarIcon,
  ChatBubbleLeftRightIcon,
  ClockIcon,
} from '@heroicons/react/24/outline'

export default function PortalDashboard() {
  const { getCoupleAxios, couple } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const api = getCoupleAxios()
    api.get('/api/portal/dashboard')
      .then(r => setData(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-rose-500" />
    </div>
  )

  const weddingDate = data?.couple?.wedding_date ? parseISO(data.couple.wedding_date) : null
  const daysUntil = weddingDate ? differenceInDays(weddingDate, new Date()) : null

  const checklistPct = data?.stats?.checklist?.total > 0
    ? Math.round((data.stats.checklist.completed / data.stats.checklist.total) * 100)
    : 0

  const budgetSpent = data?.stats?.budget?.total_actual || 0
  const budgetTotal = data?.couple?.budget_total || 0
  const budgetPct = budgetTotal > 0 ? Math.round((budgetSpent / budgetTotal) * 100) : 0

  return (
    <div className="space-y-8">
      {/* Countdown banner */}
      {daysUntil !== null && (
        <div className="rounded-2xl overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #f43f5e 0%, #be123c 50%, #881337 100%)' }}>
          <div className="p-8 flex items-center justify-between">
            <div>
              <p className="text-rose-200 text-sm font-medium uppercase tracking-wide">Your Wedding Day</p>
              <h1 className="text-4xl font-bold text-white mt-1 font-serif">
                {daysUntil > 0
                  ? <>{daysUntil} <span className="text-2xl font-normal">days to go!</span></>
                  : daysUntil === 0
                  ? "Today is the day!"
                  : "Congratulations!"}
              </h1>
              <p className="text-rose-200 mt-2">
                {data?.couple?.wedding_date && new Date(data.couple.wedding_date + 'T00:00:00').toLocaleDateString('en-US', {
                  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                })}
              </p>
            </div>
            <HeartIcon className="w-20 h-20 text-white/20" />
          </div>
        </div>
      )}

      {/* Couple name + package */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 font-serif">
          {couple?.partner1_name} & {couple?.partner2_name}
        </h2>
        {data?.couple?.venue_package && (
          <p className="text-gray-500 mt-1">{data.couple.venue_package} Package · Rustic Retreat</p>
        )}
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Link to="/portal/guests" className="bg-white rounded-xl border border-gray-100 p-5 hover:border-rose-200 transition-colors">
          <UserGroupIcon className="w-6 h-6 text-rose-500 mb-3" />
          <p className="text-2xl font-bold text-gray-900">{data?.stats?.guests?.total || 0}</p>
          <p className="text-sm text-gray-500">Total Guests</p>
          <p className="text-xs text-emerald-600 mt-1">{data?.stats?.guests?.accepted || 0} confirmed</p>
        </Link>

        <Link to="/portal/checklist" className="bg-white rounded-xl border border-gray-100 p-5 hover:border-rose-200 transition-colors">
          <ClipboardDocumentCheckIcon className="w-6 h-6 text-rose-500 mb-3" />
          <p className="text-2xl font-bold text-gray-900">{checklistPct}%</p>
          <p className="text-sm text-gray-500">Planning Progress</p>
          <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-rose-500 rounded-full" style={{ width: `${checklistPct}%` }} />
          </div>
        </Link>

        <Link to="/portal/budget" className="bg-white rounded-xl border border-gray-100 p-5 hover:border-rose-200 transition-colors">
          <CurrencyDollarIcon className="w-6 h-6 text-rose-500 mb-3" />
          <p className="text-2xl font-bold text-gray-900">${budgetSpent.toLocaleString()}</p>
          <p className="text-sm text-gray-500">Budget Used</p>
          <p className="text-xs text-gray-400 mt-1">of ${budgetTotal.toLocaleString()}</p>
        </Link>

        <Link to="/portal/messages" className="bg-white rounded-xl border border-gray-100 p-5 hover:border-rose-200 transition-colors">
          <ChatBubbleLeftRightIcon className="w-6 h-6 text-rose-500 mb-3" />
          <p className="text-2xl font-bold text-gray-900">{data?.unreadMessages || 0}</p>
          <p className="text-sm text-gray-500">Unread Messages</p>
          <p className="text-xs text-gray-400 mt-1">from venue staff</p>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming tasks */}
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Upcoming To-Dos</h3>
            <Link to="/portal/checklist" className="text-sm text-rose-600 hover:text-rose-700">View all →</Link>
          </div>
          {data?.upcomingTasks?.length === 0 ? (
            <p className="text-sm text-gray-400">No upcoming tasks</p>
          ) : (
            <div className="space-y-3">
              {data?.upcomingTasks?.map(task => (
                <div key={task.id} className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-rose-400 rounded-full flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{task.title}</p>
                    {task.due_date && (
                      <p className="text-xs text-gray-400">
                        Due {new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Booking summary */}
        {data?.booking && (
          <div className="bg-white rounded-xl border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Event Details</h3>
              <Link to="/portal/timeline" className="text-sm text-rose-600 hover:text-rose-700">Timeline →</Link>
            </div>
            <dl className="space-y-3">
              {[
                { label: 'Ceremony', value: data.booking.ceremony_location },
                { label: 'Reception', value: data.booking.reception_location },
                { label: 'Catering', value: data.booking.catering_type },
                { label: 'Guest Count', value: data.booking.guest_count },
              ].filter(i => i.value).map(({ label, value }) => (
                <div key={label} className="flex justify-between text-sm">
                  <dt className="text-gray-500">{label}</dt>
                  <dd className="font-medium text-gray-900">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </div>
  )
}
