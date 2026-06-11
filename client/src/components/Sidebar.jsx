import { NavLink } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  HomeIcon,
  UsersIcon,
  CalendarDaysIcon,
  ChatBubbleLeftRightIcon,
  ClipboardDocumentListIcon,
  BuildingStorefrontIcon,
  ArrowRightOnRectangleIcon,
} from '@heroicons/react/24/outline'

const navItems = [
  { to: '/dashboard', icon: HomeIcon, label: 'Dashboard' },
  { to: '/clients', icon: UsersIcon, label: 'Clients & Leads' },
  { to: '/bookings', icon: CalendarDaysIcon, label: 'Bookings' },
  { to: '/messages', icon: ChatBubbleLeftRightIcon, label: 'Messages' },
  { to: '/tasks', icon: ClipboardDocumentListIcon, label: 'Tasks' },
  { to: '/vendors', icon: BuildingStorefrontIcon, label: 'Vendors' },
]

export default function Sidebar() {
  const { user, logoutAdmin } = useAuth()

  return (
    <aside className="fixed inset-y-0 left-0 z-30 w-64 bg-white border-r border-gray-100 flex flex-col shadow-sm">
      {/* Logo */}
      <div className="p-6 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-rose-600 rounded-xl flex items-center justify-center">
            <span className="text-white text-lg font-bold font-serif">R</span>
          </div>
          <div>
            <h1 className="font-bold text-gray-900 leading-tight">Rustic Retreat</h1>
            <p className="text-xs text-gray-400">Wedding Venue CRM</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 ${
                isActive
                  ? 'bg-rose-50 text-rose-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`
            }
          >
            <Icon className="w-5 h-5 flex-shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User info & logout */}
      <div className="p-4 border-t border-gray-100">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 bg-rose-100 rounded-full flex items-center justify-center">
            <span className="text-rose-700 text-sm font-semibold">
              {user?.name?.charAt(0) || 'A'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{user?.name}</p>
            <p className="text-xs text-gray-400 capitalize">{user?.role}</p>
          </div>
        </div>
        <button
          onClick={logoutAdmin}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        >
          <ArrowRightOnRectangleIcon className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </aside>
  )
}
