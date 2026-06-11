import { NavLink } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  HomeIcon,
  ClipboardDocumentCheckIcon,
  UserGroupIcon,
  CurrencyDollarIcon,
  BuildingStorefrontIcon,
  ClockIcon,
  ChatBubbleLeftRightIcon,
  DocumentTextIcon,
  ArrowRightOnRectangleIcon,
  HeartIcon,
} from '@heroicons/react/24/outline'

const navItems = [
  { to: '/portal/dashboard', icon: HomeIcon, label: 'Dashboard' },
  { to: '/portal/checklist', icon: ClipboardDocumentCheckIcon, label: 'Planning Checklist' },
  { to: '/portal/guests', icon: UserGroupIcon, label: 'Guest List' },
  { to: '/portal/budget', icon: CurrencyDollarIcon, label: 'Budget Tracker' },
  { to: '/portal/vendors', icon: BuildingStorefrontIcon, label: 'Vendors' },
  { to: '/portal/timeline', icon: ClockIcon, label: 'Day-Of Timeline' },
  { to: '/portal/messages', icon: ChatBubbleLeftRightIcon, label: 'Messages' },
  { to: '/portal/documents', icon: DocumentTextIcon, label: 'Documents' },
]

export default function PortalSidebar() {
  const { couple, logoutCouple } = useAuth()

  return (
    <aside className="fixed inset-y-0 left-0 z-30 w-64 flex flex-col shadow-sm"
      style={{ background: 'linear-gradient(180deg, #fff1f2 0%, #ffffff 50%, #f2f7f2 100%)' }}>
      {/* Logo */}
      <div className="p-6 border-b border-rose-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-rose-500 rounded-xl flex items-center justify-center">
            <HeartIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-rose-900 leading-tight font-serif">Rustic Retreat</h1>
            <p className="text-xs text-rose-400">Wedding Portal</p>
          </div>
        </div>
      </div>

      {/* Couple info */}
      {couple && (
        <div className="px-4 py-3 border-b border-rose-100 bg-rose-50/50">
          <p className="text-xs text-rose-400 font-medium uppercase tracking-wide">Your Wedding</p>
          <p className="text-sm font-semibold text-rose-900 mt-0.5">
            {couple.partner1_name} & {couple.partner2_name}
          </p>
          {couple.wedding_date && (
            <p className="text-xs text-rose-500 mt-0.5">
              {new Date(couple.wedding_date + 'T00:00:00').toLocaleDateString('en-US', {
                month: 'long', day: 'numeric', year: 'numeric'
              })}
            </p>
          )}
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 ${
                isActive
                  ? 'bg-rose-100 text-rose-700'
                  : 'text-gray-600 hover:bg-rose-50 hover:text-rose-700'
              }`
            }
          >
            <Icon className="w-5 h-5 flex-shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <div className="p-4 border-t border-rose-100">
        <button
          onClick={logoutCouple}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        >
          <ArrowRightOnRectangleIcon className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </aside>
  )
}
