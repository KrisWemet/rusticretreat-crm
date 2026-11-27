import { useEffect, useRef, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { PlusIcon, PencilIcon, TrashIcon, BuildingStorefrontIcon, PhoneIcon, EnvelopeIcon, ClockIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../../contexts/AuthContext'
import Modal from '../ui/Modal'
import Input, { Select, Textarea } from '../ui/Input'

// Who is working this wedding, when they arrive, and whether they are
// confirmed. Vendors can come from the venue's directory or be typed in.

const blank = { vendor_type: '', business_name: '', contact_name: '', phone: '', email: '', website: '', arrival_time: '', notes: '', booked: false }

export default function CoupleVendors({ coupleId }) {
  const { getAdminAxios } = useAuth()
  const api = useRef(getAdminAxios()).current
  const [vendors, setVendors] = useState(null)
  const [directory, setDirectory] = useState([])
  const [categories, setCategories] = useState([])
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(blank)
  const [pick, setPick] = useState('')
  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const load = useCallback(async () => {
    const [v, d] = await Promise.all([api.get(`/api/vendors/couple/${coupleId}`), api.get('/api/vendor-directory')])
    setVendors(v.data); setDirectory(d.data)
  }, [api, coupleId])
  useEffect(() => {
    load().catch(() => toast.error('Could not load vendors'))
    api.get('/api/vendor-directory/categories').then(r => setCategories(r.data)).catch(() => {})
  }, [api, load])

  const onList = new Set((vendors || []).map(v => v.directory_id).filter(Boolean))
  const available = directory.filter(d => !onList.has(d.id))

  const addFromDirectory = async () => {
    if (!pick) return
    try { await api.post(`/api/vendor-directory/${pick}/assign`, { couple_id: Number(coupleId) }); setPick(''); toast.success('Vendor added'); load() }
    catch (err) { toast.error(err.response?.data?.error || 'Could not add the vendor') }
  }

  const openNew = () => { setForm(blank); setEditing('new') }
  const openEdit = (v) => { setForm({ ...blank, ...Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x ?? ''])), booked: !!v.booked }); setEditing(v) }

  const save = async (e) => {
    e.preventDefault()
    try {
      if (editing === 'new') await api.post(`/api/vendors/couple/${coupleId}`, form)
      else await api.put(`/api/vendors/${editing.id}`, form)
      toast.success(editing === 'new' ? 'Vendor added' : 'Vendor updated'); setEditing(null); load()
    } catch (err) { toast.error(err.response?.data?.error || 'Could not save the vendor') }
  }

  const toggle = async (v) => {
    try { await api.put(`/api/vendors/${v.id}`, { booked: !v.booked }); load() } catch (err) { toast.error(err.response?.data?.error || 'Could not update') }
  }
  const remove = async (v) => {
    if (!confirm(`Remove ${v.business_name} from this wedding?`)) return
    try { await api.delete(`/api/vendors/${v.id}`); load() } catch (err) { toast.error(err.response?.data?.error || 'Could not remove') }
  }

  if (!vendors) return <div className="card p-6 text-sm text-slate-400">Loading vendors…</div>

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-2">
        {directory.length > 0 && (
          <>
            <Select label="From your vendor directory" value={pick} onChange={e => setPick(e.target.value)} className="w-72">
              <option value="">Choose a vendor…</option>
              {available.map(d => <option key={d.id} value={d.id}>{d.business_name} · {d.category}</option>)}
            </Select>
            <button className="btn-secondary" onClick={addFromDirectory} disabled={!pick}>Add</button>
            <span className="text-slate-300 px-1">or</span>
          </>
        )}
        <button className="btn-primary" onClick={openNew}><PlusIcon className="w-4 h-4" /> New vendor</button>
        <Link to="/vendors" className="text-xs text-rose-600 hover:underline ml-auto">Manage the vendor directory</Link>
      </div>

      {vendors.length === 0 ? (
        <div className="card py-14 text-center">
          <BuildingStorefrontIcon className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No vendors yet</p>
          <p className="text-sm text-slate-400 mt-1">Add the caterer, DJ, photographer and others, with when each arrives. They print on the event order.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {vendors.map(v => (
            <div key={v.id} className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-slate-500">{v.vendor_type}</div>
                  <div className="font-semibold text-slate-900">{v.business_name}</div>
                  {v.contact_name && <div className="text-sm text-slate-600">{v.contact_name}</div>}
                </div>
                <button onClick={() => toggle(v)} className={`text-xs font-medium px-2.5 py-1 rounded-full ${v.booked ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}
                  title="Click to change">{v.booked ? 'Confirmed' : 'Not confirmed'}</button>
              </div>
              <div className="mt-3 space-y-1 text-sm text-slate-600">
                {v.arrival_time && <div className="flex items-center gap-2"><ClockIcon className="w-4 h-4 text-slate-400" /> Arrives {v.arrival_time}</div>}
                {v.phone && <div className="flex items-center gap-2"><PhoneIcon className="w-4 h-4 text-slate-400" /><a href={`tel:${v.phone}`} className="hover:underline">{v.phone}</a></div>}
                {v.email && <div className="flex items-center gap-2"><EnvelopeIcon className="w-4 h-4 text-slate-400" /><a href={`mailto:${v.email}`} className="text-rose-600 hover:underline break-all">{v.email}</a></div>}
                {v.notes && <p className="text-xs text-slate-500 whitespace-pre-wrap pt-1">{v.notes}</p>}
              </div>
              <div className="flex justify-end gap-1 mt-3">
                <button className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg" onClick={() => openEdit(v)} aria-label={`Edit ${v.business_name}`}><PencilIcon className="w-4 h-4" /></button>
                <button className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg" onClick={() => remove(v)} aria-label={`Remove ${v.business_name}`}><TrashIcon className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add a vendor' : 'Edit vendor'} size="lg">
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Type" list="vendor-cats" value={form.vendor_type} onChange={f('vendor_type')} required placeholder="e.g. Catering" />
            <Input label="Business name" value={form.business_name} onChange={f('business_name')} required />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input label="Contact" value={form.contact_name} onChange={f('contact_name')} />
            <Input label="Phone" value={form.phone} onChange={f('phone')} />
            <Input label="Email" type="email" value={form.email} onChange={f('email')} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Arrives" value={form.arrival_time} onChange={f('arrival_time')} placeholder="e.g. Sat 2:00 PM, north gate" />
            <Input label="Website" value={form.website} onChange={f('website')} />
          </div>
          <Textarea label="Notes" value={form.notes} onChange={f('notes')} rows={2} placeholder="Power needs, setup area, insurance received…" />
          <label className="flex items-center gap-2 text-sm text-slate-700"><input id="vendor-booked" name="vendor-booked" type="checkbox" checked={form.booked} onChange={f('booked')} /> Confirmed for this wedding</label>
          <datalist id="vendor-cats">{categories.map(c => <option key={c} value={c} />)}</datalist>
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
            <button type="submit" className="btn-primary">{editing === 'new' ? 'Add vendor' : 'Save'}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
