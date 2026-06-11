import { Outlet, Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import PortalSidebar from './PortalSidebar'

export default function PortalLayout() {
  const { couple, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-rose-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rose-500"></div>
      </div>
    )
  }

  if (!couple) {
    return <Navigate to="/portal/login" replace />
  }

  return (
    <div className="min-h-screen bg-rose-50/30 flex">
      <PortalSidebar />
      <main className="flex-1 ml-64 min-h-screen">
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
