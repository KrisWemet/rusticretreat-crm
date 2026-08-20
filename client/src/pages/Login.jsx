import { useState } from 'react'
import { useNavigate, Navigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { HeartIcon, CalendarDaysIcon, UsersIcon, SparklesIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { loginAdmin, user } = useAuth()
  const navigate = useNavigate()

  if (user) return <Navigate to="/dashboard" replace />

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await loginAdmin(email, password)
      navigate('/dashboard')
      toast.success('Welcome back!')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Invalid credentials')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left: Brand panel */}
      <div className="hidden lg:flex flex-col w-[480px] flex-shrink-0 relative overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%)' }}>
        {/* decorative */}
        <div className="absolute top-0 right-0 w-72 h-72 bg-rose-600/10 rounded-full -translate-y-1/3 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-violet-600/10 rounded-full translate-y-1/3 -translate-x-1/3" />

        <div className="relative z-10 flex flex-col h-full px-10 py-12">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-auto">
            <div className="w-10 h-10 bg-rose-600 rounded-xl flex items-center justify-center">
              <HeartIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-white font-bold text-lg leading-tight">Rustic Retreat</div>
              <div className="text-slate-400 text-xs">Wedding Venue CRM</div>
            </div>
          </div>

          <div className="mb-auto">
            <h1 className="text-4xl font-bold text-white leading-tight mb-4">
              Manage your venue<br />with confidence
            </h1>
            <p className="text-slate-400 text-lg leading-relaxed">
              Track clients, manage bookings, and communicate with couples — all in one place.
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-10">
            {[
              { icon: CalendarDaysIcon, value: '150+', label: 'Events/year' },
              { icon: UsersIcon, value: '500+', label: 'Happy couples' },
              { icon: SparklesIcon, value: '12+', label: 'Years of magic' },
            ].map(({ icon: Icon, value, label }) => (
              <div key={label} className="text-center bg-white/5 rounded-xl p-3 border border-white/10">
                <Icon className="w-5 h-5 text-rose-400 mx-auto mb-1" />
                <div className="text-xl font-bold text-white">{value}</div>
                <div className="text-xs text-slate-400">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right: Login form */}
      <div className="flex-1 flex flex-col justify-center px-6 sm:px-12 py-12 bg-slate-50">
        <div className="max-w-sm w-full mx-auto">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div className="w-9 h-9 bg-rose-600 rounded-lg flex items-center justify-center">
              <HeartIcon className="w-5 h-5 text-white" />
            </div>
            <div className="font-bold text-slate-900">Rustic Retreat CRM</div>
          </div>

          <h2 className="text-2xl font-bold text-slate-900 mb-1">Staff sign in</h2>
          <p className="text-slate-400 text-sm mb-8">Enter your credentials to access the dashboard</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="login-email-address-1" className="label">Email address</label>
              <input id="login-email-address-1" name="login-email-address-1"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@rusticretreat.com"
                required
                className="input-field"
              />
            </div>
            <div>
              <label htmlFor="login-password-2" className="label">Password</label>
              <input id="login-password-2" name="login-password-2"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="input-field"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary justify-center py-2.5 text-sm font-semibold"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </span>
              ) : 'Sign In'}
            </button>
          </form>

          <div className="mt-5 p-4 bg-amber-50 rounded-xl border border-amber-100">
            <p className="text-xs font-semibold text-amber-700 mb-1.5">Demo credentials</p>
            <p className="text-xs text-amber-700 font-mono">admin@rusticretreat.com</p>
            <p className="text-xs text-amber-700 font-mono">admin123</p>
          </div>

          <p className="mt-6 text-center text-sm text-slate-400">
            Are you a couple?{' '}
            <Link to="/portal/login" className="text-rose-600 hover:text-rose-700 font-medium">
              Open wedding portal →
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
