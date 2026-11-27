import { useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { HeartIcon, EnvelopeIcon } from '@heroicons/react/24/outline'

// Public: staff who cannot sign in ask for a link to choose a new password.
// The server replies the same way whether or not the address has a login, so
// this page says "if" rather than confirming anything.

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(null)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setSending(true); setError(null)
    try {
      const { data } = await axios.post('/api/auth/forgot-password', { email: email.trim() }, { timeout: 20000 })
      setDone(data.message)
    } catch (err) {
      setError(err.response?.status === 429
        ? 'Too many tries. Wait 15 minutes, then try again.'
        : err.response?.data?.error || 'Could not reach the CRM. Check your connection and try again.')
    } finally { setSending(false) }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6 py-12">
      <div className="max-w-sm w-full">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 bg-rose-600 rounded-lg flex items-center justify-center"><HeartIcon className="w-5 h-5 text-white" /></div>
          <div className="font-bold text-slate-900">Rustic Retreat CRM</div>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-1">Forgot your password?</h1>
        {done ? (
          <div className="mt-6 space-y-4">
            <div className="flex gap-3 rounded-xl bg-emerald-50 border border-emerald-100 p-4 text-sm text-emerald-800">
              <EnvelopeIcon className="w-5 h-5 flex-shrink-0" /> <p>{done}</p>
            </div>
            <p className="text-sm text-slate-500">No email? You may sign in with a different address. An admin can send you a link from Settings → Who can log in.</p>
            <Link to="/login" className="text-sm font-medium text-rose-600 hover:text-rose-700">← Back to sign in</Link>
          </div>
        ) : (
          <>
            <p className="text-slate-500 text-sm mb-8">Enter the email you sign in with and we will email you a link to choose a new password.</p>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label htmlFor="forgot-email" className="label">Email address</label>
                <input id="forgot-email" name="forgot-email" type="email" required autoComplete="email" value={email}
                  onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className="input-field" />
              </div>
              {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
              <button type="submit" disabled={sending} className="w-full btn-primary justify-center py-2.5 text-sm font-semibold">
                {sending ? 'Sending…' : 'Email me a link'}
              </button>
            </form>
            <p className="mt-6 text-center text-sm"><Link to="/login" className="text-rose-600 hover:text-rose-700 font-medium">← Back to sign in</Link></p>
          </>
        )}
      </div>
    </div>
  )
}
