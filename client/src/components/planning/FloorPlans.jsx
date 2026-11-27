import { useEffect, useRef, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import { PlusIcon, Squares2X2Icon, PrinterIcon, TrashIcon, BookmarkIcon, PencilSquareIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../../contexts/AuthContext'
import Modal from '../ui/Modal'
import Input, { Select } from '../ui/Input'
import FloorPlanEditor from './FloorPlanEditor'
import { openPrintable } from '../../utils/files'

// A couple's floor plans (ceremony, reception…) and the venue's saved
// layouts a new plan can start from.

export default function FloorPlans({ coupleId }) {
  const { getAdminAxios } = useAuth()
  const api = useRef(getAdminAxios()).current
  const [plans, setPlans] = useState(null)
  const [layouts, setLayouts] = useState([])
  const [guestCount, setGuestCount] = useState(0)
  const [openId, setOpenId] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ name: 'Reception', width_ft: 80, height_ft: 50, copy_from: '' })

  const load = useCallback(async () => {
    const [p, t, g] = await Promise.all([api.get(`/api/floorplans/couple/${coupleId}`), api.get('/api/floorplans/templates'), api.get(`/api/guests/couple/${coupleId}`)])
    setPlans(p.data); setLayouts(t.data); setGuestCount(g.data.filter(x => x.rsvp_status !== 'declined').length)
  }, [api, coupleId])
  useEffect(() => { load().catch(() => toast.error('Could not load the floor plans')) }, [load])

  const create = async (e) => {
    e.preventDefault()
    try {
      const { data } = await api.post(`/api/floorplans/couple/${coupleId}`, { ...form, copy_from: form.copy_from || undefined })
      setShowNew(false); await load(); setOpenId(data.id)
    } catch (err) { toast.error(err.response?.data?.error || 'Could not create the plan') }
  }

  const remove = async (p) => {
    if (!confirm(`Delete the plan "${p.name}"? Guests seated on it will be unseated.`)) return
    try { await api.delete(`/api/floorplans/${p.id}`); load() } catch (err) { toast.error(err.response?.data?.error || 'Could not delete the plan') }
  }

  const saveLayout = async (p) => {
    const name = prompt('Save this layout for future weddings as:', p.name)
    if (!name?.trim()) return
    try { await api.post(`/api/floorplans/${p.id}/save-as-template`, { name: name.trim() }); toast.success('Saved as a venue layout'); load() }
    catch (err) { toast.error(err.response?.data?.error || 'Could not save the layout') }
  }

  const removeLayout = async (l) => {
    if (!confirm(`Delete the saved layout "${l.name}"? Plans already made from it are not affected.`)) return
    try { await api.delete(`/api/floorplans/${l.id}`); load() } catch { toast.error('Could not delete the layout') }
  }

  const print = async (p) => {
    try { await openPrintable(api, `/api/floorplans/${p.id}/print`) } catch (err) { toast.error(err.message || 'Could not open the plan') }
  }

  if (!plans) return <div className="card p-6 text-sm text-slate-400">Loading floor plans…</div>

  const open = plans.find(p => p.id === openId)
  if (open) return <FloorPlanEditor key={open.id} plan={open} coupleId={coupleId} onClose={() => { setOpenId(null); load() }} onSaved={() => {}} />

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primary" onClick={() => { setForm({ name: plans.length ? 'Ceremony' : 'Reception', width_ft: 80, height_ft: 50, copy_from: layouts[0]?.id || '' }); setShowNew(true) }}>
          <PlusIcon className="w-4 h-4" /> New floor plan
        </button>
        <p className="text-xs text-slate-500">Draw the space, set out tables, and seat the {guestCount} guest{guestCount === 1 ? '' : 's'} on the list.</p>
      </div>

      {plans.length === 0 ? (
        <div className="card py-14 text-center">
          <Squares2X2Icon className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No floor plans yet</p>
          <p className="text-sm text-slate-400 mt-1 max-w-md mx-auto">Start blank or from a saved venue layout. Save a finished plan as a layout and the next wedding starts from it.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {plans.map(p => {
            const tables = p.items.filter(i => ['round', 'rect', 'long', 'head'].includes(i.type))
            return (
              <div key={p.id} className="card p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-slate-900">{p.name}</h3>
                    <p className="text-xs text-slate-500">{p.width_ft} × {p.height_ft} ft · {p.items.length} element{p.items.length === 1 ? '' : 's'} · {tables.length} table{tables.length === 1 ? '' : 's'} · {tables.reduce((s, t) => s + (t.seats || 0), 0)} seats</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-4">
                  <button className="btn-primary" onClick={() => setOpenId(p.id)}><PencilSquareIcon className="w-4 h-4" /> Open</button>
                  <button className="btn-secondary" onClick={() => print(p)} aria-label={`Print ${p.name}`}><PrinterIcon className="w-4 h-4" /></button>
                  <button className="btn-secondary" onClick={() => saveLayout(p)} title="Save as a venue layout"><BookmarkIcon className="w-4 h-4" /></button>
                  <button className="btn-secondary text-red-600" onClick={() => remove(p)} aria-label={`Delete ${p.name}`}><TrashIcon className="w-4 h-4" /></button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {layouts.length > 0 && (
        <div className="text-sm text-slate-500">
          Saved venue layouts: {layouts.map((l, i) => (
            <span key={l.id}>{i ? ', ' : ''}{l.name} <button className="text-xs text-slate-400 hover:text-red-600" onClick={() => removeLayout(l)} aria-label={`Delete layout ${l.name}`}>(delete)</button></span>
          ))}
        </div>
      )}

      <Modal isOpen={showNew} onClose={() => setShowNew(false)} title="New floor plan">
        <form onSubmit={create} className="space-y-4">
          <Input label="Name" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required placeholder="e.g. Reception, Ceremony" />
          <Select label="Start from" value={form.copy_from} onChange={e => setForm(p => ({ ...p, copy_from: e.target.value }))}>
            <option value="">A blank space</option>
            {layouts.map(l => <option key={l.id} value={l.id}>Saved layout: {l.name}</option>)}
            {plans.map(p => <option key={p.id} value={p.id}>Copy of this couple’s {p.name}</option>)}
          </Select>
          {!form.copy_from && (
            <div className="grid grid-cols-2 gap-4">
              <Input label="Width (ft)" type="number" min="10" max="1000" value={form.width_ft} onChange={e => setForm(p => ({ ...p, width_ft: e.target.value }))} />
              <Input label="Length (ft)" type="number" min="10" max="1000" value={form.height_ft} onChange={e => setForm(p => ({ ...p, height_ft: e.target.value }))} />
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button type="button" className="btn-secondary" onClick={() => setShowNew(false)}>Cancel</button>
            <button type="submit" className="btn-primary">Create and open</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
