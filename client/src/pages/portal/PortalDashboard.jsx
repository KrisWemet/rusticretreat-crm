import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { differenceInDays, parseISO, format } from 'date-fns'
import {
  HeartIcon,
  ClipboardDocumentCheckIcon,
  UserGroupIcon,
  CurrencyDollarIcon,
  ChatBubbleLeftRightIcon,
  ClockIcon,
  BuildingStorefrontIcon,
  DocumentTextIcon,
  ChevronRightIcon,
  CalendarDaysIcon,
  MapPinIcon,
} from '@heroicons/react/24/outline'

function PortalModuleCard({ to, icon: Icon, label, description, value, color }) {
  return (
    <Link to={to} className="card-hover p-5 group block">
      <div className="flex items-start gap-3 mb-2">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
          <Icon className="w-4.5 h-4.5" />
        </div>
        {value != null && <span className="text-lg font-bold text-slate-800 ml-auto">{value}</span>}
      </div>
      <div className="text-sm font-semibold text-slate-800 group-hover:text-rose-600 transition-colors">{label}</div>
      <div className="text-xs text-slate-400 mt-0.5">{description}</div>
    </Link>
  )
}

export default function PortalDashboard() {
  const { getCoupleAxios, couple } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getCoupleAxios().get('/api/portal/dashboard')
      .then(r => setData(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-rose-200 border-t-rose-500" />
    </div>
  )

  const weddingDate = data?.couple?.wedding_date ? parseISO(data.couple.wedding_date) : null
  const daysUntil = weddingDate ? differenceInDays(weddingDate, new Date()) : null

  const checklistPct = data?.stats?.checklist?.total > 0
    ? Math.round((data.stats.checklist.completed / data.stats.checklist.total) * 100) : 0

  const budgetSpent = data?.stats?.budget?.total_actual || 0
  const budgetTotal = data?.couple?.budget_total || 0
  const budgetPct = budgetTotal > 0 ? Math.round((budgetSpent / budgetTotal) * 100) : 0

  const modules = [
    { to: '/portal/checklist', icon: ClipboardDocumentCheckIcon, label: 'Planning Checklist', description: `${checklistPct}% complete`, value: `${data?.stats?.checklist?.total - data?.stats?.checklist?.completed || 0} left`, color: 'bg-violet-100 text-violet-600' },
    { to: '/portal/guests', icon: UserGroupIcon, label: 'Guest List', description: `${data?.stats?.guests?.accepted || 0} confirmed`, value: data?.stats?.guests?.total || 0, color: 'bg-blue-100 text-blue-600' },
    { to: '/portal/budget', icon: CurrencyDollarIcon, label: 'Budget Tracker', description: `${budgetPct}% of budget used`, value: null, color: 'bg-emerald-100 text-emerald-600' },
    { to: '/portal/vendors', icon: BuildingStorefrontIcon, label: 'Vendors', description: 'Manage your vendors', value: null, color: 'bg-amber-100 text-amber-600' },
    { to: '/portal/timeline', icon: ClockIcon, label: 'Day-Of Timeline', description: 'Your event schedule', value: null, color: 'bg-rose-100 text-rose-600' },
    { to: '/portal/messages', icon: ChatBubbleLeftRightIcon, label: 'Messages', description: 'Chat with venue staff', value: data?.unreadMessages || null, color: 'bg-pink-100 text-pink-600' },
    { to: '/portal/documents', icon: DocumentTextIcon, label: 'Documents', description: 'Contracts & files', value: null, color: 'bg-slate-100 text-slate-500' },
  ]

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Countdown banner */}
      {daysUntil !== null && (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #f43f5e 0%, #be123c 100%)' }}>
          <div className="px-8 py-6 flex items-center justify-between">
            <div>
              <p className="text-rose-200 text-xs font-semibold uppercase tracking-widest">Your Wedding Day</p>
              <h1 className="text-4xl font-bold text-white mt-1">
                {daysUntil > 0 ? <>{daysUntil} <span className="text-2xl font-normal opacity-80">days to go</span></>
                  : daysUntil === 0 ? "Today is the day! 🎉"
                  : "Congratulations! 🥂"}
              </h1>
              {weddingDate && (
                <p className="text-rose-200 text-sm mt-1">{format(weddingDate, 'EEEE, MMMM d, yyyy')}</p>
              )}
            </div>
            <HeartIcon className="w-16 h-16 text-white/20 hidden sm:block" />
          </div>
          {/* Progress bar */}
          {budgetTotal > 0 && (
            <div className="px-8 pb-5">
              <div className="flex items-center justify-between text-xs text-rose-200 mb-1.5">
                <span>Planning progress</span>
                <span>{checklistPct}%</span>
              </div>
              <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                <div className="h-full bg-white rounded-full transition-all" style={{ width: `${checklistPct}%` }} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Couple heading */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{couple?.partner1_name} & {couple?.partner2_name}</h2>
          {data?.couple?.venue_package && (
            <p className="text-sm text-slate-400 mt-0.5">{data.couple.venue_package} Package · Rustic Retreat</p>
          )}
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Guests Invited', value: data?.stats?.guests?.total || 0, sub: `${data?.stats?.guests?.accepted || 0} confirmed`, color: 'bg-blue-100 text-blue-600' },
          { label: 'Planning Done', value: `${checklistPct}%`, sub: `${data?.stats?.checklist?.completed || 0} of ${data?.stats?.checklist?.total || 0} tasks`, color: 'bg-violet-100 text-violet-600' },
          { label: 'Budget Used', value: `$${budgetSpent.toLocaleString()}`, sub: `of $${budgetTotal.toLocaleString()}`, color: budgetPct > 90 ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600' },
          { label: 'Unread Messages', value: data?.unreadMessages || 0, sub: 'from venue staff', color: 'bg-rose-100 text-rose-600' },
        ].map(({ label, value, sub, color }) => (
          <div key={label} className="card p-4">
            <div className="text-xl font-bold text-slate-900">{value}</div>
            <div className="text-xs font-medium text-slate-600 mt-0.5">{label}</div>
            <div className="text-xs text-slate-400 mt-0.5">{sub}</div>
          </div>
        ))}
      </div>

      {/* Module grid */}
      <div>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Your Planning Tools</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {modules.map(m => <PortalModuleCard key={m.to} {...m} />)}
        </div>
      </div>

      {/* Two column: tasks + event details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Upcoming to-dos */}
        <div className="card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50">
            <h3 className="text-sm font-semibold text-slate-800">Upcoming To-Dos</h3>
            <Link to="/portal/checklist" className="text-xs text-rose-600 hover:text-rose-700 font-medium flex items-center gap-1">
              View all <ChevronRightIcon className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {(!data?.upcomingTasks || data.upcomingTasks.length === 0) ? (
              <div className="px-5 py-6 text-center text-sm text-slate-400">All caught up! ✓</div>
            ) : data.upcomingTasks.map(task => (
              <div key={task.id} className="flex items-center gap-3 px-5 py-3">
                <div className="w-2 h-2 bg-rose-400 rounded-full flex-shrink-0"></div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-700 truncate">{task.title}</div>
                  {task.due_date && (
                    <div className="text-xs text-slate-400">
                      Due {new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  )}
                </div>
                <span className="text-xs text-slate-400">{task.category}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Event details */}
        {data?.booking ? (
          <div className="card">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50">
              <h3 className="text-sm font-semibold text-slate-800">Event Details</h3>
              <Link to="/portal/timeline" className="text-xs text-rose-600 hover:text-rose-700 font-medium flex items-center gap-1">
                Timeline <ChevronRightIcon className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="px-5 py-4 space-y-3">
              {[
                { icon: CalendarDaysIcon, label: 'Date', value: data.booking.event_date ? format(parseISO(data.booking.event_date), 'MMMM d, yyyy') : null },
                { icon: ClockIcon, label: 'Time', value: data.booking.start_time ? `${data.booking.start_time}${data.booking.end_time ? ` – ${data.booking.end_time}` : ''}` : null },
                { icon: MapPinIcon, label: 'Ceremony', value: data.booking.ceremony_location },
                { icon: MapPinIcon, label: 'Reception', value: data.booking.reception_location },
                { icon: UserGroupIcon, label: 'Guest Count', value: data.booking.guest_count },
              ].filter(i => i.value).map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-center gap-3">
                  <Icon className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  <span className="text-xs text-slate-500 w-24">{label}</span>
                  <span className="text-sm font-medium text-slate-700">{value}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="card flex items-center justify-center py-12 text-center">
            <div>
              <CalendarDaysIcon className="w-10 h-10 text-slate-200 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No booking details yet</p>
              <p className="text-xs text-slate-300 mt-1">Contact the venue to confirm your event</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
