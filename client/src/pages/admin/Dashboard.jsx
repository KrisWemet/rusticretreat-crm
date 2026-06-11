import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../../contexts/AuthContext'
import {
  UsersIcon,
  CalendarDaysIcon,
  ChatBubbleLeftRightIcon,
  ClipboardDocumentListIcon,
  BuildingStorefrontIcon,
  ChevronRightIcon,
  SparklesIcon,
  ClockIcon,
  ExclamationCircleIcon,
  ArrowTrendingUpIcon,
  HeartIcon,
} from '@heroicons/react/24/outline'
import { format, isToday, isTomorrow, parseISO, differenceInDays } from 'date-fns'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function StatCard({ label, value, icon: Icon, color, sub }) {
  return (
    <div className="card p-5 flex items-start gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-2xl font-bold text-slate-900">{value ?? '—'}</div>
        <div className="text-sm text-slate-500 mt-0.5">{label}</div>
        {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
      </div>
    </div>
  )
}

function ModuleCard({ to, icon: Icon, label, description, color, badge }) {
  return (
    <Link to={to} className="card-hover p-5 group block">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        {badge > 0 && (
          <span className="bg-rose-100 text-rose-700 text-xs font-semibold px-2 py-0.5 rounded-full">
            {badge}
          </span>
        )}
      </div>
      <div className="text-sm font-semibold text-slate-800 group-hover:text-rose-600 transition-colors">{label}</div>
      <div className="text-xs text-slate-400 mt-1 leading-relaxed">{description}</div>
      <div className="flex items-center gap-1 text-xs text-slate-400 group-hover:text-rose-500 mt-3 transition-colors">
        <span>Open</span>
        <ChevronRightIcon className="w-3.5 h-3.5" />
      </div>
    </Link>
  )
}

function statusColor(status) {
  const map = {
    lead: 'bg-blue-100 text-blue-700',
    inquiry: 'bg-amber-100 text-amber-700',
    booked: 'bg-emerald-100 text-emerald-700',
    completed: 'bg-slate-100 text-slate-600',
    cancelled: 'bg-red-100 text-red-600',
  }
  return map[status] || 'bg-slate-100 text-slate-600'
}

export default function Dashboard() {
  const { user, getAdminHeaders } = useAuth()
  const [stats, setStats] = useState({})
  const [recentClients, setRecentClients] = useState([])
  const [upcomingBookings, setUpcomingBookings] = useState([])
  const [recentMessages, setRecentMessages] = useState([])
  const [pendingTasks, setPendingTasks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const headers = getAdminHeaders()
        const [couplesRes, bookingsRes, msgsRes, tasksRes] = await Promise.all([
          axios.get('/api/couples', { headers }),
          axios.get('/api/bookings', { headers }),
          axios.get('/api/messages/all', { headers }),
          axios.get('/api/tasks', { headers }),
        ])

        const couples = couplesRes.data
        const bookings = bookingsRes.data
        const messages = msgsRes.data || []
        const tasks = tasksRes.data || []

        const today = new Date()
        const in30 = new Date(today)
        in30.setDate(today.getDate() + 30)
        const upcoming = bookings
          .filter(b => { const d = parseISO(b.event_date); return d >= today && d <= in30 })
          .sort((a, b) => new Date(a.event_date) - new Date(b.event_date))

        const leads = couples.filter(c => c.status === 'lead' || c.status === 'inquiry')
        const unreadMsgs = messages.filter(m => m.sender_type === 'couple' && !m.read_at)
        const dueTasks = tasks.filter(t => !t.completed)
        const overdueTasks = tasks.filter(t => !t.completed && t.due_date && new Date(t.due_date) < today)

        setStats({
          totalCouples: couples.length,
          upcomingCount: upcoming.length,
          newLeads: leads.length,
          unreadMessages: unreadMsgs.length,
          pendingTasks: dueTasks.length,
          overdueTasks: overdueTasks.length,
          booked: couples.filter(c => c.status === 'booked').length,
        })
        setRecentClients(couples.slice(-5).reverse())
        setUpcomingBookings(upcoming.slice(0, 5))
        setRecentMessages(messages.filter(m => m.sender_type === 'couple').slice(-4).reverse())
        setPendingTasks(dueTasks.slice(0, 5))
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const modules = [
    { to: '/clients', icon: UsersIcon, label: 'Clients & Leads', description: 'Manage couples from initial inquiry through booking.', color: 'bg-violet-100 text-violet-600', badge: stats.newLeads },
    { to: '/bookings', icon: CalendarDaysIcon, label: 'Bookings', description: 'View and manage all event bookings, dates, and packages.', color: 'bg-blue-100 text-blue-600', badge: stats.upcomingCount },
    { to: '/messages', icon: ChatBubbleLeftRightIcon, label: 'Messages', description: 'Communicate with couples through the portal inbox.', color: 'bg-rose-100 text-rose-600', badge: stats.unreadMessages },
    { to: '/tasks', icon: ClipboardDocumentListIcon, label: 'Tasks', description: 'Track internal to-dos, follow-ups, and preparations.', color: 'bg-amber-100 text-amber-600', badge: stats.overdueTasks },
    { to: '/vendors', icon: BuildingStorefrontIcon, label: 'Vendors', description: 'Manage vendor contacts, bookings, and partners.', color: 'bg-emerald-100 text-emerald-600', badge: 0 },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-rose-200 border-t-rose-600"></div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {greeting()}, {user?.name?.split(' ')[0] || 'there'} 👋
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {format(new Date(), 'EEEE, MMMM d, yyyy')} · Here's what's happening at Rustic Retreat
          </p>
        </div>
        <Link to="/clients" className="btn-primary">
          <SparklesIcon className="w-4 h-4" />
          New Inquiry
        </Link>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Couples" value={stats.totalCouples} icon={HeartIcon} color="bg-rose-100 text-rose-600" sub={`${stats.booked} booked`} />
        <StatCard label="Upcoming (30 days)" value={stats.upcomingCount} icon={CalendarDaysIcon} color="bg-blue-100 text-blue-600" sub="scheduled weddings" />
        <StatCard label="New Leads" value={stats.newLeads} icon={ArrowTrendingUpIcon} color="bg-violet-100 text-violet-600" sub="need follow-up" />
        <StatCard
          label="Pending Tasks"
          value={stats.pendingTasks}
          icon={ClipboardDocumentListIcon}
          color={stats.overdueTasks > 0 ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}
          sub={stats.overdueTasks > 0 ? `${stats.overdueTasks} overdue` : 'on track'}
        />
      </div>

      {/* Module Grid */}
      <div>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Quick Access</h2>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {modules.map(m => <ModuleCard key={m.to} {...m} />)}
        </div>
      </div>

      {/* Two-column content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Bookings */}
        <div className="card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50">
            <h2 className="text-sm font-semibold text-slate-800">Upcoming Weddings</h2>
            <Link to="/bookings" className="text-xs text-rose-600 hover:text-rose-700 font-medium flex items-center gap-1">
              View all <ChevronRightIcon className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {upcomingBookings.length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-slate-400">No upcoming weddings in the next 30 days</div>
            )}
            {upcomingBookings.map(b => {
              const d = parseISO(b.event_date)
              const days = differenceInDays(d, new Date())
              return (
                <div key={b.id} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="w-12 h-12 rounded-xl bg-rose-50 flex flex-col items-center justify-center flex-shrink-0">
                    <span className="text-xs font-semibold text-rose-600 uppercase">{format(d, 'MMM')}</span>
                    <span className="text-lg font-bold text-rose-700 leading-none">{format(d, 'd')}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{b.partner1_name} & {b.partner2_name}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{b.package_name} · {b.guest_count} guests</div>
                  </div>
                  <div className={`text-xs font-medium px-2 py-1 rounded-full ${isToday(d) ? 'bg-green-100 text-green-700' : isTomorrow(d) ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                    {isToday(d) ? 'Today!' : isTomorrow(d) ? 'Tomorrow' : `${days}d`}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Recent Messages */}
          <div className="card">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50">
              <h2 className="text-sm font-semibold text-slate-800">Recent Messages</h2>
              <Link to="/messages" className="text-xs text-rose-600 hover:text-rose-700 font-medium flex items-center gap-1">
                View all <ChevronRightIcon className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="divide-y divide-slate-50">
              {recentMessages.length === 0 && (
                <div className="px-5 py-6 text-center text-sm text-slate-400">No recent messages</div>
              )}
              {recentMessages.map(m => (
                <div key={m.id} className="flex items-start gap-3 px-5 py-3">
                  <div className="w-8 h-8 bg-rose-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-rose-600 text-xs font-semibold">{m.sender_name?.charAt(0)?.toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700">{m.sender_name}</span>
                      <span className="text-xs text-slate-400">{format(parseISO(m.created_at), 'MMM d')}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">{m.content}</p>
                  </div>
                  {!m.read_at && <div className="w-2 h-2 bg-rose-500 rounded-full flex-shrink-0 mt-2"></div>}
                </div>
              ))}
            </div>
          </div>

          {/* Pending Tasks */}
          <div className="card">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50">
              <h2 className="text-sm font-semibold text-slate-800">Pending Tasks</h2>
              <Link to="/tasks" className="text-xs text-rose-600 hover:text-rose-700 font-medium flex items-center gap-1">
                View all <ChevronRightIcon className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="divide-y divide-slate-50">
              {pendingTasks.length === 0 && (
                <div className="px-5 py-6 text-center text-sm text-slate-400">All caught up! ✓</div>
              )}
              {pendingTasks.map(t => {
                const overdue = t.due_date && new Date(t.due_date) < new Date()
                return (
                  <div key={t.id} className="flex items-center gap-3 px-5 py-3">
                    {overdue
                      ? <ExclamationCircleIcon className="w-4 h-4 text-red-500 flex-shrink-0" />
                      : <ClockIcon className="w-4 h-4 text-amber-500 flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-slate-700 truncate">{t.title}</div>
                      {t.due_date && (
                        <div className={`text-xs mt-0.5 ${overdue ? 'text-red-500' : 'text-slate-400'}`}>
                          {overdue ? 'Overdue · ' : 'Due '}{format(parseISO(t.due_date), 'MMM d')}
                        </div>
                      )}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      t.priority === 'high' ? 'bg-red-100 text-red-600'
                      : t.priority === 'medium' ? 'bg-amber-100 text-amber-600'
                      : 'bg-slate-100 text-slate-500'
                    }`}>
                      {t.priority}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Clients table */}
      <div className="card">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50">
          <h2 className="text-sm font-semibold text-slate-800">Recent Clients</h2>
          <Link to="/clients" className="text-xs text-rose-600 hover:text-rose-700 font-medium flex items-center gap-1">
            View all <ChevronRightIcon className="w-3.5 h-3.5" />
          </Link>
        </div>
        <div className="table-container rounded-none rounded-b-xl border-0">
          <table className="table">
            <thead>
              <tr>
                <th>Couple</th>
                <th>Wedding Date</th>
                <th>Package</th>
                <th>Status</th>
                <th>Added</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {recentClients.map(c => (
                <tr key={c.id}>
                  <td>
                    <div className="font-medium text-slate-800">{c.partner1_name} & {c.partner2_name}</div>
                    <div className="text-xs text-slate-400">{c.email}</div>
                  </td>
                  <td className="text-slate-600">{c.wedding_date ? format(parseISO(c.wedding_date), 'MMM d, yyyy') : '—'}</td>
                  <td className="text-slate-600">{c.venue_package || '—'}</td>
                  <td>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${statusColor(c.status)}`}>{c.status}</span>
                  </td>
                  <td className="text-slate-400 text-xs">{format(parseISO(c.created_at), 'MMM d')}</td>
                  <td>
                    <Link to={`/clients/${c.id}`} className="text-xs text-rose-600 hover:text-rose-700 font-medium">View →</Link>
                  </td>
                </tr>
              ))}
              {recentClients.length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-slate-400">No clients yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
