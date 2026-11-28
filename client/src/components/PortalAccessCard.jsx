import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '../contexts/AuthContext'

// A couple's access to their wedding portal, on their page: send the setup
// link, see whether they have signed in, or withdraw access.

const when = (s) => (s ? new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Edmonton' }).format(new Date(String(s).replace(' ', 'T') + 'Z')) : '')

export default function PortalAccessCard({ coupleId }) {
  const { getAdminAxios } = useAuth()
  const api = useRef(getAdminAxios()).current
  const [a, setA] = useState(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => api.get(`/api/portal/access/${coupleId}`).then(r => setA(r.data)).catch(() => {}), [api, coupleId])
  useEffect(() => { load() }, [load])
  if (!a) return null

  const invite = async () => {
    if (!confirm(a.has_login ? 'Email the couple a link to choose a new portal password?' : 'Email the couple their portal setup link?')) return
    setBusy(true)
    try {
      const { data } = await api.post(`/api/portal/invite/${coupleId}`, { send_email: true })
      setA(data)
      toast.success(data.emailed?.delivered ? 'Portal link emailed to the couple' : `Link made but not emailed${data.emailed?.error ? `: ${data.emailed.error}` : ''}`)
    } catch (err) { toast.error(err.response?.data?.error || 'Could not send the portal link') }
    finally { setBusy(false) }
  }
  const revoke = async () => {
    if (!confirm('Withdraw this couple’s portal access? They are signed out and can’t sign in until you send a new link.')) return
    setBusy(true)
    try { const { data } = await api.delete(`/api/portal/access/${coupleId}`); setA(data); toast.success('Portal access withdrawn') }
    catch (err) { toast.error(err.response?.data?.error || 'Could not withdraw access') }
    finally { setBusy(false) }
  }

  const status = !a.enabled ? ['Portal switched off', 'bg-slate-100 text-slate-600']
    : a.has_login ? ['Has a login', 'bg-emerald-100 text-emerald-700']
    : a.invite_pending ? ['Link sent, not set up yet', 'bg-sky-100 text-sky-700']
    : ['No login yet', 'bg-slate-100 text-slate-600']

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-gray-900">Wedding portal</h2>
          <p className="text-xs text-gray-500">Where the couple sees payments, their Final Details Form, documents you share, their schedule and messages.</p>
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${status[1]}`}>{status[0]}</span>
      </div>
      {!a.enabled ? (
        <p className="text-sm text-gray-600">The portal is off for every couple. It is turned on in Railway's settings (ENABLE_COUPLE_PORTAL = 1).</p>
      ) : (
        <>
          <div className="text-sm text-gray-600 space-y-0.5">
            {a.last_login_at && <div>Last signed in {when(a.last_login_at)}</div>}
            {a.invite_pending && <div>Setup link sent {when(a.invite_pending.created_at)}, works until {when(a.invite_pending.expires_at)}</div>}
            {!a.has_login && !a.invite_pending && <div>Their setup link is emailed on its own once both partners have signed the agreement, or send it now.</div>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={invite} disabled={busy}>{a.has_login ? 'Send a new-password link' : a.invite_pending ? 'Re-send setup link' : 'Send portal link'}</button>
            {(a.has_login || a.invite_pending) && <button className="btn-ghost text-red-600" onClick={revoke} disabled={busy}>Withdraw access</button>}
          </div>
        </>
      )}
    </div>
  )
}
