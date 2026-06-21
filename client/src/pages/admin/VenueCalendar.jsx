import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
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
         startOfWeek, endOfWeek, isSameMonth, isToday, isSameDay } from 'date-fns'

export default function VenueCalendar() {
  const { getAdminAxios } = useAuth()
  const [current, setCurrent] = useState(new Date())
  const [booked, setBooked] = useState([])
  const [blocked, setBlocked] = useState([])
  const [tours, setTours] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [blockReason, setBlockReason] = useState('')
  const [showBlockInput, setShowBlockInput] = useState(false)

  const fetchData = async () => {
    const r = await getAdminAxios().get('/api/calendar')
    setBooked(r.data.booked)
    setBlocked(r.data.blocked)
    setTours(r.data.tours || [])
  }

  useEffect(() => { fetchData().finally(() => setLoading(false)) }, [])

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(current), { weekStartsOn: 0 }),
    end:   endOfWeek(endOfMonth(current),   { weekStartsOn: 0 }),
  })

  // A booking covers its full stay: check-in (event_date) through checkout (end_date).
  const getBookingForDay = (day) =>
    booked.find(b => {
      const start = parseISO(b.event_date).getTime()
      const end = (b.end_date ? parseISO(b.end_date) : parseISO(b.event_date)).getTime()
      const t = day.getTime()
      return t >= start && t <= end
    })

  const isBookingStart = (booking, day) =>
    booking && isSameDay(parseISO(booking.event_date), day)

  const getBlockForDay = (day) =>
    blocked.find(b => isSameDay(parseISO(b.date), day))

  const getTourForDay = (day) =>
    tours.find(t => t.scheduled_at && isSameDay(parseISO(t.scheduled_at), day))

  const handleDayClick = (day) => {
    const booking = getBookingForDay(day)
    const block   = getBlockForDay(day)
    const tour    = getTourForDay(day)
    setSelected({ day, booking, block, tour })
    setShowBlockInput(false)
    setBlockReason(block?.reason || '')
  }

  const handleBlock = async () => {
    const dateStr = format(selected.day, 'yyyy-MM-dd')
    try {
      await getAdminAxios().post('/api/calendar/block', { date: dateStr, reason: blockReason || null })
      toast.success('Date blocked')
      setShowBlockInput(false)
      setBlockReason('')
      fetchData()
      setSelected(p => ({ ...p, block: { date: dateStr, reason: blockReason } }))
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to block date')
    }
  }

  const handleUnblock = async (blockId) => {
    try {
      await getAdminAxios().delete(`/api/calendar/block/${blockId}`)
      toast.success('Date unblocked')
      fetchData()
      setSelected(p => ({ ...p, block: null }))
    } catch {
      toast.error('Failed to unblock')
    }
  }

  const monthStr = format(current, 'MMMM yyyy')

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Venue Calendar</h1>
          <p className="page-subtitle">{booked.length} bookings · {tours.length} tours · {blocked.length} blocked dates</p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs">
        {[
          { color: 'bg-rose-500', label: 'Booked' },
          { color: 'bg-amber-500', label: 'Site Tour' },
          { color: 'bg-slate-400', label: 'Blocked / Unavailable' },
          { color: 'bg-emerald-400', label: 'Today' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={`w-3 h-3 rounded-full ${color}`} />
            <span className="text-slate-500">{label}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Calendar */}
        <div className="lg:col-span-2 card overflow-hidden">
          {/* Month nav */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <button onClick={() => setCurrent(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))} className="btn-ghost p-2">
              <ChevronLeftIcon className="w-4 h-4" />
            </button>
            <h2 className="font-semibold text-slate-800 text-base">{monthStr}</h2>
            <button onClick={() => setCurrent(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))} className="btn-ghost p-2">
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 border-b border-slate-100">
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
              <div key={d} className="text-center text-xs font-semibold text-slate-400 py-2">{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          {loading ? (
            <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-7 w-7 border-2 border-rose-200 border-t-rose-600" /></div>
          ) : (
            <div className="grid grid-cols-7">
              {days.map((day, i) => {
                const booking  = getBookingForDay(day)
                const tour     = getTourForDay(day)
                const block    = getBlockForDay(day)
                const inMonth  = isSameMonth(day, current)
                const today    = isToday(day)
                const isSelected = selected && isSameDay(day, selected.day)
                const bookingStart = isBookingStart(booking, day)

                let bg = ''
                if (booking) bg = 'bg-rose-50 hover:bg-rose-100'
                else if (block) bg = 'bg-slate-100 hover:bg-slate-200'
                else if (tour) bg = 'bg-amber-50 hover:bg-amber-100'
                else if (today) bg = 'bg-emerald-50 hover:bg-emerald-100'
                else bg = 'hover:bg-slate-50'

                return (
                  <button
                    key={i}
                    onClick={() => handleDayClick(day)}
                    className={`relative min-h-[72px] p-2 text-left border-r border-b border-slate-100 transition-colors ${bg} ${!inMonth ? 'opacity-30' : ''} ${isSelected ? 'ring-2 ring-inset ring-rose-400' : ''}`}
                  >
                    <span className={`text-xs font-semibold ${today ? 'w-6 h-6 bg-emerald-500 text-white rounded-full flex items-center justify-center' : 'text-slate-500'}`}>
                      {format(day, 'd')}
                    </span>
                    {booking && bookingStart && (
                      <div className="mt-1">
                        <div className="text-[10px] bg-rose-500 text-white rounded px-1 py-0.5 leading-tight truncate">
                          {booking.partner1_name.split(' ')[0]} & {booking.partner2_name.split(' ')[0]}
                        </div>
                        {booking.end_date && booking.end_date !== booking.event_date && (
                          <div className="text-[9px] text-rose-500 mt-0.5 leading-none">multi-day →</div>
                        )}
                      </div>
                    )}
                    {booking && !bookingStart && (
                      <div className="mt-1 h-1.5 bg-rose-300 rounded-full" title={`${booking.partner1_name} & ${booking.partner2_name}`} />
                    )}
                    {tour && !booking && (
                      <div className="mt-1">
                        <div className="text-[10px] bg-amber-500 text-white rounded px-1 py-0.5 leading-tight truncate">
                          Tour: {tour.name.split(' ')[0]}
                        </div>
                      </div>
                    )}
                    {block && !booking && !tour && (
                      <div className="mt-1">
                        <div className="text-[10px] bg-slate-500 text-white rounded px-1 py-0.5 leading-tight truncate flex items-center gap-0.5">
                          <LockClosedIcon className="w-2.5 h-2.5 flex-shrink-0" />
                          {block.reason || 'Blocked'}
                        </div>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Day detail panel */}
        <div className="space-y-4">
          {selected ? (
            <div className="card p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-slate-800">{format(selected.day, 'EEEE')}</h3>
                  <p className="text-sm text-slate-500">{format(selected.day, 'MMMM d, yyyy')}</p>
                </div>
                <button onClick={() => setSelected(null)} className="btn-ghost p-1">
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>

              {selected.booking ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-rose-700 bg-rose-50 px-3 py-1.5 rounded-lg">
                    <CalendarDaysIcon className="w-4 h-4" />
                    BOOKED
                  </div>
                  <div className="space-y-2 text-sm">
                    <div>
                      <div className="text-xs text-slate-400">Couple</div>
                      <Link to={`/clients/${selected.booking.couple_id}`} className="font-medium text-rose-600 hover:text-rose-700">
                        {selected.booking.partner1_name} & {selected.booking.partner2_name}
                      </Link>
                    </div>
                    {selected.booking.end_date && selected.booking.end_date !== selected.booking.event_date && (
                      <div><span className="text-xs text-slate-400">Stay</span><div className="font-medium">{format(parseISO(selected.booking.event_date), 'MMM d')} – {format(parseISO(selected.booking.end_date), 'MMM d, yyyy')}</div></div>
                    )}
                    {selected.booking.package_name && (
                      <div><span className="text-xs text-slate-400">Package</span><div className="font-medium">{selected.booking.package_name}</div></div>
                    )}
                    {selected.booking.guest_count && (
                      <div><span className="text-xs text-slate-400">Guests</span><div className="font-medium">{selected.booking.guest_count}</div></div>
                    )}
                    {(selected.booking.start_time || selected.booking.end_time) && (
                      <div><span className="text-xs text-slate-400">Hours</span><div className="font-medium">{selected.booking.start_time} – {selected.booking.end_time}</div></div>
                    )}
                  </div>
                </div>
              ) : selected.tour ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg">
                    <CalendarDaysIcon className="w-4 h-4" />
                    SITE TOUR
                  </div>
                  <div className="space-y-2 text-sm">
                    <div>
                      <div className="text-xs text-slate-400">Visitor</div>
                      {selected.tour.couple_id ? (
                        <Link to={`/clients/${selected.tour.couple_id}`} className="font-medium text-amber-700 hover:text-amber-800">{selected.tour.name}</Link>
                      ) : (
                        <div className="font-medium">{selected.tour.name}</div>
                      )}
                    </div>
                    <Link to="/tours" className="text-xs text-amber-600 hover:text-amber-700 font-medium">Manage tours →</Link>
                  </div>
                </div>
              ) : selected.block ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg">
                    <LockClosedIcon className="w-4 h-4" />
                    BLOCKED
                  </div>
                  {selected.block.reason && (
                    <p className="text-sm text-slate-600">{selected.block.reason}</p>
                  )}
                  <button
                    onClick={() => handleUnblock(selected.block.id)}
                    className="btn-secondary text-xs w-full"
                  >
                    <XMarkIcon className="w-3.5 h-3.5" />
                    Unblock This Date
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-xs text-emerald-700 bg-emerald-50 font-semibold px-3 py-1.5 rounded-lg">
                    AVAILABLE
                  </div>
                  {showBlockInput ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={blockReason}
                        onChange={e => setBlockReason(e.target.value)}
                        placeholder="Reason (optional)"
                        className="input-field text-sm"
                      />
                      <div className="flex gap-2">
                        <button onClick={handleBlock} className="btn-primary text-xs flex-1">Block Date</button>
                        <button onClick={() => setShowBlockInput(false)} className="btn-secondary text-xs">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setShowBlockInput(true)} className="btn-secondary text-xs w-full">
                      <LockClosedIcon className="w-3.5 h-3.5" />
                      Block This Date
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="card p-5 text-center">
              <CalendarDaysIcon className="w-10 h-10 text-slate-200 mx-auto mb-2" />
              <p className="text-sm text-slate-400">Click any date to see details or block it</p>
            </div>
          )}

          {/* Upcoming bookings list */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700">Upcoming Bookings</h3>
            </div>
            <div className="divide-y divide-slate-50 max-h-72 overflow-y-auto">
              {booked.filter(b => new Date(b.event_date) >= new Date()).slice(0, 10).map(b => (
                <Link key={b.couple_id} to={`/clients/${b.couple_id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                  <div className="w-10 h-10 bg-rose-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <span className="text-rose-700 text-xs font-bold">{format(parseISO(b.event_date), 'MMM').toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{b.partner1_name} & {b.partner2_name}</div>
                    <div className="text-xs text-slate-400">{format(parseISO(b.event_date), 'MMMM d, yyyy')}</div>
                  </div>
                </Link>
              ))}
              {booked.filter(b => new Date(b.event_date) >= new Date()).length === 0 && (
                <p className="text-xs text-slate-400 px-4 py-4">No upcoming bookings</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
