import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { PlusIcon, PencilIcon, TrashIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const EMPTY = { name: '', description: '', price: '', max_guests: '', includes: '', is_active: true }

export default function Packages() {
  const { getAdminAxios } = useAuth()
  const [packages, setPackages] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // null | 'add' | package obj
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  const api = getAdminAxios()

  function load() {
    api.get('/api/packages')
      .then(r => setPackages(r.data))
      .catch(() => toast.error('Failed to load packages'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  function openAdd() { setForm(EMPTY); setModal('add') }
  function openEdit(pkg) {
    setForm({
      name: pkg.name,
      description: pkg.description || '',
      price: pkg.price,
      max_guests: pkg.max_guests || '',
      includes: pkg.includes || '',
      is_active: pkg.is_active === 1,
    })
    setModal(pkg)
  }

  async function save() {
    if (!form.name || !form.price) return toast.error('Name and price are required')
    setSaving(true)
    try {
      const payload = {
        name: form.name,
        description: form.description || null,
        price: parseFloat(form.price),
        max_guests: form.max_guests ? parseInt(form.max_guests) : null,
        includes: form.includes || null,
        is_active: form.is_active,
      }
      if (modal === 'add') {
        await api.post('/api/packages', payload)
        toast.success('Package created')
      } else {
        await api.put(`/api/packages/${modal.id}`, payload)
        toast.success('Package updated')
      }
      setModal(null)
      load()
    } catch {
      toast.error('Failed to save package')
    } finally {
      setSaving(false)
    }
  }

  async function del(pkg) {
    if (!confirm(`Delete "${pkg.name}"? This cannot be undone.`)) return
    try {
      await api.delete(`/api/packages/${pkg.id}`)
      toast.success('Package deleted')
      load()
    } catch {
      toast.error('Failed to delete package')
    }
  }

  async function toggleActive(pkg) {
    try {
      await api.put(`/api/packages/${pkg.id}`, { is_active: !pkg.is_active })
      load()
    } catch {
      toast.error('Failed to update package')
    }
  }

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Venue Packages</h1>
          <p className="page-subtitle">{packages.filter(p => p.is_active).length} active packages</p>
        </div>
        <button onClick={openAdd} className="btn-primary">
          <PlusIcon className="w-4 h-4" />
          Add Package
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-7 w-7 border-2 border-rose-200 border-t-rose-500" /></div>
      ) : packages.length === 0 ? (
        <div className="card py-16 text-center">
          <p className="text-slate-400 font-medium">No packages yet</p>
          <p className="text-xs text-slate-300 mt-1">Create packages to standardize your offerings and pricing.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {packages.map(pkg => (
            <div key={pkg.id} className={`card p-5 ${!pkg.is_active ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-800">{pkg.name}</h3>
                    {pkg.is_active
                      ? <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">Active</span>
                      : <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">Inactive</span>}
                  </div>
                  <div className="text-2xl font-bold text-rose-600 mt-1">
                    ${Number(pkg.price).toLocaleString()} CAD
                  </div>
                  {pkg.max_guests && <p className="text-xs text-slate-400 mt-0.5">Up to {pkg.max_guests} guests</p>}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => openEdit(pkg)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                    <PencilIcon className="w-4 h-4" />
                  </button>
                  <button onClick={() => del(pkg)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {pkg.description && <p className="text-sm text-slate-500 mb-3">{pkg.description}</p>}
              {pkg.includes && (
                <div className="border-t border-slate-50 pt-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Includes</p>
                  <div className="flex flex-wrap gap-1.5">
                    {pkg.includes.split(',').map(item => (
                      <span key={item} className="text-xs bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full">{item.trim()}</span>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-3 pt-3 border-t border-slate-50">
                <button
                  onClick={() => toggleActive(pkg)}
                  className="text-xs text-slate-400 hover:text-slate-700 flex items-center gap-1.5 transition-colors"
                >
                  {pkg.is_active
                    ? <><XCircleIcon className="w-3.5 h-3.5" /> Deactivate</>
                    : <><CheckCircleIcon className="w-3.5 h-3.5 text-emerald-500" /> Activate</>}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">{modal === 'add' ? 'New Package' : 'Edit Package'}</h2>
              <button onClick={() => setModal(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="label">Package Name</label>
                <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. 3-Day Weekend" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Price (CAD $)</label>
                  <input className="input" type="number" min="0" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="45000" />
                </div>
                <div>
                  <label className="label">Max Guests</label>
                  <input className="input" type="number" min="1" value={form.max_guests} onChange={e => setForm(f => ({ ...f, max_guests: e.target.value }))} placeholder="200" />
                </div>
              </div>
              <div>
                <label className="label">Description</label>
                <textarea className="input" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description of this package..." />
              </div>
              <div>
                <label className="label">What's Included <span className="text-slate-400 font-normal">(comma-separated)</span></label>
                <textarea className="input" rows={3} value={form.includes} onChange={e => setForm(f => ({ ...f, includes: e.target.value }))} placeholder="Forest Clearing ceremony, Clear-Top Gazebo reception, Tables & chairs, Fire pit access..." />
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="active" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="w-4 h-4 accent-rose-600" />
                <label htmlFor="active" className="text-sm text-slate-700">Active (visible to staff when creating contracts)</label>
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setModal(null)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={save} disabled={saving} className="btn-primary flex-1">
                {saving ? 'Saving…' : modal === 'add' ? 'Create Package' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
