import { lazy, Suspense } from 'react'
import PageErrorBoundary from './components/PageErrorBoundary'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './contexts/AuthContext'
import Layout from './components/Layout'
import PortalLayout from './components/PortalLayout'
const Login = lazy(() => import('./pages/Login'))
const PortalLogin = lazy(() => import('./pages/PortalLogin'))
const SignContract = lazy(() => import('./pages/SignContract'))
const Dashboard = lazy(() => import('./pages/admin/Dashboard'))
const Clients = lazy(() => import('./pages/admin/Clients'))
const ClientDetail = lazy(() => import('./pages/admin/ClientDetail'))
const Bookings = lazy(() => import('./pages/admin/Bookings'))
const Messages = lazy(() => import('./pages/admin/Messages'))
const Tasks = lazy(() => import('./pages/admin/Tasks'))
const VendorsAdmin = lazy(() => import('./pages/admin/VendorsAdmin'))
const Contracts = lazy(() => import('./pages/admin/Contracts'))
const Payments = lazy(() => import('./pages/admin/Payments'))
const VenueCalendar = lazy(() => import('./pages/admin/VenueCalendar'))
const Inquire = lazy(() => import('./pages/Inquire'))
const PortalDashboard = lazy(() => import('./pages/portal/PortalDashboard'))
const Checklist = lazy(() => import('./pages/portal/Checklist'))
const GuestList = lazy(() => import('./pages/portal/GuestList'))
const Budget = lazy(() => import('./pages/portal/Budget'))
const VendorList = lazy(() => import('./pages/portal/VendorList'))
const Timeline = lazy(() => import('./pages/portal/Timeline'))
const PortalMessages = lazy(() => import('./pages/portal/PortalMessages'))
const Documents = lazy(() => import('./pages/portal/Documents'))
const PortalPayments = lazy(() => import('./pages/portal/Payments'))
const PortalSettings = lazy(() => import('./pages/portal/Settings'))
const Analytics = lazy(() => import('./pages/admin/Analytics'))
const Packages = lazy(() => import('./pages/admin/Packages'))
const Backups = lazy(() => import('./pages/admin/Backups'))
const Tours = lazy(() => import('./pages/admin/Tours'))
const Pipeline = lazy(() => import('./pages/admin/Pipeline'))
const Proposals = lazy(() => import('./pages/admin/Proposals'))
const FormsAdmin = lazy(() => import('./pages/admin/Forms'))
const PublicProposal = lazy(() => import('./pages/PublicProposal'))
const PublicForm = lazy(() => import('./pages/PublicForm'))
const PortalForms = lazy(() => import('./pages/portal/Forms'))
const Settings = lazy(() => import('./pages/admin/Settings'))
const NotFound = lazy(() => import('./pages/NotFound'))

const Help=lazy(()=>import('./pages/admin/Help'))
const AssignedEvents=lazy(()=>import('./pages/admin/AssignedEvents'))

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
        <PageErrorBoundary>
        <Suspense fallback={<div role="status" className="p-6 text-slate-500">Loading page…</div>}>
        <Routes>
          {/* Public: no auth needed */}
          <Route path="/sign/:token" element={<SignContract />} />
          <Route path="/proposal/:token" element={<PublicProposal />} />
          <Route path="/form/:token" element={<PublicForm />} />
          <Route path="/inquire" element={<Inquire />} />

          {/* Admin/Staff routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="operations" element={<AssignedEvents />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="clients" element={<Clients />} />
            <Route path="clients/:id" element={<ClientDetail />} />
            <Route path="pipeline" element={<Pipeline />} />
            <Route path="calendar" element={<VenueCalendar />} />
            <Route path="bookings" element={<Bookings />} />
            <Route path="tours" element={<Tours />} />
            <Route path="proposals" element={<Proposals />} />
            <Route path="forms" element={<FormsAdmin />} />
            <Route path="contracts" element={<Contracts />} />
            <Route path="payments" element={<Payments />} />
            <Route path="messages" element={<Messages />} />
            <Route path="tasks" element={<Tasks />} />
            <Route path="vendors" element={<VendorsAdmin />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="packages" element={<Packages />} />
            <Route path="backups" element={<Backups />} />
            <Route path="help" element={<Help />} />
            <Route path="help/:slug" element={<Help />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
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
            <Route path="forms" element={<PortalForms />} />
            <Route path="vendors" element={<VendorList />} />
            <Route path="timeline" element={<Timeline />} />
            <Route path="messages" element={<PortalMessages />} />
            <Route path="documents" element={<Documents />} />
            <Route path="settings" element={<PortalSettings />} />
          </Route>
        </Routes>
        </Suspense>
        </PageErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
