import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CalendarDaysIcon,
  LockClosedIcon,
  XMarkIcon,
  PlusIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval,
         startOfWeek, endOfWeek, isSameMonth, isToday } from 'date-fns'

// Everything is compared as YYYY-MM-DD strings, so a date never shifts with the
// browser's time zone.
const key = (d) => format(d, 'yyyy-MM-dd')
const inStay = (item, day) => item.event_date <= day && day <= (item.end_date || item.event_date)
const shortNames = (i) => `${(i.partner1_name || '').split(' ')[0]} & ${(i.partner2_name || '').split(' ')[0]}`

export default function VenueCalendar() {
  const { getAdminAxios } = useAuth()
  const navigate = useNavigate()
  const [current, setCurrent] = useState(new Date())
  const [booked, setBooked] = useState([])
  const [holds, setHolds] = useState([])
  const [blocked, setBlocked] = useState([])
  const [tours, setTours] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [selected, setSelected] = useState(null) // YYYY-MM-DD
  const [blockForm, setBlockForm] = useState(null) // { from, to, reason }

  const fetchData = async () => {
    const r = await getAdminAxios().get('/api/calendar')
    setBooked(r.data.booked); setHolds(r.data.holds || []); setBlocked(r.data.blocked); setTours(r.data.tours || [])
    setLoadError(null)
  }

  useEffect(() => {
    fetchData()
      .catch(err => setLoadError(err.response?.data?.error || 'Could not load the calendar'))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(current), { weekStartsOn: 0 }),
    end:   endOfWeek(endOfMonth(current),   { weekStartsOn: 0 }),
  })

  // Every item on a day, in the order they matter.
  const itemsFor = (day) => [
    ...booked.filter(b => inStay(b, day)).map(b => ({ type: 'booking', id: `b${b.id}`, data: b, start: b.event_date === day })),
    ...holds.filter(h => inStay(h, day)).map(h => ({ type: 'hold', id: `h${h.kind}${h.id}`, data: h, start: h.event_date === day })),
    ...tours.filter(t => t.scheduled_at?.slice(0, 10) === day).map(t => ({ type: 'tour', id: `t${t.id}`, data: t })),
    ...blocked.filter(b => b.date === day).map(b => ({ type: 'block', id: `x${b.id}`, data: b })),
  ]

  const chip = (it) => {
    if (it.type === 'booking') return { cls: it.start ? 'bg-rose-500 text-white' : 'bg-rose-200 text-rose-800', text: shortNames(it.data) }
    if (it.type === 'hold') return { cls: 'bg-violet-100 text-violet-800 border border-dashed border-violet-300', text: `Hold: ${shortNames(it.data)}` }
    if (it.type === 'tour') return { cls: 'bg-amber-500 text-white', text: `Tour ${it.data.scheduled_at.slice(11, 16)} ${it.data.name.split(' ')[0]}` }
    return { cls: 'bg-slate-500 text-white', text: it.data.reason || 'Blocked' }
  }

  const blockDates = async (e) => {
    e.preventDefault()
    try {
      if (blockForm.from === blockForm.to) {
        await getAdminAxios().post('/api/calendar/block', { date: blockForm.from, reason: blockForm.reason || null })
      } else {
        await getAdminAxios().post('/api/calendar/block-range', blockForm)
      }
      toast.success(blockForm.from === blockForm.to ? 'Date blocked' : 'Dates blocked')
      setBlockForm(null)
      fetchData()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to block')
    }
  }

  const unblock = async (id) => {
    try {
      await getAdminAxios().delete(`/api/calendar/block/${id}`)
      toast.success('Date unblocked')
      fetchData()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to unblock')
    }
  }

  const today = key(new Date())
  const monthDays = days.filter(d => isSameMonth(d, current)).map(key)
  const selectedItems = selected ? itemsFor(selected) : []
  const upcoming = booked.filter(b => (b.end_date || b.event_date) >= today).slice(0, 10)

  const detail = (
    <div className="card p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-slate-800">{format(parseISO(selected || today), 'EEEE')}</h3>
          <p className="text-sm text-slate-500">{format(parseISO(selected || today), 'MMMM d, yyyy')}</p>
        </div>
        <button onClick={() => setSelected(null)} aria-label="Close day details" className="btn-ghost p-1">
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>

      {selectedItems.length === 0 && (
        <div className="text-xs text-emerald-700 bg-emerald-50 font-semibold px-3 py-1.5 rounded-lg">AVAILABLE</div>
      )}

      {selectedItems.map(it => (
        <div key={it.id} className="text-sm border-l-4 pl-3 py-1 space-y-0.5 border-slate-200">
          {it.type === 'booking' && (
            <>
              <p className="text-xs font-semibold text-rose-700">BOOKED</p>
              <Link to={`/clients/${it.data.couple_id}`} className="font-medium text-rose-600 hover:text-rose-700">{it.data.partner1_name} & {it.data.partner2_name}</Link>
              <p className="text-xs text-slate-500">
                {format(parseISO(it.data.event_date), 'MMM d')}{it.data.end_date !== it.data.event_date ? ` – ${format(parseISO(it.data.end_date), 'MMM d')}` : ''}
                {it.data.package_name ? ` · ${it.data.package_name}` : ''}{it.data.guest_count ? ` · ${it.data.guest_count} guests` : ''}
              </p>
            </>
          )}
          {it.type === 'hold' && (
            <>
              <p className="text-xs font-semibold text-violet-700">HELD — {it.data.kind === 'hold' ? `expires ${new Date(it.data.expires_at).toLocaleString()}` : it.data.kind === 'contract' ? 'contract out for signature' : 'proposal sent'}</p>
              <Link to={`/clients/${it.data.couple_id}`} className="font-medium text-violet-700 hover:underline">{it.data.partner1_name} & {it.data.partner2_name}</Link>
              <p className="text-xs text-slate-500">{it.data.title}</p>
            </>
          )}
          {it.type === 'tour' && (
            <>
              <p className="text-xs font-semibold text-amber-700">SITE TOUR · {format(parseISO(it.data.scheduled_at), 'h:mm a')}</p>
              {it.data.couple_id
                ? <Link to={`/clients/${it.data.couple_id}`} className="font-medium text-amber-700 hover:underline">{it.data.name}</Link>
                : <p className="font-medium">{it.data.name}</p>}
            </>
          )}
          {it.type === 'block' && (
            <>
              <p className="text-xs font-semibold text-slate-600 flex items-center gap-1"><LockClosedIcon className="w-3.5 h-3.5" /> BLOCKED</p>
              {it.data.reason && <p className="text-slate-600">{it.data.reason}</p>}
              <button onClick={() => unblock(it.data.id)} className="text-xs text-rose-600 hover:underline">Unblock this date</button>
            </>
          )}
        </div>
      ))}

      {selected && (
        blockForm ? (
          <form onSubmit={blockDates} className="space-y-2 border-t border-slate-100 pt-3">
            <p className="text-xs font-semibold text-slate-600">Block dates</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-slate-500">From<input type="date" required value={blockForm.from} onChange={e => setBlockForm(f => ({ ...f, from: e.target.value, to: f.to < e.target.value ? e.target.value : f.to }))} className="input-field text-sm mt-1" /></label>
              <label className="text-xs text-slate-500">To<input type="date" required min={blockForm.from} value={blockForm.to} onChange={e => setBlockForm(f => ({ ...f, to: e.target.value }))} className="input-field text-sm mt-1" /></label>
            </div>
            <input type="text" value={blockForm.reason} onChange={e => setBlockForm(f => ({ ...f, reason: e.target.value }))} placeholder="Reason (optional)" aria-label="Reason" className="input-field text-sm" />
            <div className="flex gap-2">
              <button type="submit" className="btn-primary text-xs flex-1">Block</button>
              <button type="button" onClick={() => setBlockForm(null)} className="btn-secondary text-xs">Cancel</button>
            </div>
          </form>
        ) : (
          <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
            <button onClick={() => setBlockForm({ from: selected, to: selected, reason: '' })} className="btn-secondary text-xs">
              <LockClosedIcon className="w-3.5 h-3.5" /> Block dates
            </button>
            <button onClick={() => navigate(`/tours?new=${selected}`)} className="btn-secondary text-xs">
              <PlusIcon className="w-3.5 h-3.5" /> Add a tour
            </button>
          </div>
        )
      )}
    </div>
  )

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-6xl">
      <div>
        <h1 className="page-title">Venue Calendar</h1>
        <p className="page-subtitle">{booked.length} bookings · {holds.length} held · {tours.length} tours · {blocked.length} blocked dates</p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        {[
          { color: 'bg-rose-500', label: 'Booked' },
          { color: 'bg-violet-200 border border-dashed border-violet-400', label: 'Held (proposal or contract out)' },
          { color: 'bg-amber-500', label: 'Site tour' },
          { color: 'bg-slate-400', label: 'Blocked' },
          { color: 'bg-emerald-500', label: 'Today' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={`w-3 h-3 rounded-full ${color}`} />
            <span className="text-slate-500">{label}</span>
          </div>
        ))}
      </div>

      {loadError && <div className="card p-4 text-sm text-red-600">{loadError}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 card overflow-hidden">
          {/* Month nav */}
          <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3 border-b border-slate-100">
            <button onClick={() => setCurrent(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))} aria-label="Previous month" className="btn-ghost p-2">
              <ChevronLeftIcon className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-3">
              <h2 className="font-semibold text-slate-800 text-base">{format(current, 'MMMM yyyy')}</h2>
              {!isSameMonth(current, new Date()) && (
                <button onClick={() => { setCurrent(new Date()); setSelected(today) }} className="text-xs text-rose-600 hover:underline">Today</button>
              )}
            </div>
            <button onClick={() => setCurrent(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))} aria-label="Next month" className="btn-ghost p-2">
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-7 w-7 border-2 border-rose-200 border-t-rose-600" /></div>
          ) : (
            <>
              {/* Month grid (tablet and up) */}
              <div className="hidden sm:block">
                <div className="grid grid-cols-7 border-b border-slate-100">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                    <div key={d} className="text-center text-xs font-semibold text-slate-400 py-2">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {days.map(d => {
                    const day = key(d)
                    const items = itemsFor(day)
                    const hasBooking = items.some(i => i.type === 'booking')
                    return (
                      <button
                        key={day}
                        onClick={() => { setSelected(day); setBlockForm(null) }}
                        aria-label={`${format(d, 'MMMM d')}${items.length ? `, ${items.length} item${items.length > 1 ? 's' : ''}` : ''}`}
                        className={`relative min-h-[88px] p-1.5 text-left align-top border-r border-b border-slate-100 transition-colors
                          ${hasBooking ? 'bg-rose-50/60' : items.some(i => i.type === 'block') ? 'bg-slate-50' : ''} hover:bg-slate-50
                          ${!isSameMonth(d, current) ? 'opacity-30' : ''} ${selected === day ? 'ring-2 ring-inset ring-rose-400' : ''}`}
                      >
                        <span className={`text-xs font-semibold inline-flex ${isToday(d) ? 'w-6 h-6 bg-emerald-500 text-white rounded-full items-center justify-center' : 'text-slate-500'}`}>
                          {format(d, 'd')}
                        </span>
                        <div className="mt-1 space-y-0.5">
                          {items.slice(0, 3).map(it => {
                            const c = chip(it)
                            return <div key={it.id} className={`text-[10px] rounded px-1 py-0.5 leading-tight truncate ${c.cls}`} title={c.text}>{c.text}</div>
                          })}
                          {items.length > 3 && <div className="text-[10px] text-slate-400">+{items.length - 3} more</div>}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Agenda list (phones) */}
              <ul className="sm:hidden divide-y divide-slate-100">
                {monthDays.filter(day => itemsFor(day).length).length === 0 && (
                  <li className="px-4 py-6 text-sm text-slate-400 text-center">Nothing booked, held or blocked this month.</li>
                )}
                {monthDays.filter(day => itemsFor(day).length).map(day => (
                  <li key={day}>
                    <button onClick={() => { setSelected(day); setBlockForm(null) }} className="w-full text-left px-4 py-3 flex gap-3">
                      <div className={`w-11 flex-shrink-0 text-center rounded-lg py-1 ${day === today ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
                        <div className="text-[10px] uppercase">{format(parseISO(day), 'EEE')}</div>
                        <div className="text-base font-bold leading-none">{format(parseISO(day), 'd')}</div>
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        {itemsFor(day).map(it => {
                          const c = chip(it)
                          return <div key={it.id} className={`text-xs rounded px-1.5 py-0.5 truncate ${c.cls}`}>{c.text}</div>
                        })}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* Day detail + upcoming */}
        <div className="space-y-4">
          {selected ? detail : (
            <div className="card p-5 text-center">
              <CalendarDaysIcon className="w-10 h-10 text-slate-200 mx-auto mb-2" />
              <p className="text-sm text-slate-400">Pick a date to see everything on it, block dates, or add a tour</p>
            </div>
          )}

          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700">Upcoming bookings</h3>
            </div>
            <div className="divide-y divide-slate-50 max-h-72 overflow-y-auto">
              {upcoming.map(b => (
                <Link key={b.id} to={`/clients/${b.couple_id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                  <div className="w-10 h-10 bg-rose-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <span className="text-rose-700 text-xs font-bold">{format(parseISO(b.event_date), 'MMM').toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{b.partner1_name} & {b.partner2_name}</div>
                    <div className="text-xs text-slate-400">{format(parseISO(b.event_date), 'MMMM d, yyyy')}{b.event_date <= today ? ' · on site now' : ''}</div>
                  </div>
                </Link>
              ))}
              {upcoming.length === 0 && <p className="text-xs text-slate-400 px-4 py-4">No upcoming bookings</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
