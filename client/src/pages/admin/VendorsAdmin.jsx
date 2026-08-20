import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import Modal from '../../components/ui/Modal'
import Input, { Select, Textarea } from '../../components/ui/Input'
import { PlusIcon, BuildingStorefrontIcon, PhoneIcon, EnvelopeIcon, GlobeAltIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const emptyForm = {
  couple_id: '', vendor_type: '', business_name: '', contact_name: '',
  phone: '', email: '', website: '', notes: '', booked: false
}

const vendorTypes = ['Photography', 'Videography', 'Catering', 'Florist', 'Music/DJ', 'Officiant', 'Hair & Makeup', 'Transportation', 'Cake/Bakery', 'Lighting', 'Other']

export default function VendorsAdmin() {
  const { getAdminAxios } = useAuth()
  const [vendors, setVendors] = useState([])
  const [couples, setCouples] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState(emptyForm)
  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  const fetchData = async () => {
    const api = getAdminAxios()
    const [vRes, cRes] = await Promise.all([api.get('/api/vendors'), api.get('/api/couples')])
    setVendors(vRes.data); setCouples(cRes.data)
  }

  useEffect(() => { fetchData().catch(() => {}).finally(() => setLoading(false)) }, [])

  const handleAdd = async (e) => {
    e.preventDefault()
    try {
      await getAdminAxios().post(`/api/vendors/couple/${form.couple_id}`, form)
      toast.success('Vendor added!'); setShowAdd(false); setForm(emptyForm); fetchData()
    } catch { toast.error('Failed to add vendor') }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this vendor?')) return
    await getAdminAxios().delete(`/api/vendors/${id}`)
    toast.success('Deleted'); fetchData()
  }

  const filtered = vendors.filter(v =>
    !search || v.business_name?.toLowerCase().includes(search.toLowerCase()) || v.vendor_type?.toLowerCase().includes(search.toLowerCase())
  )

  const byCouple = filtered.reduce((acc, v) => {
    const key = v.couple_id
    if (!acc[key]) acc[key] = { name: `${v.partner1_name} & ${v.partner2_name}`, vendors: [] }
    acc[key].vendors.push(v)
    return acc
  }, {})

  return (
    <div className="p-6 space-y-5 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Vendor Directory</h1>
          <p className="page-subtitle">{vendors.length} vendors across all clients</p>
        </div>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>
          <PlusIcon className="w-4 h-4" />
          Add Vendor
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <BuildingStorefrontIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          id="vendors-search" name="vendors-search" aria-label="Search vendors" placeholder="Search vendors..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input-field pl-9"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-7 w-7 border-2 border-rose-200 border-t-rose-600" /></div>
      ) : Object.keys(byCouple).length === 0 ? (
        <div className="card py-16 text-center">
          <BuildingStorefrontIcon className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400">No vendors yet. Add your first vendor above.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(byCouple).map(([coupleId, { name, vendors: cvs }]) => (
            <div key={coupleId} className="card overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-50 bg-slate-50/50 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-800">{name}</h2>
                <span className="text-xs text-slate-400">{cvs.length} vendor{cvs.length !== 1 ? 's' : ''}</span>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Business</th>
                    <th>Type</th>
                    <th>Contact</th>
                    <th>Reach</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {cvs.map(v => (
                    <tr key={v.id}>
                      <td>
                        <div className="font-medium text-slate-800">{v.business_name}</div>
                        {v.contact_name && <div className="text-xs text-slate-400">{v.contact_name}</div>}
                      </td>
                      <td className="text-slate-600">{v.vendor_type}</td>
                      <td>
                        <div className="space-y-0.5">
                          {v.phone && <div className="flex items-center gap-1.5 text-xs text-slate-500"><PhoneIcon className="w-3 h-3" />{v.phone}</div>}
                          {v.email && <div className="flex items-center gap-1.5 text-xs text-slate-500"><EnvelopeIcon className="w-3 h-3" />{v.email}</div>}
                        </div>
                      </td>
                      <td>
                        {v.website && (
                          <a href={v.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700">
                            <GlobeAltIcon className="w-3.5 h-3.5" />Website
                          </a>
                        )}
                      </td>
                      <td>
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${v.booked ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {v.booked ? 'Booked' : 'Considering'}
                        </span>
                      </td>
                      <td>
                        <button onClick={() => handleDelete(v.id)} className="text-xs text-slate-400 hover:text-red-500 transition-colors">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add Vendor" size="lg">
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Select label="Couple" value={form.couple_id} onChange={f('couple_id')} required>
              <option value="">Select couple...</option>
              {couples.map(c => <option key={c.id} value={c.id}>{c.partner1_name} & {c.partner2_name}</option>)}
            </Select>
            <Select label="Vendor Type" value={form.vendor_type} onChange={f('vendor_type')} required>
              <option value="">Select type...</option>
              {vendorTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Business Name" value={form.business_name} onChange={f('business_name')} required />
            <Input label="Contact Name" value={form.contact_name} onChange={f('contact_name')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Phone" value={form.phone} onChange={f('phone')} />
            <Input label="Email" type="email" value={form.email} onChange={f('email')} />
          </div>
          <Input label="Website" value={form.website} onChange={f('website')} placeholder="https://" />
          <Textarea label="Notes" value={form.notes} onChange={f('notes')} />
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input id="vendor-booked" name="vendor-booked" type="checkbox" checked={form.booked} onChange={e => setForm(p => ({ ...p, booked: e.target.checked }))} className="w-4 h-4 rounded text-rose-600 border-slate-300 focus:ring-rose-500" />
            <span className="text-sm text-slate-700">Already confirmed/booked</span>
          </label>
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button type="button" className="btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
            <button type="submit" className="btn-primary">Add Vendor</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
