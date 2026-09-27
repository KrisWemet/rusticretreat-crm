import { useState, useEffect } from 'react'
import { Outlet, Navigate, useLocation } from 'react-router-dom'
import { Bars3Icon } from '@heroicons/react/24/outline'
import { useAuth } from '../contexts/AuthContext'
import Sidebar from './Sidebar'
import CoupleSearch from './CoupleSearch'
import HelpPanel from './HelpPanel'

export default function Layout() {
  const { user, loading, getAdminAxios } = useAuth()
  const [navOpen, setNavOpen] = useState(false)
  const [badges, setBadges] = useState({ unreadMessages: 0, pendingTasks: 0 })
  const location = useLocation()

  // Sidebar badges: unread couple messages, and tasks due today or overdue.
  // Refreshed on navigation and every two minutes.
  useEffect(() => {
    if (!user || user.access_scope==='operations') return
    let cancelled = false
    const load = async () => {
      try {
        const api = getAdminAxios()
        const [m, t] = await Promise.all([api.get('/api/messages/unread/count'), api.get('/api/analytics/today')])
        if (!cancelled) setBadges({ unreadMessages: m.data?.count || 0, pendingTasks: t.data?.tasks_due?.length || 0 })
      } catch { /* badges are a convenience; never block the page */ }
    }
    load()
    const timer = setInterval(load, 120000)
    return () => { cancelled = true; clearInterval(timer) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, location.pathname])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-rose-200 border-t-rose-600"></div>
          <p className="text-sm text-slate-400">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  if(user.access_scope==='operations' && !['/operations','/settings','/help'].includes(location.pathname))return <Navigate to="/operations" replace />

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} unreadMessages={badges.unreadMessages} pendingTasks={badges.pendingTasks} />

      {/* Tap-away backdrop for the mobile drawer */}
      {navOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/50 lg:hidden"
          onClick={() => setNavOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* The sidebar is fixed at 240px, so the content is offset by the same
          amount — but only once there's room for it. Below lg the sidebar
          slides away and this offset must go with it, or the page overflows. */}
      <div className="flex-1 lg:ml-60 flex flex-col min-h-screen min-w-0">
        <header className="sticky top-0 z-20 flex items-center gap-3 bg-white border-b border-slate-200 px-4 py-2.5 lg:px-6">
          <button
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
            className="lg:hidden p-1.5 -ml-1.5 rounded-lg text-slate-600 hover:bg-slate-100"
          >
            <Bars3Icon className="w-6 h-6" />
          </button>
          <span className="lg:hidden font-semibold text-slate-800 text-sm hidden sm:inline">Rustic Retreat</span>
          <div className="flex-1 flex justify-end">
            {user.access_scope!=='operations'&&<CoupleSearch />}
          </div>
          <HelpPanel />
        </header>
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
