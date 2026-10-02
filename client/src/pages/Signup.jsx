import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import axios from 'axios'
import toast from 'react-hot-toast'
import { HeartIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../contexts/AuthContext'

// Reached from the private link the admin sends with an invite. The person
// confirms their name, chooses a password, and is signed straight in. There is
// no open sign-up: without a valid invite this page only says the link is dead.
export default function Signup() {
  const { token } = useParams()
  const { signUpAdmin, user } = useAuth()
  const navigate = useNavigate()
  const [invite, setInvite] = useState(null)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', password: '', confirm: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    axios.get(`/api/auth/invite/${token}`)
      .then(r => { setInvite(r.data); setForm(f => ({ ...f, name: r.data.name })) })
      .catch(err => setError(err.response?.data?.error || 'This sign-up link could not be opened.'))
  }, [token])

  const submit = async (e) => {
    e.preventDefault()
    if (form.password !== form.confirm) return toast.error('The two passwords do not match')
    setSaving(true)
    try {
      const u = await signUpAdmin(token, { name: form.name, password: form.password })
      toast.success(`Welcome, ${u.name}!`)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not set up your login')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-center px-6 sm:px-12 py-12 bg-slate-50">
      <div className="max-w-sm w-full mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 bg-rose-600 rounded-lg flex items-center justify-center">
            <HeartIcon className="w-5 h-5 text-white" />
          </div>
          <div className="font-bold text-slate-900">Rustic Retreat CRM</div>
        </div>

        {error ? (
          <div className="card p-5 space-y-3">
            <h1 className="text-xl font-bold text-slate-900">Link not valid</h1>
            <p className="text-sm text-slate-600">{error}</p>
            <Link to="/login" className="text-sm text-rose-600 hover:text-rose-700 font-medium">Go to sign in →</Link>
          </div>
        ) : !invite ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-slate-900 mb-1">{invite.reset ? 'Choose a new password' : 'Create your login'}</h1>
            <p className="text-slate-500 text-sm mb-8">
              You'll sign in with <strong className="text-slate-700">{invite.email}</strong>
              {invite.role === 'admin' ? ' as an admin.' : '.'}
            </p>
            {user && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-3 mb-4">
                This browser is signed in as {user.name}. Continuing will switch it to {invite.email}.
              </p>
            )}
            <form onSubmit={submit} className="space-y-4">
              {!invite.reset && (
                <div>
                  <label htmlFor="signup-name" className="label">Your name</label>
                  <input id="signup-name" required autoComplete="name" value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input-field" />
                </div>
              )}
              <div>
                <label htmlFor="signup-password" className="label">Choose a password</label>
                <input id="signup-password" type="password" required minLength={10} autoComplete="new-password" value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className="input-field" />
              </div>
              <div>
                <label htmlFor="signup-confirm" className="label">Password again</label>
                <input id="signup-confirm" type="password" required minLength={10} autoComplete="new-password" value={form.confirm}
                  onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))} className="input-field" />
              </div>
              <p className="text-xs text-slate-400">At least 10 characters.</p>
              <button type="submit" disabled={saving} className="w-full btn-primary justify-center py-2.5 text-sm font-semibold">
                {saving ? 'Saving…' : invite.reset ? 'Save password and sign in' : 'Create login'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
