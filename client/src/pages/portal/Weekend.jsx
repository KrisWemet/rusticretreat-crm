import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDaysIcon, UserGroupIcon, HomeModernIcon, MapPinIcon, LockClosedIcon, ChevronRightIcon, PrinterIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../../contexts/AuthContext'
import PlanNotes from '../../components/PlanNotes'
import { dayLabel, daysBetween } from '../../utils/files'

// "Our weekend": the whole stay on one page. Dates and package, guest numbers,
// each day at a glance, vendors and when they arrive, extras ordered, and the
// couple's own plans and notes (which Rustic Retreat reads and can add to).

const clock = (t) => {
  const s = String(t || '')
  if (/[ap]\.?m/i.test(s)) return s
  const m = s.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return s
  const h = Number(m[1])
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`
}
const fullDate = (d) => (d ? dayLabel(d, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '')

function Tile({ icon: Icon, label, value, sub }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-rose-500"><Icon className="w-4 h-4" />{label}</div>
      <div className="mt-1.5 text-base font-semibold text-slate-900">{value || <span className="text-slate-400 font-normal">To be confirmed</span>}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  )
}

export default function Weekend() {
  const { getCoupleAxios } = useAuth()
  const api = getCoupleAxios()
  const [w, setW] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => { api.get('/api/portal/weekend').then(r => setW(r.data)).catch(() => setFailed(true)) }, [api])

  const days = useMemo(() => {
    if (!w) return []
    const keys = [...new Set([...daysBetween(w.stay?.check_in, w.stay?.check_out), ...w.schedule.map(s => s.day_date || '')])]
      .sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
    return keys.map(day => ({ day, items: w.schedule.filter(s => (s.day_date || '') === day) }))
  }, [w])

  if (failed) return <div className="p-6"><p className="text-slate-500">We couldn't load your weekend just now. Please try again in a moment.</p></div>
  if (!w) return <div className="p-6"><p className="text-slate-400">Loading…</p></div>

  const g = w.guests || {}
  const guestValue = g.guests != null ? `${g.guests} guest${g.guests === 1 ? '' : 's'}` : null
  const guestSub = g.final
    ? [g.campers != null && `${g.campers} camping`, g.tents != null && `${g.tents} tents`, g.rvs != null && `${g.rvs} RVs`].filter(Boolean).join(' · ') || 'From your Final Details Form'
    : guestValue ? 'Estimate from your booking. Final numbers come from your Final Details Form.' : null
  const nights = w.stay?.nights

  return (
    <div className="p-6 space-y-6 max-w-5xl weekend-page">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Our weekend</h1>
          <p className="page-subtitle">{w.couple}{w.stay?.check_in ? ` · ${fullDate(w.stay.check_in)}${w.stay.check_out && w.stay.check_out !== w.stay.check_in ? ` to ${fullDate(w.stay.check_out)}` : ''}` : ''}</p>
        </div>
        <button type="button" className="btn-secondary print:hidden" onClick={() => window.print()}><PrinterIcon className="w-4 h-4" /> Print</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Tile icon={CalendarDaysIcon} label="Check-in" value={w.stay?.check_in ? dayLabel(w.stay.check_in, { weekday: 'long', month: 'short', day: 'numeric' }) : null} />
        <Tile icon={CalendarDaysIcon} label="Check-out" value={w.stay?.check_out ? dayLabel(w.stay.check_out, { weekday: 'long', month: 'short', day: 'numeric' }) : null} sub={nights ? `${nights} night${nights === 1 ? '' : 's'}` : null} />
        <Tile icon={UserGroupIcon} label={g.final ? 'Guests (final)' : 'Guests'} value={guestValue} sub={guestSub} />
        <Tile icon={HomeModernIcon} label="Package" value={w.stay?.package_name} />
      </div>

      {(w.ceremony_location || w.reception_location) && (
        <div className="card p-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
          {w.ceremony_location && <span className="inline-flex items-center gap-1.5 text-slate-700"><MapPinIcon className="w-4 h-4 text-rose-500" /><span className="text-slate-500">Ceremony:</span> {w.ceremony_location}</span>}
          {w.reception_location && <span className="inline-flex items-center gap-1.5 text-slate-700"><MapPinIcon className="w-4 h-4 text-rose-500" /><span className="text-slate-500">Reception:</span> {w.reception_location}</span>}
        </div>
      )}

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-slate-900">Each day at a glance</h2>
          <Link to="/portal/timeline" className="text-sm font-medium text-rose-600 hover:underline inline-flex items-center gap-0.5 print:hidden">Edit our schedule <ChevronRightIcon className="w-4 h-4" /></Link>
        </div>
        {days.length === 0 ? (
          <div className="card p-6 text-sm text-slate-500">Nothing on your schedule yet. <Link to="/portal/timeline" className="text-rose-600 hover:underline">Start your day-of timeline</Link>.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {days.map(d => (
              <div key={d.day || 'none'} className="card p-4">
                <h3 className="font-semibold text-slate-800 mb-2">{d.day ? dayLabel(d.day) : 'Day not set yet'}</h3>
                {d.items.length === 0 ? <p className="text-sm text-slate-400">Nothing planned yet.</p> : (
                  <ol className="space-y-1.5">
                    {d.items.map(it => (
                      <li key={it.id} className="flex gap-3 text-sm">
                        <span className="w-16 flex-shrink-0 font-semibold text-rose-600">{clock(it.time)}</span>
                        <span className="min-w-0 text-slate-700">{it.title}{!!it.locked && <LockClosedIcon className="inline w-3.5 h-3.5 ml-1 -mt-0.5 text-slate-400" aria-label="Set by Rustic Retreat" />}{it.location && <span className="text-slate-400"> · {it.location}</span>}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-semibold text-slate-900">Our plans and notes</h2>
        <p className="text-sm text-slate-500 mt-0.5 mb-3">The details in your heads, written down: where the first look happens, who gives the toasts, a grandparent who needs a chair near the front, the song for the sparkler exit. Rustic Retreat reads these, may add to them, and prints them on the event sheet for your weekend.</p>
        <PlanNotes api={api} url="/api/portal/notes" audience="couple" rows={12}
          placeholder={'e.g.\nFriday: rehearsal at 6 PM by the gazebo, pizza after.\nSaturday: first look by the creek at 2:30. Grandma Rose needs a chair in the front row.\nSparkler exit at 11:45 PM.'} />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-slate-900">Vendors</h2>
            <Link to="/portal/vendors" className="text-sm font-medium text-rose-600 hover:underline print:hidden">Manage</Link>
          </div>
          {w.vendors.length === 0 ? <p className="text-sm text-slate-500">No vendors added yet. <Link to="/portal/vendors" className="text-rose-600 hover:underline">Add your photographer, caterer, DJ…</Link></p> : (
            <ul className="divide-y divide-slate-100">
              {w.vendors.map((v, i) => (
                <li key={i} className="py-2 flex items-start justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-800">{v.business_name}</div>
                    <div className="text-xs text-slate-500">{v.vendor_type}{v.contact_name ? ` · ${v.contact_name}` : ''}{v.phone ? ` · ${v.phone}` : ''}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {v.arrival_time && <div className="text-xs text-slate-600">Arrives {v.arrival_time}</div>}
                    <div className={`text-[11px] font-medium ${v.booked ? 'text-emerald-600' : 'text-amber-600'}`}>{v.booked ? 'Booked' : 'Not booked yet'}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-slate-900">Extras ordered</h2>
            <Link to="/portal/payments" className="text-sm font-medium text-rose-600 hover:underline print:hidden">Payments</Link>
          </div>
          {w.extras_ordered.length === 0 ? <p className="text-sm text-slate-500">No extras ordered yet. You can choose firewood, propane and more on your Final Details Form.</p> : (
            <ul className="divide-y divide-slate-100">
              {w.extras_ordered.map(x => (
                <li key={x.label} className="py-2 flex justify-between gap-3 text-sm">
                  <span className="text-slate-800">{x.label}</span>
                  <span className="text-slate-500">× {Number(x.quantity)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
