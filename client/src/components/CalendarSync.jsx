import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '../contexts/AuthContext'

// A private address Google Calendar, Outlook or Apple Calendar can subscribe
// to: weddings, holds, blocked dates and scheduled tours. One-way and
// read-only. Only an admin can turn it on or change the address.

export default function CalendarSync() {
  const { getAdminAxios, user } = useAuth()
  const api = useRef(getAdminAxios()).current
  const [feed, setFeed] = useState(null)
  const isAdmin = user?.role === 'admin'

  useEffect(() => { api.get('/api/calendar/feed-settings').then(r => setFeed(r.data)).catch(() => setFeed({ enabled: false })) }, [api])

  const act = async (action) => {
    if (action === 'regenerate' && !confirm('Make a new address? Calendars subscribed to the old one stop updating until you add the new one.')) return
    if (action === 'disable' && !confirm('Turn the calendar feed off? Subscribed calendars stop updating.')) return
    try { const { data } = await api.post('/api/calendar/feed-settings', { action }); setFeed(data); toast.success(data.enabled ? 'Calendar feed is on' : 'Calendar feed is off') }
    catch (err) { toast.error(err.response?.data?.error || 'Could not change the calendar feed') }
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(feed.url); toast.success('Address copied') }
    catch { toast.error('Copy failed — select the address and copy it') }
  }

  if (!feed) return null
  return (
    <div className="card p-5 space-y-3">
      <h2 className="font-semibold text-slate-800">Calendar sync</h2>
      <p className="text-sm text-slate-500">See weddings, holds, blocked dates and site tours in Google Calendar, Outlook or your phone. The calendar app checks for changes on its own schedule (Google can take several hours). It only reads from the CRM; changes made in the calendar app are not copied back.</p>
      {feed.enabled ? (
        <>
          <label htmlFor="feed-url" className="block text-xs font-medium text-slate-600">Private calendar address</label>
          <div className="flex flex-wrap gap-2">
            <input id="feed-url" name="feed-url" readOnly className="input-field flex-1 min-w-[16rem] font-mono text-xs" value={feed.url} onFocus={e => e.target.select()} />
            <button className="btn-secondary" onClick={copy}>Copy</button>
          </div>
          <p className="text-xs text-slate-500">In Google Calendar: Other calendars → + → From URL, then paste. Anyone with this address can see couples’ names and dates, so share it only with staff.</p>
          {isAdmin && (
            <div className="flex flex-wrap gap-2 pt-1">
              <button className="btn-ghost" onClick={() => act('regenerate')}>Make a new address</button>
              <button className="btn-ghost text-red-600" onClick={() => act('disable')}>Turn off</button>
            </div>
          )}
        </>
      ) : isAdmin ? (
        <button className="btn-primary" onClick={() => act('enable')}>Turn on calendar sync</button>
      ) : <p className="text-sm text-slate-500">Off. An admin can turn it on here.</p>}
    </div>
  )
}
