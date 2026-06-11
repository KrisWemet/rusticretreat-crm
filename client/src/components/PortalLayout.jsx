import { Outlet, Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import PortalSidebar from './PortalSidebar'

export default function PortalLayout() {
  const { couple, loading } = useAuth()

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
      <PortalSidebar />
      <main className="flex-1 ml-60 min-h-screen overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
