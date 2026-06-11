import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { StatCard } from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import {
  UsersIcon,
  CalendarDaysIcon,
  UserPlusIcon,
  ClipboardDocumentListIcon,
} from '@heroicons/react/24/outline'
import { format, parseISO } from 'date-fns'

export default function Dashboard() {
  const { getAdminAxios, user } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const api = getAdminAxios()
    api.get('/api/couples/admin/dashboard')
      .then(r => setData(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-rose-600"></div>
    </div>
  )

  const statusColor = {
    lead: 'lead', inquiry: 'inquiry', booked: 'booked',
    completed: 'completed', cancelled: 'cancelled'
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, {user?.name?.split(' ')[0]}!
        </h1>
        <p className="text-gray-500 mt-1">Here's what's happening at Rustic Retreat today.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Couples"
          value={data?.stats?.totalCouples || 0}
          subtitle="All time"
          icon={UsersIcon}
          color="rose"
        />
        <StatCard
          title="Upcoming Events"
          value={data?.stats?.upcomingEvents || 0}
          subtitle="Next 90 days"
          icon={CalendarDaysIcon}
          color="blue"
        />
        <StatCard
          title="New Leads"
          value={data?.stats?.newLeads || 0}
          subtitle="Last 30 days"
          icon={UserPlusIcon}
          color="amber"
        />
        <StatCard
          title="Tasks Due Soon"
          value={data?.stats?.tasksDue || 0}
          subtitle="Next 7 days"
          icon={ClipboardDocumentListIcon}
          color="purple"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent couples */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between p-6 border-b border-gray-50">
            <h2 className="font-semibold text-gray-900">Recent Clients</h2>
            <Link to="/clients" className="text-sm text-rose-600 hover:text-rose-700 font-medium">
              View all →
            </Link>
          </div>
          <div className="divide-y divide-gray-50">
            {data?.recentCouples?.length === 0 && (
              <p className="p-6 text-sm text-gray-400 text-center">No couples yet</p>
            )}
            {data?.recentCouples?.map(couple => (
              <Link
                key={couple.id}
                to={`/clients/${couple.id}`}
                className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-rose-100 rounded-full flex items-center justify-center">
                    <span className="text-rose-600 font-semibold text-sm">
                      {couple.partner1_name?.charAt(0)}{couple.partner2_name?.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {couple.partner1_name} & {couple.partner2_name}
                    </p>
                    <p className="text-xs text-gray-400">{couple.email}</p>
                  </div>
                </div>
                <Badge variant={statusColor[couple.status]}>
                  {couple.status?.charAt(0).toUpperCase() + couple.status?.slice(1)}
                </Badge>
              </Link>
            ))}
          </div>
        </div>

        {/* Upcoming bookings */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between p-6 border-b border-gray-50">
            <h2 className="font-semibold text-gray-900">Upcoming Events</h2>
            <Link to="/bookings" className="text-sm text-rose-600 hover:text-rose-700 font-medium">
              View all →
            </Link>
          </div>
          <div className="divide-y divide-gray-50">
            {data?.upcomingBookings?.length === 0 && (
              <p className="p-6 text-sm text-gray-400 text-center">No upcoming events</p>
            )}
            {data?.upcomingBookings?.map(booking => (
              <div key={booking.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {booking.partner1_name} & {booking.partner2_name}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {booking.package_name} · {booking.guest_count} guests
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900">
                    {booking.event_date ? format(parseISO(booking.event_date), 'MMM d, yyyy') : 'TBD'}
                  </p>
                  <p className="text-xs text-gray-400">{booking.start_time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
