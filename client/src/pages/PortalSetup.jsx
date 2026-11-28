import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import axios from 'axios'
import toast from 'react-hot-toast'
import { HeartIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../contexts/AuthContext'

// A couple opens this from their emailed setup link and chooses the password
// for their wedding portal. One login per couple, used with either email.

export default function PortalSetup() {
  const { token } = useParams()
  const { setupCouple } = useAuth()
  const navigate = useNavigate()
  const [info, setInfo] = useState(null)
  const [error, setError] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    axios.get(`/api/portal/setup/${token}`).then(r => setInfo(r.data))
      .catch(err => setError(err.response?.data?.error || 'This link could not be opened.'))
  }, [token])

  const submit = async (e) => {
    e.preventDefault()
    if (pw.length < 10) return toast.error('Choose a password of at least 10 characters')
    if (pw !== pw2) return toast.error('The two passwords do not match')
    setBusy(true)
    try { await setupCouple(token, pw); toast.success('Welcome to your wedding portal!'); navigate('/portal/dashboard', { replace: true }) }
    catch (err) { toast.error(err.response?.data?.error || 'Could not save your password'); setBusy(false) }
  }

  return (
    <div className="min-h-screen bg-rose-50/40 flex items-center justify-center px-6 py-12">
      <div className="max-w-sm w-full bg-white rounded-2xl shadow-sm border border-rose-100 p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 bg-rose-500 rounded-lg flex items-center justify-center"><HeartIcon className="w-5 h-5 text-white" /></div>
          <div className="font-bold text-slate-900">Rustic Retreat wedding portal</div>
        </div>
        {!info ? <p className="text-slate-600">{error || 'Loading…'}</p> : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <h1 className="text-xl font-bold text-slate-900">Welcome, {info.couple}</h1>
              <p className="text-sm text-slate-500 mt-1">Choose a password for your portal. Afterwards you can sign in with either of your email addresses.</p>
            </div>
            <div>
              <label htmlFor="setup-pw" className="label">Password (at least 10 characters)</label>
              <input id="setup-pw" name="setup-pw" type="password" autoComplete="new-password" required value={pw} onChange={e => setPw(e.target.value)} className="input-field" />
            </div>
            <div>
              <label htmlFor="setup-pw2" className="label">Type it again</label>
              <input id="setup-pw2" name="setup-pw2" type="password" autoComplete="new-password" required value={pw2} onChange={e => setPw2(e.target.value)} className="input-field" />
            </div>
            <button type="submit" disabled={busy} className="w-full bg-rose-500 hover:bg-rose-600 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg text-sm">{busy ? 'Saving…' : 'Open my portal'}</button>
          </form>
        )}
      </div>
    </div>
  )
}
