import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './contexts/AuthContext'
import Layout from './components/Layout'
import PortalLayout from './components/PortalLayout'
import Login from './pages/Login'
import PortalLogin from './pages/PortalLogin'
import SignContract from './pages/SignContract'
import Dashboard from './pages/admin/Dashboard'
import Clients from './pages/admin/Clients'
import ClientDetail from './pages/admin/ClientDetail'
import Bookings from './pages/admin/Bookings'
import Messages from './pages/admin/Messages'
import Tasks from './pages/admin/Tasks'
import VendorsAdmin from './pages/admin/VendorsAdmin'
import Contracts from './pages/admin/Contracts'
import Payments from './pages/admin/Payments'
import VenueCalendar from './pages/admin/VenueCalendar'
import Inquire from './pages/Inquire'
import PortalDashboard from './pages/portal/PortalDashboard'
import Checklist from './pages/portal/Checklist'
import GuestList from './pages/portal/GuestList'
import Budget from './pages/portal/Budget'
import VendorList from './pages/portal/VendorList'
import Timeline from './pages/portal/Timeline'
import PortalMessages from './pages/portal/PortalMessages'
import Documents from './pages/portal/Documents'
import PortalPayments from './pages/portal/Payments'
import PortalSettings from './pages/portal/Settings'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3000,
            style: {
              background: '#363636',
              color: '#fff',
            },
            success: {
              style: {
                background: '#4a7f4e',
              },
            },
            error: {
              style: {
                background: '#be123c',
              },
            },
          }}
        />
        <Routes>
          {/* Public: no auth needed */}
          <Route path="/sign/:token" element={<SignContract />} />
          <Route path="/inquire" element={<Inquire />} />

          {/* Admin/Staff routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="clients" element={<Clients />} />
            <Route path="clients/:id" element={<ClientDetail />} />
            <Route path="calendar" element={<VenueCalendar />} />
            <Route path="bookings" element={<Bookings />} />
            <Route path="contracts" element={<Contracts />} />
            <Route path="payments" element={<Payments />} />
            <Route path="messages" element={<Messages />} />
            <Route path="tasks" element={<Tasks />} />
            <Route path="vendors" element={<VendorsAdmin />} />
          </Route>

          {/* Couple portal routes */}
          <Route path="/portal/login" element={<PortalLogin />} />
          <Route path="/portal" element={<PortalLayout />}>
            <Route index element={<Navigate to="/portal/dashboard" replace />} />
            <Route path="dashboard" element={<PortalDashboard />} />
            <Route path="checklist" element={<Checklist />} />
            <Route path="guests" element={<GuestList />} />
            <Route path="budget" element={<Budget />} />
            <Route path="payments" element={<PortalPayments />} />
            <Route path="vendors" element={<VendorList />} />
            <Route path="timeline" element={<Timeline />} />
            <Route path="messages" element={<PortalMessages />} />
            <Route path="documents" element={<Documents />} />
            <Route path="settings" element={<PortalSettings />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
