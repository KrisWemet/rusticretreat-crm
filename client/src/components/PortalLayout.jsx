import { useState } from 'react'
import { Outlet, Navigate } from 'react-router-dom'
import { Bars3Icon } from '@heroicons/react/24/outline'
import { useAuth } from '../contexts/AuthContext'
import PortalSidebar from './PortalSidebar'

export default function PortalLayout() {
  const { couple, loading } = useAuth()
  const [navOpen, setNavOpen] = useState(false)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-rose-50">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-rose-200 border-t-rose-500"></div>
          <p className="text-sm text-rose-400">Loading your wedding portal...</p>
        </div>
      </div>
    )
  }

  if (!couple) return <Navigate to="/portal/login" replace />

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <PortalSidebar open={navOpen} onClose={() => setNavOpen(false)} />

      {navOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/50 lg:hidden"
          onClick={() => setNavOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Couples open this on their phones more than anywhere else, so the
          240px offset has to drop away with the sidebar below lg. */}
      <div className="flex-1 lg:ml-60 flex flex-col min-h-screen min-w-0">
        <header className="lg:hidden sticky top-0 z-20 flex items-center gap-3 bg-white border-b border-rose-100 px-4 py-3">
          <button
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
            className="p-1.5 -ml-1.5 rounded-lg text-slate-600 hover:bg-rose-50"
          >
            <Bars3Icon className="w-6 h-6" />
          </button>
          <span className="font-semibold text-slate-800 text-sm">Your Wedding</span>
        </header>
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
