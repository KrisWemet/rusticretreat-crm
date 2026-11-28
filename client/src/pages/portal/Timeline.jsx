import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ClockIcon, MapPinIcon, UserIcon, PlusIcon, PencilIcon, TrashIcon, LockClosedIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../../contexts/AuthContext'
import Modal from '../../components/ui/Modal'
import Input, { Select, Textarea } from '../../components/ui/Input'
import { dayLabel, daysBetween } from '../../utils/files'

// The weekend schedule: one plan the couple and Rustic Retreat share. The
// couple adds, moves and removes their own moments; staff see each change at
// once. Items the venue locks (check-in, quiet hours, check-out) are shown with
// a lock and can only be changed by messaging the venue.

// Times are stored written out ("3:30 PM"); an older record may hold "15:30".
const clock = (t) => {
  const s = String(t || '')
  if (/[ap]\.?m/i.test(s)) return s
  const m = s.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return s
  const h = Number(m[1])
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`
}
// "3:30 PM" (or "15:30") -> "15:30" for the time picker.
const to24 = (t) => {
  const s = String(t || '').trim()
  const m = s.match(/^(\d{1,2}):(\d{2})\s*([AP])\.?M\.?$/i)
  if (m) { let h = Number(m[1]) % 12; if (m[3].toUpperCase() === 'P') h += 12; return `${String(h).padStart(2, '0')}:${m[2]}` }
  const n = s.match(/^(\d{1,2}):(\d{2})$/)
  return n ? `${n[1].padStart(2, '0')}:${n[2]}` : ''
}

const blank = (day) => ({ day_date: day || '', time: '', title: '', location: '', assigned_to: '', description: '' })

export default function Timeline() {
  const { getCoupleAxios } = useAuth()
  const api = getCoupleAxios()
  const [data, setData] = useState(null) // { items, stay }
  const [editing, setEditing] = useState(null) // null | 'new' | item
  const [form, setForm] = useState(blank())
  const [saving, setSaving] = useState(false)
  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  const load = useCallback(() => api.get('/api/portal/schedule').then(r => setData(r.data)).catch(() => setData({ items: [], stay: null })), [api])
  useEffect(() => { load() }, [load])

  const stayDays = useMemo(() => daysBetween(data?.stay?.check_in, data?.stay?.check_out), [data])
  // Every day of the stay is shown, even before anything is planned on it, so
  // there is somewhere to add the first item.
  const days = useMemo(() => {
    const keys = [...new Set([...stayDays, ...(data?.items || []).map(i => i.day_date || '')])]
      .sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
    return keys.map(day => ({ day, items: (data?.items || []).filter(i => (i.day_date || '') === day) }))
  }, [data, stayDays])

  const openNew = (day) => { setForm(blank(day ?? stayDays[0] ?? '')); setEditing('new') }
  const openEdit = (it) => {
    setForm({ day_date: it.day_date || '', time: to24(it.time), title: it.title, location: it.location || '', assigned_to: it.assigned_to || '', description: it.description || '' })
    setEditing(it)
  }

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    const body = { ...form, day_date: form.day_date || null }
    try {
      if (editing === 'new') await api.post('/api/timeline/portal', body)
      else await api.put(`/api/timeline/${editing.id}`, body)
      toast.success(editing === 'new' ? 'Added to your schedule' : 'Schedule updated')
      setEditing(null); load()
    } catch (err) { toast.error(err.response?.data?.error || 'Could not save') }
    finally { setSaving(false) }
  }

  const remove = async (it) => {
    if (!confirm(`Remove "${it.title}" from your schedule?`)) return
    try { await api.delete(`/api/timeline/${it.id}`); toast.success('Removed'); load() }
    catch (err) { toast.error(err.response?.data?.error || 'Could not remove') }
  }

  const dayOptions = [...new Set([...stayDays, ...(form.day_date ? [form.day_date] : [])])]

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Your weekend schedule</h1>
          <p className="page-subtitle max-w-xl">Your day-of timeline, hour by hour. Add, move or remove anything: Rustic Retreat sees your changes straight away. Items with a <LockClosedIcon className="inline w-3.5 h-3.5 -mt-0.5" aria-label="lock" /> are set by the venue; <Link to="/portal/messages" className="text-rose-600 hover:underline">message us</Link> if one needs to change.</p>
        </div>
        <button className="btn-primary" onClick={() => openNew()}><PlusIcon className="w-4 h-4" /> Add to the schedule</button>
      </div>

      {data === null ? <p className="text-slate-400">Loading…</p> : days.length === 0 ? (
        <div className="card py-16 text-center">
          <ClockIcon className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">Nothing on your schedule yet</p>
          <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">Start with the big moments: hair and makeup, the ceremony, dinner, the first dance. We add check-in, quiet hours and check-out.</p>
          <button className="btn-primary mt-4" onClick={() => openNew()}><PlusIcon className="w-4 h-4" /> Add the first item</button>
        </div>
      ) : days.map(d => (
        <div key={d.day || 'none'} className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 bg-rose-50/60 border-b border-rose-100">
            <h2 className="font-semibold text-slate-900">{d.day ? dayLabel(d.day) : 'Day not set yet'}</h2>
            <button className="text-xs font-medium text-rose-600 hover:underline" onClick={() => openNew(d.day)}>+ Add to this day</button>
          </div>
          {d.items.length === 0 ? <p className="px-5 py-4 text-sm text-slate-400">Nothing planned yet.</p> : (
            <ol className="divide-y divide-slate-100">
              {d.items.map(it => (
                <li key={it.id} className="flex gap-4 px-5 py-3">
                  <div className="w-20 flex-shrink-0 text-sm font-semibold text-rose-600 pt-0.5">{clock(it.time)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-800">{it.title}</span>
                      {it.locked && <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium"><LockClosedIcon className="w-3 h-3" />Set by Rustic Retreat</span>}
                      {it.by_couple && <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-medium">Added by you</span>}
                    </div>
                    {it.description && <p className="text-sm text-slate-500 mt-0.5 whitespace-pre-wrap">{it.description}</p>}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-slate-500">
                      {it.location && <span className="inline-flex items-center gap-1"><MapPinIcon className="w-3.5 h-3.5" />{it.location}</span>}
                      {it.assigned_to && <span className="inline-flex items-center gap-1"><UserIcon className="w-3.5 h-3.5" />{it.assigned_to}</span>}
                    </div>
                  </div>
                  {!it.locked && (
                    <div className="flex items-start gap-1">
                      <button className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg" onClick={() => openEdit(it)} aria-label={`Edit ${it.title}`}><PencilIcon className="w-4 h-4" /></button>
                      <button className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg" onClick={() => remove(it)} aria-label={`Remove ${it.title}`}><TrashIcon className="w-4 h-4" /></button>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      ))}

      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add to your schedule' : 'Change this item'}>
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {dayOptions.length ? (
              <Select label="Day" value={form.day_date} onChange={f('day_date')}>
                {dayOptions.map(d => <option key={d} value={d}>{dayLabel(d, { weekday: 'long', month: 'short', day: 'numeric' })}</option>)}
                <option value="">Not sure yet</option>
              </Select>
            ) : <Input label="Day" type="date" value={form.day_date} onChange={f('day_date')} />}
            <Input label="Time" type="time" value={form.time} onChange={f('time')} required />
          </div>
          <Input label="What happens" value={form.title} onChange={f('title')} required placeholder="e.g. Hair and makeup, First look, Speeches" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Where (optional)" value={form.location} onChange={f('location')} placeholder="e.g. By the creek" />
            <Input label="Who (optional)" value={form.assigned_to} onChange={f('assigned_to')} placeholder="e.g. Photographer, bridal party" />
          </div>
          <Textarea label="Notes (optional)" value={form.description} onChange={f('description')} rows={3} placeholder="Anything we or your vendors should know" />
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : editing === 'new' ? 'Add' : 'Save'}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
