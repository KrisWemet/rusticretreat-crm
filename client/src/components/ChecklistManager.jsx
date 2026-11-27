import { useEffect, useRef, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import { PlusIcon, TrashIcon, ArrowUpIcon, ArrowDownIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../contexts/AuthContext'
import Modal from './ui/Modal'
import Input, { Select } from './ui/Input'

// Checklist templates: to-dos timed from a date on the couple's record
// (check-in, check-out, the day they booked or enquired). Applying one turns
// it into real tasks; set one to apply by itself on enquiry or on booking.
// Tasks only ever remind staff — nothing here emails a couple.

const AUTO = { none: 'Only when I apply it', on_enquiry: 'Automatically for each new enquiry', on_booking: 'Automatically when a couple books' }
const toRow = (it) => ({ ...it, days: Math.abs(it.offset_days || 0), when: (it.offset_days || 0) < 0 ? 'before' : (it.offset_days || 0) > 0 ? 'after' : 'on' })
const fromRow = (r) => ({ ...r, offset_days: r.when === 'on' ? 0 : (r.when === 'before' ? -1 : 1) * Math.abs(Number(r.days) || 0) })

export default function ChecklistManager({ isOpen, onClose, onApplied }) {
  const { getAdminAxios } = useAuth()
  const api = useRef(getAdminAxios()).current
  const [templates, setTemplates] = useState([])
  const [anchors, setAnchors] = useState({})
  const [staff, setStaff] = useState([])
  const [couples, setCouples] = useState([])
  const [edit, setEdit] = useState(null) // template being edited, rows as UI rows
  const [apply, setApply] = useState({ template_id: '', couple_id: '' })

  const load = useCallback(async () => {
    const [t, a] = await Promise.all([api.get('/api/task-templates'), api.get('/api/task-templates/anchors')])
    setTemplates(t.data); setAnchors(a.data)
    setApply(p => ({ ...p, template_id: p.template_id || t.data[0]?.id || '' }))
  }, [api])
  useEffect(() => {
    if (!isOpen) return
    load().catch(() => toast.error('Could not load checklists'))
    api.get('/api/auth/staff').then(r => setStaff(r.data)).catch(() => {})
    api.get('/api/couples').then(r => setCouples(r.data)).catch(() => {})
  }, [isOpen, api, load])

  const startNew = () => setEdit({ id: null, name: '', auto_apply: 'none', items: [toRow({ title: '', anchor: 'checkin', offset_days: -7, priority: 'medium' })] })
  const startEdit = (t) => setEdit({ ...t, items: t.items.map(toRow) })
  const setRow = (i, patch) => setEdit(e => ({ ...e, items: e.items.map((r, j) => (j === i ? { ...r, ...patch } : r)) }))
  const move = (i, d) => setEdit(e => { const items = [...e.items]; const [r] = items.splice(i, 1); items.splice(i + d, 0, r); return { ...e, items } })

  const save = async (ev) => {
    ev.preventDefault()
    const body = { name: edit.name, auto_apply: edit.auto_apply, items: edit.items.map(fromRow) }
    try {
      if (edit.id) await api.put(`/api/task-templates/${edit.id}`, body)
      else await api.post('/api/task-templates', body)
      toast.success('Checklist saved'); setEdit(null); load()
    } catch (err) { toast.error(err.response?.data?.error || 'Could not save the checklist') }
  }
  const remove = async (t) => {
    if (!confirm(`Delete the checklist "${t.name}"? Tasks already made from it are kept.`)) return
    try { await api.delete(`/api/task-templates/${t.id}`); load() } catch { toast.error('Could not delete') }
  }
  const run = async (ev) => {
    ev.preventDefault()
    try {
      const { data } = await api.post(`/api/task-templates/${apply.template_id}/apply`, { couple_id: Number(apply.couple_id) })
      const skippedNote = data.skipped.length ? ` ${data.skipped.length} skipped (${[...new Set(data.skipped.map(s => s.reason))].join(', ')}).` : ''
      toast.success(`Added ${data.created.length} task${data.created.length === 1 ? '' : 's'}.${skippedNote}`, { duration: 6000 })
      onApplied?.()
    } catch (err) { toast.error(err.response?.data?.error || 'Could not apply the checklist') }
  }

  return (
    <Modal isOpen={isOpen} onClose={() => (edit ? setEdit(null) : onClose())} title={edit ? (edit.id ? 'Edit checklist' : 'New checklist') : 'Checklists'} size={edit ? '2xl' : 'xl'}>
      {edit ? (
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Name" value={edit.name} onChange={e => setEdit(x => ({ ...x, name: e.target.value }))} required placeholder="e.g. Booked wedding: venue checklist" />
            <Select label="When to use it" value={edit.auto_apply} onChange={e => setEdit(x => ({ ...x, auto_apply: e.target.value }))}>
              {Object.entries(AUTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </div>
          <div className="space-y-2">
            {edit.items.map((r, i) => (
              <div key={r.id || `new-${i}`} className="flex flex-wrap items-end gap-2 border border-slate-100 rounded-lg p-2">
                <div className="flex-1 min-w-[14rem]"><Input label={i === 0 ? 'Task' : undefined} aria-label="Task" value={r.title} onChange={e => setRow(i, { title: e.target.value })} placeholder="What needs doing" /></div>
                <div className="w-20"><Input label={i === 0 ? 'Days' : undefined} aria-label="Days" type="number" min="0" value={r.when === 'on' ? 0 : r.days} disabled={r.when === 'on'} onChange={e => setRow(i, { days: e.target.value })} /></div>
                <div className="w-28">
                  <Select label={i === 0 ? 'Before / after' : undefined} aria-label="Before or after" value={r.when} onChange={e => setRow(i, { when: e.target.value })}>
                    <option value="before">before</option><option value="on">on</option><option value="after">after</option>
                  </Select>
                </div>
                <div className="w-48">
                  <Select label={i === 0 ? 'Date' : undefined} aria-label="Counted from" value={r.anchor} onChange={e => setRow(i, { anchor: e.target.value })}>
                    {Object.entries(anchors).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                </div>
                <div className="w-28">
                  <Select label={i === 0 ? 'Priority' : undefined} aria-label="Priority" value={r.priority} onChange={e => setRow(i, { priority: e.target.value })}>
                    <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
                  </Select>
                </div>
                <div className="w-36">
                  <Select label={i === 0 ? 'Who' : undefined} aria-label="Assigned to" value={r.assigned_to || ''} onChange={e => setRow(i, { assigned_to: e.target.value })}>
                    <option value="">Anyone</option>
                    {staff.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                  </Select>
                </div>
                <div className="flex gap-0.5 pb-1">
                  <button type="button" className="p-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ArrowUpIcon className="w-4 h-4" /></button>
                  <button type="button" className="p-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-30" disabled={i === edit.items.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ArrowDownIcon className="w-4 h-4" /></button>
                  <button type="button" className="p-1.5 text-slate-400 hover:text-red-600" onClick={() => setEdit(e => ({ ...e, items: e.items.filter((_, j) => j !== i) }))} aria-label="Remove task"><TrashIcon className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
            <button type="button" className="btn-ghost" onClick={() => setEdit(e => ({ ...e, items: [...e.items, toRow({ title: '', anchor: 'checkin', offset_days: -7, priority: 'medium' })] }))}>
              <PlusIcon className="w-4 h-4" /> Add a task
            </button>
          </div>
          <p className="text-xs text-slate-500">Due dates are worked out when the checklist is applied. If a wedding date changes later, edit the tasks or apply again after deleting them.</p>
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button type="button" className="btn-secondary" onClick={() => setEdit(null)}>Back</button>
            <button type="submit" className="btn-primary">Save checklist</button>
          </div>
        </form>
      ) : (
        <div className="space-y-6">
          <div className="space-y-2">
            {templates.length === 0 && <p className="text-sm text-slate-500">No checklists yet.</p>}
            {templates.map(t => (
              <div key={t.id} className="flex flex-wrap items-center gap-3 border border-slate-100 rounded-lg px-4 py-3">
                <div className="flex-1 min-w-[12rem]">
                  <div className="font-medium text-slate-900">{t.name}</div>
                  <div className="text-xs text-slate-500">{t.items.length} task{t.items.length === 1 ? '' : 's'} · {AUTO[t.auto_apply]}</div>
                </div>
                <button className="btn-secondary" onClick={() => startEdit(t)}>Edit</button>
                <button className="p-2 text-slate-400 hover:text-red-600" onClick={() => remove(t)} aria-label={`Delete ${t.name}`}><TrashIcon className="w-4 h-4" /></button>
              </div>
            ))}
            <button className="btn-ghost" onClick={startNew}><PlusIcon className="w-4 h-4" /> New checklist</button>
          </div>

          {templates.length > 0 && (
            <form onSubmit={run} className="border-t border-slate-100 pt-5 space-y-3">
              <h3 className="font-semibold text-slate-900">Apply a checklist to a couple</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Select label="Checklist" value={apply.template_id} onChange={e => setApply(p => ({ ...p, template_id: e.target.value }))} required>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
                <Select label="Couple" value={apply.couple_id} onChange={e => setApply(p => ({ ...p, couple_id: e.target.value }))} required>
                  <option value="">Choose a couple…</option>
                  {couples.map(c => <option key={c.id} value={c.id}>{c.partner1_name} & {c.partner2_name}{c.wedding_date ? ` · ${c.wedding_date}` : ''}</option>)}
                </Select>
              </div>
              <div className="flex justify-end"><button type="submit" className="btn-primary" disabled={!apply.couple_id || !apply.template_id}>Add the tasks</button></div>
            </form>
          )}
        </div>
      )}
    </Modal>
  )
}
