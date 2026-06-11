import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { HeartIcon } from '@heroicons/react/24/solid'
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
      toast.error(err.response?.data?.error || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #fff1f2 0%, #fce8d8 40%, #f2f7f2 100%)' }}>

      {/* Decorative elements */}
      <div className="absolute top-20 left-20 w-32 h-32 bg-rose-200/30 rounded-full blur-3xl" />
      <div className="absolute bottom-20 right-20 w-48 h-48 bg-emerald-200/20 rounded-full blur-3xl" />

      <div className="w-full max-w-md relative z-10 px-4">
        {/* Card */}
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl border border-rose-100 p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-rose-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-rose-200">
              <HeartIcon className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-rose-900 font-serif">Rustic Retreat</h1>
            <p className="text-rose-400 text-sm mt-1">Wedding Planning Portal</p>
          </div>

          <h2 className="text-xl font-semibold text-gray-800 mb-1 text-center">Welcome back!</h2>
          <p className="text-gray-500 text-sm mb-6 text-center">Sign in to access your wedding planning tools</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="w-full px-4 py-3 border border-rose-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-400 focus:border-transparent transition-all bg-white/80 placeholder-gray-300"
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
                className="w-full px-4 py-3 border border-rose-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-400 focus:border-transparent transition-all bg-white/80 placeholder-gray-300"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-rose-500 hover:bg-rose-600 disabled:opacity-60 text-white font-semibold py-3 px-6 rounded-xl transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:ring-offset-2 shadow-lg shadow-rose-200"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in...
                </span>
              ) : 'Access My Portal'}
            </button>
          </form>

          <div className="mt-4 p-4 bg-rose-50 rounded-xl border border-rose-100">
            <p className="text-xs text-rose-600 font-medium mb-1">Demo credentials:</p>
            <p className="text-xs text-rose-500">Email: emma.liam@example.com</p>
            <p className="text-xs text-rose-500">Password: couple123</p>
          </div>

          <p className="mt-6 text-center text-sm text-gray-500">
            Venue staff?{' '}
            <a href="/login" className="text-rose-600 hover:text-rose-700 font-medium">
              Staff portal →
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
