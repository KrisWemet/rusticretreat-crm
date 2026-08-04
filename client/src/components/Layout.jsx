import { useState } from 'react'
import { Outlet, Navigate } from 'react-router-dom'
import { Bars3Icon } from '@heroicons/react/24/outline'
import { useAuth } from '../contexts/AuthContext'
import Sidebar from './Sidebar'

export default function Layout() {
  const { user, loading } = useAuth()
  const [navOpen, setNavOpen] = useState(false)

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

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />

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
        <header className="lg:hidden sticky top-0 z-20 flex items-center gap-3 bg-white border-b border-slate-200 px-4 py-3">
          <button
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
            className="p-1.5 -ml-1.5 rounded-lg text-slate-600 hover:bg-slate-100"
          >
            <Bars3Icon className="w-6 h-6" />
          </button>
          <span className="font-semibold text-slate-800 text-sm">Rustic Retreat</span>
        </header>
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
