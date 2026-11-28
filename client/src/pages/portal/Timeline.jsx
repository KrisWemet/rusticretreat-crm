import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { ClockIcon, MapPinIcon } from '@heroicons/react/24/outline'

// The weekend schedule (run of show) the venue plans with the couple. Read-only
// here: changes go through Messages, so the venue's plan stays the one plan.

const dayName = (d) => (d ? new Intl.DateTimeFormat('en-CA', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(d + 'T00:00:00Z')) : 'Date to be set')
// Times are stored already written out ("3:30 PM"); a bare 24-hour time from an
// older record ("15:30") is written out the same way.
const clock = (t) => {
  const s = String(t || '')
  if (/[ap]\.?m/i.test(s)) return s
  const m = s.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return s
  const h = Number(m[1])
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`
}

export default function Timeline() {
  const { getCoupleAxios } = useAuth()
  const [items, setItems] = useState(null)
  useEffect(() => { getCoupleAxios().get('/api/portal/schedule').then(r => setItems(r.data)).catch(() => setItems([])) }, [])

  const days = []
  for (const it of items || []) {
    let d = days.find(x => x.day === (it.day_date || ''))
    if (!d) days.push(d = { day: it.day_date || '', items: [] })
    d.items.push(it)
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="page-title">Your weekend schedule</h1>
        <p className="page-subtitle">Planned with Rustic Retreat. Want something changed? <Link to="/portal/messages" className="text-rose-600 hover:underline">Send us a message</Link>.</p>
      </div>
      {items === null ? <p className="text-slate-400">Loading…</p> : !items.length ? (
        <div className="card py-16 text-center">
          <ClockIcon className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">Your schedule isn't ready yet</p>
          <p className="text-sm text-slate-400 mt-1">We'll plan it with you closer to your weekend. It will appear here.</p>
        </div>
      ) : days.map(d => (
        <div key={d.day} className="card p-5">
          <h2 className="font-semibold text-slate-900 mb-3">{dayName(d.day)}</h2>
          <ol className="space-y-3">
            {d.items.map(it => (
              <li key={it.id} className="flex gap-4">
                <div className="w-20 flex-shrink-0 text-sm font-semibold text-rose-600">{clock(it.time)}</div>
                <div className="min-w-0">
                  <div className="font-medium text-slate-800">{it.title}</div>
                  {it.description && <p className="text-sm text-slate-500">{it.description}</p>}
                  {it.location && <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5"><MapPinIcon className="w-3.5 h-3.5" />{it.location}</p>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  )
}
