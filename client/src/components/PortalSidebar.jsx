import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  HomeIcon,
  ClipboardDocumentCheckIcon,
  UserGroupIcon,
  CurrencyDollarIcon,
  BanknotesIcon,
  BuildingStorefrontIcon,
  ClockIcon,
  ChatBubbleLeftRightIcon,
  DocumentTextIcon,
  ArrowRightOnRectangleIcon,
  HeartIcon,
  Cog6ToothIcon,
  PencilSquareIcon,
} from '@heroicons/react/24/outline'

const navItems = [
  { to: '/portal/dashboard', icon: HomeIcon, label: 'Dashboard' },
  { to: '/portal/checklist', icon: ClipboardDocumentCheckIcon, label: 'Planning Checklist' },
  { to: '/portal/guests', icon: UserGroupIcon, label: 'Guest List' },
  { to: '/portal/budget', icon: CurrencyDollarIcon, label: 'Budget Tracker' },
  { to: '/portal/payments', icon: BanknotesIcon, label: 'Payments' },
  { to: '/portal/forms', icon: PencilSquareIcon, label: 'Forms' },
  { to: '/portal/vendors', icon: BuildingStorefrontIcon, label: 'Vendors' },
  { to: '/portal/timeline', icon: ClockIcon, label: 'Day-Of Timeline' },
  { to: '/portal/messages', icon: ChatBubbleLeftRightIcon, label: 'Messages' },
  { to: '/portal/documents', icon: DocumentTextIcon, label: 'Documents' },
  { to: '/portal/settings', icon: Cog6ToothIcon, label: 'Settings' },
]

export default function PortalSidebar({ open = false, onClose = () => {} }) {
  const { couple, logoutCouple } = useAuth()
  const location = useLocation()

  return (
    <aside className={`fixed inset-y-0 left-0 z-40 w-60 bg-white border-r border-rose-100 flex flex-col transition-transform duration-200 lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
      {/* Logo */}
      <div className="px-5 py-5 border-b border-rose-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-rose-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <HeartIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-rose-900 font-semibold text-sm leading-tight">Rustic Retreat</div>
            <div className="text-rose-400 text-xs">Couple Portal</div>
          </div>
        </div>
      </div>

      {/* Couple info banner */}
      {couple && (
        <div className="mx-3 mt-3 mb-1 bg-rose-50 rounded-xl px-3.5 py-3 border border-rose-100">
          <p className="text-xs text-rose-400 font-semibold uppercase tracking-wide mb-0.5">Your Wedding</p>
          <p className="text-sm font-semibold text-rose-800">{couple.partner1_name} & {couple.partner2_name}</p>
          {couple.wedding_date && (
            <p className="text-xs text-rose-500 mt-0.5">
              {new Date(couple.wedding_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          )}
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label }) => {
          const isActive = location.pathname === to
          return (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 ${
                isActive
                  ? 'bg-rose-600 text-white'
                  : 'text-slate-600 hover:text-rose-700 hover:bg-rose-50'
              }`}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {label}
            </NavLink>
          )
        })}
      </nav>

      {/* Logout */}
      <div className="px-3 py-4 border-t border-rose-100">
        <button
          onClick={logoutCouple}
          className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        >
          <ArrowRightOnRectangleIcon className="w-5 h-5" />
          Sign Out
        </button>
      </div>
    </aside>
  )
}
