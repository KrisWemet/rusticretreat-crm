import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
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
      toast.error(err.response?.data?.error || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left: Hero */}
      <div
        className="hidden lg:flex flex-1 flex-col justify-end p-12 relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #881337 0%, #be123c 40%, #e11d48 70%, #f43f5e 100%)'
        }}
      >
        {/* Decorative circles */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-1/4 left-0 w-64 h-64 bg-white/5 rounded-full -translate-x-1/2" />
        <div className="absolute top-1/3 left-1/4 w-32 h-32 bg-white/10 rounded-full" />

        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center border border-white/30">
              <span className="text-white text-3xl font-bold font-serif">R</span>
            </div>
            <div>
              <h1 className="text-4xl font-bold text-white font-serif">Rustic Retreat</h1>
              <p className="text-rose-200 text-lg">Wedding Venue</p>
            </div>
          </div>
          <p className="text-white/80 text-xl leading-relaxed max-w-md">
            Where every love story finds its perfect setting. Manage your venue, clients, and events all in one beautiful place.
          </p>
          <div className="flex gap-6 mt-8">
            <div className="text-center">
              <p className="text-3xl font-bold text-white">150+</p>
              <p className="text-rose-200 text-sm">Events per year</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-white">500+</p>
              <p className="text-rose-200 text-sm">Happy couples</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-white">12+</p>
              <p className="text-rose-200 text-sm">Years of magic</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right: Login form */}
      <div className="flex-1 lg:max-w-md flex flex-col justify-center px-8 py-12 bg-white">
        <div className="max-w-sm mx-auto w-full">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-10 lg:hidden">
            <div className="w-10 h-10 bg-rose-600 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold font-serif">R</span>
            </div>
            <div>
              <h1 className="font-bold text-gray-900 font-serif">Rustic Retreat</h1>
              <p className="text-xs text-gray-400">Wedding Venue CRM</p>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome back</h2>
          <p className="text-gray-500 mb-8">Sign in to your staff portal</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@rusticretreat.com"
                required
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white font-semibold py-3 px-6 rounded-xl transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in...
                </span>
              ) : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 p-4 bg-rose-50 rounded-xl border border-rose-100">
            <p className="text-xs text-rose-700 font-medium mb-1">Demo credentials:</p>
            <p className="text-xs text-rose-600">Email: admin@rusticretreat.com</p>
            <p className="text-xs text-rose-600">Password: admin123</p>
          </div>

          <p className="mt-6 text-center text-sm text-gray-500">
            Are you a couple?{' '}
            <a href="/portal/login" className="text-rose-600 hover:text-rose-700 font-medium">
              Access your wedding portal →
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
