import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import toast from 'react-hot-toast'
import { PlusIcon, PencilIcon, TrashIcon, PrinterIcon, ClockIcon, MapPinIcon, UserIcon, DocumentDuplicateIcon, BookmarkIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../../contexts/AuthContext'
import Modal from '../ui/Modal'
import Input, { Select, Textarea } from '../ui/Input'
import { CEREMONY_SPACES, RECEPTION_SPACES } from '../../utils/options'
import { dayLabel, daysBetween, printHtml, esc } from '../../utils/files'

// The wedding weekend hour by hour: every item on its own day, with where it
// happens and who is responsible. Printable whole, or one vendor's part only.

const SPACES = [...new Set([...CEREMONY_SPACES, ...RECEPTION_SPACES, 'Newlywed Cabin', 'Fire Pit', 'Décor Shed', 'Parking', 'Camping Area'])]
const CATEGORY_STYLE = {
  Setup: 'bg-slate-100 text-slate-700', Arrivals: 'bg-sky-100 text-sky-700', Ceremony: 'bg-rose-100 text-rose-700',
  Photos: 'bg-violet-100 text-violet-700', Reception: 'bg-amber-100 text-amber-800', 'Food & drink': 'bg-orange-100 text-orange-700',
  Vendor: 'bg-teal-100 text-teal-700', Venue: 'bg-emerald-100 text-emerald-700', Teardown: 'bg-slate-100 text-slate-700', Other: 'bg-slate-100 text-slate-600',
}

// "3:30 PM" -> "15:30" for the time input.
function to24(t) {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (!m) return ''
  let h = Number(m[1]) % 12
  if (m[3].toUpperCase() === 'PM') h += 12
  return `${String(h).padStart(2, '0')}:${m[2]}`
}

const blank = (day) => ({ day_date: day || '', time: '', duration_minutes: '30', title: '', category: '', location: '', assigned_to: '', description: '' })

export default function RunOfShow({ coupleId, couple }) {
  const { getAdminAxios } = useAuth()
  const api = useRef(getAdminAxios()).current
  const [items, setItems] = useState(null)
  const [stay, setStay] = useState({ start: couple?.wedding_date || null, end: null })
  const [categories, setCategories] = useState([])
  const [templates, setTemplates] = useState([])
  const [people, setPeople] = useState([])
  const [editing, setEditing] = useState(null) // null | 'new' | item
  const [form, setForm] = useState(blank())
  const [showTemplate, setShowTemplate] = useState(false)
  const [tplForm, setTplForm] = useState({ template_id: '', start_date: '', replace: false })
  const [filter, setFilter] = useState('')
  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  const load = useCallback(async () => {
    const [it, tp] = await Promise.all([api.get(`/api/timeline/couple/${coupleId}`), api.get('/api/timeline/templates')])
    setItems(it.data); setTemplates(tp.data)
  }, [api, coupleId])

  useEffect(() => {
    load().catch(() => toast.error('Could not load the run of show'))
    api.get('/api/timeline/categories').then(r => setCategories(r.data)).catch(() => {})
    api.get(`/api/bookings/couple/${coupleId}`).then(r => {
      const b = [...r.data].sort((a, z) => (z.event_date || '').localeCompare(a.event_date || ''))[0]
      if (b?.event_date) setStay({ start: b.event_date, end: b.end_date || null })
    }).catch(() => {})
    Promise.all([api.get(`/api/vendors/couple/${coupleId}`), api.get('/api/auth/staff')]).then(([v, s]) => {
      setPeople([...new Set(['Venue', 'Couple', ...v.data.map(x => x.business_name), ...s.data.map(x => x.name)])])
    }).catch(() => {})
  }, [api, coupleId, load])

  const stayDays = useMemo(() => daysBetween(stay.start, stay.end), [stay])
  const groups = useMemo(() => {
    const out = []
    for (const it of items || []) {
      if (filter && it.assigned_to !== filter) continue
      const key = it.day_date || ''
      let g = out.find(x => x.day === key)
      if (!g) out.push(g = { day: key, items: [] })
      g.items.push(it)
    }
    return out
  }, [items, filter])
  const assignees = useMemo(() => [...new Set((items || []).map(i => i.assigned_to).filter(Boolean))].sort(), [items])

  const openNew = (day) => { setForm(blank(day || stayDays[0] || '')); setEditing('new') }
  const openEdit = (it) => {
    setForm({ day_date: it.day_date || '', time: to24(it.time), duration_minutes: String(it.duration_minutes ?? ''), title: it.title,
      category: it.category || '', location: it.location || '', assigned_to: it.assigned_to || '', description: it.description || '' })
    setEditing(it)
  }

  const save = async (e) => {
    e.preventDefault()
    const body = { ...form, day_date: form.day_date || null }
    try {
      if (editing === 'new') await api.post(`/api/timeline/couple/${coupleId}`, body)
      else await api.put(`/api/timeline/${editing.id}`, body)
      toast.success(editing === 'new' ? 'Added to the run of show' : 'Updated')
      setEditing(null); load()
    } catch (err) { toast.error(err.response?.data?.error || 'Could not save') }
  }

  const remove = async (it) => {
    if (!confirm(`Remove "${it.title}" from the run of show?`)) return
    try { await api.delete(`/api/timeline/${it.id}`); load() } catch (err) { toast.error(err.response?.data?.error || 'Could not remove') }
  }

  const saveAsTemplate = async () => {
    const name = prompt('Name this schedule so you can reuse it for other weddings (e.g. "3-Day Weekend standard"):')
    if (!name?.trim()) return
    try { await api.post('/api/timeline/templates', { name: name.trim(), couple_id: Number(coupleId) }); toast.success('Saved as a template'); load() }
    catch (err) { toast.error(err.response?.data?.error || 'Could not save the template') }
  }

  const applyTemplate = async (e) => {
    e.preventDefault()
    try {
      await api.post(`/api/timeline/couple/${coupleId}/apply-template`, { ...tplForm, start_date: tplForm.start_date || null })
      toast.success('Schedule added'); setShowTemplate(false); load()
    } catch (err) { toast.error(err.response?.data?.error || 'Could not apply the template') }
  }

  const deleteTemplate = async (t) => {
    if (!confirm(`Delete the template "${t.name}"? Weddings already using it keep their schedule.`)) return
    try { await api.delete(`/api/timeline/templates/${t.id}`); load() } catch { toast.error('Could not delete the template') }
  }

  const print = () => {
    const names = `${couple?.partner1_name || ''} & ${couple?.partner2_name || ''}`
    const body = `<h1>Run of show: ${esc(names)}</h1><p class="muted">${filter ? `For ${esc(filter)} · ` : ''}Printed ${esc(new Date().toLocaleString('en-CA'))}</p>`
      + groups.map(g => `<h2>${g.day ? esc(dayLabel(g.day)) : 'Day not set'}</h2><table><thead><tr><th>Time</th><th>What</th><th>Where</th><th>Who</th></tr></thead><tbody>${g.items.map(it =>
        `<tr><td class="t">${esc(it.time)}</td><td><strong>${esc(it.title)}</strong>${it.description ? `<div class="muted">${esc(it.description)}</div>` : ''}</td><td>${esc(it.location || '')}</td><td>${esc(it.assigned_to || '')}</td></tr>`).join('')}</tbody></table>`).join('')
    try { printHtml(`Run of show — ${names}`, body) } catch (err) { toast.error(err.message) }
  }

  if (!items) return <div className="card p-6 text-sm text-slate-400">Loading the run of show…</div>

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primary" onClick={() => openNew()}><PlusIcon className="w-4 h-4" /> Add item</button>
        <button className="btn-secondary" onClick={() => { setTplForm({ template_id: templates[0]?.id || '', start_date: stay.start || '', replace: false }); setShowTemplate(true) }}>
          <DocumentDuplicateIcon className="w-4 h-4" /> Start from a template
        </button>
        {items.length > 0 && <button className="btn-secondary" onClick={saveAsTemplate}><BookmarkIcon className="w-4 h-4" /> Save as template</button>}
        <div className="flex-1" />
        {assignees.length > 0 && (
          <Select aria-label="Show items for" value={filter} onChange={e => setFilter(e.target.value)} className="w-auto">
            <option value="">Everyone</option>
            {assignees.map(a => <option key={a} value={a}>{a}</option>)}
          </Select>
        )}
        {items.length > 0 && <button className="btn-secondary" onClick={print}><PrinterIcon className="w-4 h-4" /> Print{filter ? ` for ${filter}` : ''}</button>}
      </div>

      {items.length === 0 ? (
        <div className="card py-14 text-center">
          <ClockIcon className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No run of show yet</p>
          <p className="text-sm text-slate-400 mt-1 max-w-md mx-auto">Add the weekend hour by hour: check-in, vendor arrivals, the ceremony, dinner, quiet hours, check-out. Or start from a saved schedule.</p>
        </div>
      ) : groups.map(g => (
        <div key={g.day || 'none'} className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-100">
            <h3 className="font-semibold text-slate-800">{g.day ? dayLabel(g.day) : 'Day not set'}</h3>
            <button className="text-xs font-medium text-rose-600 hover:underline" onClick={() => openNew(g.day)}>+ Add to this day</button>
          </div>
          <ul className="divide-y divide-slate-100">
            {g.items.map(it => (
              <li key={it.id} className="flex gap-4 px-5 py-3">
                <div className="w-20 flex-shrink-0 text-sm font-semibold text-rose-600 pt-0.5">{it.time}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-900">{it.title}</span>
                    {it.category && <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${CATEGORY_STYLE[it.category] || CATEGORY_STYLE.Other}`}>{it.category}</span>}
                  </div>
                  {it.description && <p className="text-sm text-slate-500 mt-0.5 whitespace-pre-wrap">{it.description}</p>}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-slate-500">
                    {it.location && <span className="inline-flex items-center gap-1"><MapPinIcon className="w-3.5 h-3.5" />{it.location}</span>}
                    {it.assigned_to && <span className="inline-flex items-center gap-1"><UserIcon className="w-3.5 h-3.5" />{it.assigned_to}</span>}
                    {!!it.duration_minutes && <span className="inline-flex items-center gap-1"><ClockIcon className="w-3.5 h-3.5" />{it.duration_minutes} min</span>}
                  </div>
                </div>
                <div className="flex items-start gap-1">
                  <button className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg" onClick={() => openEdit(it)} aria-label={`Edit ${it.title}`}><PencilIcon className="w-4 h-4" /></button>
                  <button className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg" onClick={() => remove(it)} aria-label={`Remove ${it.title}`}><TrashIcon className="w-4 h-4" /></button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <p className="text-xs text-slate-400">Times between midnight and 5 AM are listed at the end of their day, so a 12:30 AM sparkler exit stays with Saturday night.</p>

      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add to the run of show' : 'Edit item'}>
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Select label="Day" value={form.day_date} onChange={f('day_date')}>
              <option value="">No day set</option>
              {[...new Set([...stayDays, ...(form.day_date ? [form.day_date] : [])])].map(d => <option key={d} value={d}>{dayLabel(d, { weekday: 'short', month: 'short', day: 'numeric' })}</option>)}
            </Select>
            <Input label="Time" type="time" value={form.time} onChange={f('time')} required />
            <Input label="Minutes" type="number" min="0" max="1440" value={form.duration_minutes} onChange={f('duration_minutes')} />
          </div>
          {stayDays.length === 0 && <p className="text-xs text-amber-700">No booking dates yet. Items can still be added and given a day later.</p>}
          <Input label="What happens" value={form.title} onChange={f('title')} required placeholder="e.g. Ceremony, DJ arrives, Quiet hours" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select label="Category" value={form.category} onChange={f('category')}>
              <option value="">None</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
            <Input label="Where" list="ros-spaces" value={form.location} onChange={f('location')} placeholder="e.g. Forest Clearing" />
          </div>
          <Input label="Who is responsible" list="ros-people" value={form.assigned_to} onChange={f('assigned_to')} placeholder="A vendor, staff member, Venue or Couple" />
          <Textarea label="Notes" value={form.description} onChange={f('description')} rows={2} />
          <datalist id="ros-spaces">{SPACES.map(s => <option key={s} value={s} />)}</datalist>
          <datalist id="ros-people">{people.map(p => <option key={p} value={p} />)}</datalist>
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
            <button type="submit" className="btn-primary">{editing === 'new' ? 'Add' : 'Save'}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={showTemplate} onClose={() => setShowTemplate(false)} title="Start from a template">
        {templates.length === 0 ? (
          <p className="text-sm text-slate-500">No saved schedules yet. Build one wedding’s run of show, then use <strong>Save as template</strong> to reuse it.</p>
        ) : (
          <form onSubmit={applyTemplate} className="space-y-4">
            <Select label="Template" value={tplForm.template_id} onChange={e => setTplForm(p => ({ ...p, template_id: e.target.value }))} required>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.items.length} items)</option>)}
            </Select>
            <Input label="First day of the wedding" type="date" value={tplForm.start_date} onChange={e => setTplForm(p => ({ ...p, start_date: e.target.value }))} />
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input id="tpl-replace" name="tpl-replace" type="checkbox" checked={tplForm.replace} onChange={e => setTplForm(p => ({ ...p, replace: e.target.checked }))} />
              Replace this couple’s current run of show
            </label>
            <div className="flex flex-wrap justify-between gap-3 pt-2 border-t border-slate-100">
              <div className="flex flex-wrap gap-2">
                {templates.map(t => <button key={t.id} type="button" className="text-xs text-slate-400 hover:text-red-600" onClick={() => deleteTemplate(t)}>Delete “{t.name}”</button>)}
              </div>
              <div className="flex gap-3">
                <button type="button" className="btn-secondary" onClick={() => setShowTemplate(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Add schedule</button>
              </div>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
