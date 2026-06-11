import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  HomeIcon,
  UsersIcon,
  CalendarDaysIcon,
  ChatBubbleLeftRightIcon,
  ClipboardDocumentListIcon,
  BuildingStorefrontIcon,
  ArrowRightOnRectangleIcon,
  HeartIcon,
  DocumentTextIcon,
  BanknotesIcon,
  CalendarIcon,
} from '@heroicons/react/24/outline'

const navItems = [
  { to: '/dashboard',  icon: HomeIcon,                  label: 'Dashboard' },
  { to: '/clients',    icon: UsersIcon,                 label: 'Clients & Leads' },
  { to: '/calendar',   icon: CalendarIcon,              label: 'Venue Calendar' },
  { to: '/bookings',   icon: CalendarDaysIcon,          label: 'Bookings' },
  { to: '/contracts',  icon: DocumentTextIcon,          label: 'Contracts' },
  { to: '/payments',   icon: BanknotesIcon,             label: 'Payments' },
  { to: '/messages',   icon: ChatBubbleLeftRightIcon,   label: 'Messages', badge: 'messages' },
  { to: '/tasks',      icon: ClipboardDocumentListIcon, label: 'Tasks', badge: 'tasks' },
  { to: '/vendors',    icon: BuildingStorefrontIcon,    label: 'Vendors' },
]

export default function Sidebar({ unreadMessages = 0, pendingTasks = 0 }) {
  const { user, logoutAdmin } = useAuth()
  const location = useLocation()

  const getBadge = (badge) => {
    if (badge === 'messages' && unreadMessages > 0) return unreadMessages
    if (badge === 'tasks' && pendingTasks > 0) return pendingTasks
    return null
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-30 w-60 bg-slate-900 flex flex-col">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-rose-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <HeartIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-white font-semibold text-sm leading-tight">Rustic Retreat</div>
            <div className="text-slate-500 text-xs">Wedding Venue</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <div className="text-slate-600 text-xs font-semibold uppercase tracking-widest px-3 mb-2">Main Menu</div>
        {navItems.map(({ to, icon: Icon, label, badge }) => {
          const count = getBadge(badge)
          const isActive = location.pathname === to || (to !== '/dashboard' && location.pathname.startsWith(to))
          return (
            <NavLink
              key={to}
              to={to}
              className={`nav-item ${isActive ? 'nav-item-active' : 'nav-item-inactive'}`}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              <span className="flex-1">{label}</span>
              {count > 0 && (
                <span className={`text-xs font-semibold rounded-full px-1.5 py-0.5 min-w-[20px] text-center ${isActive ? 'bg-white/20 text-white' : 'bg-rose-600 text-white'}`}>
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </NavLink>
          )
        })}
      </nav>

      {/* Bottom: user + logout */}
      <div className="px-3 py-4 border-t border-slate-800">
        <div className="flex items-center gap-3 px-2 mb-2">
          <div className="w-8 h-8 bg-rose-600/20 border border-rose-500/30 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-rose-400 text-sm font-semibold">
              {user?.name?.charAt(0)?.toUpperCase() || 'A'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white text-sm font-medium truncate">{user?.name || 'Admin'}</div>
            <div className="text-slate-500 text-xs capitalize">{user?.role || 'Staff'}</div>
          </div>
        </div>
        <button
          onClick={logoutAdmin}
          className="nav-item nav-item-inactive w-full hover:text-red-400 hover:bg-red-900/20"
        >
          <ArrowRightOnRectangleIcon className="w-5 h-5" />
          Sign Out
        </button>
      </div>
    </aside>
  )
}
