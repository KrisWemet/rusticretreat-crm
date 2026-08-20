import { useState } from 'react'
import { useNavigate, Navigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { HeartIcon, ClipboardDocumentCheckIcon, UserGroupIcon, CurrencyDollarIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

export default function PortalLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { loginCouple, couple } = useAuth()
  const navigate = useNavigate()

  if (couple) return <Navigate to="/portal/dashboard" replace />

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await loginCouple(email, password)
      navigate('/portal/dashboard')
      toast.success('Welcome to your wedding portal!')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Invalid credentials')
    } finally {
      setLoading(false)
    }
  }

  const features = [
    { icon: ClipboardDocumentCheckIcon, text: 'Interactive planning checklist' },
    { icon: UserGroupIcon, text: 'Guest list & RSVP tracking' },
    { icon: CurrencyDollarIcon, text: 'Budget tracker & vendor management' },
    { icon: HeartIcon, text: 'Day-of timeline & direct messaging' },
  ]

  return (
    <div className="min-h-screen flex">
      {/* Left: feature panel */}
      <div className="hidden lg:flex flex-col w-[460px] flex-shrink-0 relative overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #881337 0%, #e11d48 60%, #f43f5e 100%)' }}>
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/3 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-40 h-40 bg-white/5 rounded-full translate-y-1/3 -translate-x-1/3" />

        <div className="relative z-10 flex flex-col h-full px-10 py-12">
          <div className="flex items-center gap-3 mb-auto">
            <div className="w-9 h-9 bg-white/20 rounded-lg flex items-center justify-center">
              <HeartIcon className="w-5 h-5 text-white" />
            </div>
            <div className="text-white font-semibold">Rustic Retreat</div>
          </div>

          <div className="mb-auto">
            <h1 className="text-3xl font-bold text-white leading-tight mb-3">Your wedding,<br />beautifully planned</h1>
            <p className="text-rose-200 leading-relaxed mb-8">
              Access all your planning tools in one place — checklists, guest lists, budget, and direct communication with our team.
            </p>
            <div className="space-y-3">
              {features.map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-white/15 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-rose-100 text-sm">{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right: Login */}
      <div className="flex-1 flex flex-col justify-center px-6 sm:px-12 py-12 bg-rose-50/30">
        <div className="max-w-sm w-full mx-auto">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div className="w-9 h-9 bg-rose-500 rounded-lg flex items-center justify-center">
              <HeartIcon className="w-5 h-5 text-white" />
            </div>
            <div className="font-bold text-slate-900">Wedding Portal</div>
          </div>

          <h2 className="text-2xl font-bold text-slate-900 mb-1">Welcome back</h2>
          <p className="text-slate-400 text-sm mb-8">Sign in to access your wedding planning tools</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="portallo-email-address-1" className="label">Email address</label>
              <input id="portallo-email-address-1" name="portallo-email-address-1"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="input-field focus:ring-rose-400 border-rose-200"
              />
            </div>
            <div>
              <label htmlFor="portallo-password-2" className="label">Password</label>
              <input id="portallo-password-2" name="portallo-password-2"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="input-field focus:ring-rose-400 border-rose-200"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-rose-500 hover:bg-rose-600 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </span>
              ) : 'Access My Portal'}
            </button>
          </form>

          <div className="mt-5 p-4 bg-rose-50 rounded-xl border border-rose-100">
            <p className="text-xs font-semibold text-rose-700 mb-1.5">Demo credentials</p>
            <p className="text-xs text-rose-600 font-mono">emma.liam@example.com</p>
            <p className="text-xs text-rose-600 font-mono">couple123</p>
          </div>

          <p className="mt-6 text-center text-sm text-slate-400">
            Venue staff?{' '}
            <Link to="/login" className="text-rose-600 hover:text-rose-700 font-medium">
              Staff portal →
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
