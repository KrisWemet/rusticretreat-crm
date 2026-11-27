import { useEffect, useRef, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import { PlusIcon, PencilIcon, TrashIcon, StarIcon, PhoneIcon, EnvelopeIcon, GlobeAltIcon, ShieldExclamationIcon } from '@heroicons/react/24/outline'
import { StarIcon as StarSolid } from '@heroicons/react/24/solid'
import { useAuth } from '../contexts/AuthContext'
import Modal from './ui/Modal'
import Input, { Select, Textarea } from './ui/Input'

// The venue's own vendor list. A couple's page adds from it in one click.

const blank = { category: '', business_name: '', contact_name: '', phone: '', email: '', website: '', insurance_expires: '', notes: '', preferred: true }
const today = () => new Date().toISOString().slice(0, 10)

export default function VendorDirectory() {
  const { getAdminAxios } = useAuth()
  const api = useRef(getAdminAxios()).current
  const [rows, setRows] = useState(null)
  const [categories, setCategories] = useState([])
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(blank)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const load = useCallback(async () => { setRows((await api.get('/api/vendor-directory')).data) }, [api])
  useEffect(() => {
    load().catch(() => toast.error('Could not load the vendor directory'))
    api.get('/api/vendor-directory/categories').then(r => setCategories(r.data)).catch(() => {})
  }, [api, load])

  const openNew = () => { setForm(blank); setEditing('new') }
  const openEdit = (v) => { setForm({ ...blank, ...Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x ?? ''])), preferred: !!v.preferred }); setEditing(v) }
  const save = async (e) => {
    e.preventDefault()
    try {
      if (editing === 'new') await api.post('/api/vendor-directory', form)
      else await api.put(`/api/vendor-directory/${editing.id}`, form)
      toast.success(editing === 'new' ? 'Vendor added to the directory' : 'Vendor updated'); setEditing(null); load()
    } catch (err) { toast.error(err.response?.data?.error || 'Could not save') }
  }
  const remove = async (v) => {
    if (!confirm(`Remove ${v.business_name} from the directory? Couples who already have them keep their details.`)) return
    try { await api.delete(`/api/vendor-directory/${v.id}`); load() } catch (err) { toast.error(err.response?.data?.error || 'Could not remove') }
  }
  const togglePreferred = async (v) => {
    try { await api.put(`/api/vendor-directory/${v.id}`, { preferred: !v.preferred }); load() } catch { toast.error('Could not update') }
  }

  if (!rows) return <div className="card p-6 text-sm text-slate-400">Loading…</div>
  const shown = rows.filter(v => (!category || v.category === category) && (!search ||
    `${v.business_name} ${v.contact_name || ''} ${v.category}`.toLowerCase().includes(search.toLowerCase())))
  const usedCats = [...new Set(rows.map(r => r.category))].sort()

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primary" onClick={openNew}><PlusIcon className="w-4 h-4" /> Add to directory</button>
        <div className="flex-1" />
        <input id="directory-search" name="directory-search" aria-label="Search the vendor directory" className="input-field w-56" placeholder="Search vendors" value={search} onChange={e => setSearch(e.target.value)} />
        {usedCats.length > 1 && (
          <Select aria-label="Filter by category" value={category} onChange={e => setCategory(e.target.value)} className="w-auto">
            <option value="">All categories</option>
            {usedCats.map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="card py-14 text-center">
          <StarIcon className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">Your vendor directory is empty</p>
          <p className="text-sm text-slate-400 mt-1 max-w-md mx-auto">Add the caterers, photographers, rentals and others you know. Star the ones you recommend, track insurance expiry, and add them to any couple from their Vendors tab.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {shown.map(v => {
            const expired = v.insurance_expires && v.insurance_expires < today()
            return (
              <div key={v.id} className="card p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-500">{v.category}</div>
                    <div className="font-semibold text-slate-900">{v.business_name}</div>
                    {v.contact_name && <div className="text-sm text-slate-600">{v.contact_name}</div>}
                  </div>
                  <button onClick={() => togglePreferred(v)} aria-label={v.preferred ? `Unstar ${v.business_name}` : `Star ${v.business_name} as recommended`} className="p-1">
                    {v.preferred ? <StarSolid className="w-5 h-5 text-amber-400" /> : <StarIcon className="w-5 h-5 text-slate-300" />}
                  </button>
                </div>
                <div className="mt-3 space-y-1 text-sm text-slate-600">
                  {v.phone && <div className="flex items-center gap-2"><PhoneIcon className="w-4 h-4 text-slate-400" /><a href={`tel:${v.phone}`} className="hover:underline">{v.phone}</a></div>}
                  {v.email && <div className="flex items-center gap-2"><EnvelopeIcon className="w-4 h-4 text-slate-400" /><a href={`mailto:${v.email}`} className="text-rose-600 hover:underline break-all">{v.email}</a></div>}
                  {v.website && <div className="flex items-center gap-2"><GlobeAltIcon className="w-4 h-4 text-slate-400" /><span className="break-all">{v.website}</span></div>}
                  {v.insurance_expires && (
                    <div className={`flex items-center gap-2 ${expired ? 'text-red-600 font-medium' : ''}`}>
                      <ShieldExclamationIcon className={`w-4 h-4 ${expired ? 'text-red-500' : 'text-slate-400'}`} />
                      Insurance {expired ? 'expired' : 'until'} {v.insurance_expires}
                    </div>
                  )}
                  {v.notes && <p className="text-xs text-slate-500 whitespace-pre-wrap pt-1">{v.notes}</p>}
                </div>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-slate-400">{v.weddings ? `Used at ${v.weddings} wedding${v.weddings === 1 ? '' : 's'}` : 'Not used yet'}</span>
                  <div className="flex gap-1">
                    <button className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg" onClick={() => openEdit(v)} aria-label={`Edit ${v.business_name}`}><PencilIcon className="w-4 h-4" /></button>
                    <button className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg" onClick={() => remove(v)} aria-label={`Remove ${v.business_name}`}><TrashIcon className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add to the vendor directory' : 'Edit vendor'} size="lg">
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Category" list="directory-cats" value={form.category} onChange={f('category')} required placeholder="e.g. Catering" />
            <Input label="Business name" value={form.business_name} onChange={f('business_name')} required />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input label="Contact" value={form.contact_name} onChange={f('contact_name')} />
            <Input label="Phone" value={form.phone} onChange={f('phone')} />
            <Input label="Email" type="email" value={form.email} onChange={f('email')} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Website" value={form.website} onChange={f('website')} />
            <Input label="Insurance expires" type="date" value={form.insurance_expires} onChange={f('insurance_expires')} />
          </div>
          <Textarea label="Notes" value={form.notes} onChange={f('notes')} rows={2} placeholder="Power needs, what they’re like to work with, past weddings…" />
          <label className="flex items-center gap-2 text-sm text-slate-700"><input id="directory-preferred" name="directory-preferred" type="checkbox" checked={form.preferred} onChange={f('preferred')} /> Recommended by the venue (starred)</label>
          <datalist id="directory-cats">{categories.map(c => <option key={c} value={c} />)}</datalist>
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
            <button type="submit" className="btn-primary">{editing === 'new' ? 'Add' : 'Save'}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
