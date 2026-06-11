import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input, { Textarea } from '../../components/ui/Input'
import { PlusIcon, BuildingStorefrontIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

export default function VendorsAdmin() {
  const { getAdminAxios } = useAuth()
  const [vendors, setVendors] = useState([])
  const [couples, setCouples] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({
    couple_id: '', vendor_type: '', business_name: '', contact_name: '',
    phone: '', email: '', website: '', notes: '', booked: false
  })

  const fetchData = async () => {
    const api = getAdminAxios()
    const [vendorsRes, couplesRes] = await Promise.all([
      api.get('/api/vendors'),
      api.get('/api/couples')
    ])
    setVendors(vendorsRes.data)
    setCouples(couplesRes.data)
  }

  useEffect(() => { fetchData().finally(() => setLoading(false)) }, [])

  const handleAdd = async (e) => {
    e.preventDefault()
    try {
      const api = getAdminAxios()
      await api.post(`/api/vendors/couple/${form.couple_id}`, form)
      toast.success('Vendor added!')
      setShowAdd(false)
      setForm({ couple_id: '', vendor_type: '', business_name: '', contact_name: '', phone: '', email: '', website: '', notes: '', booked: false })
      fetchData()
    } catch (err) {
      toast.error('Failed to add vendor')
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this vendor?')) return
    const api = getAdminAxios()
    await api.delete(`/api/vendors/${id}`)
    toast.success('Vendor deleted')
    fetchData()
  }

  // Group by couple
  const byCouple = vendors.reduce((acc, v) => {
    const key = v.couple_id
    if (!acc[key]) acc[key] = { name: `${v.partner1_name} & ${v.partner2_name}`, vendors: [] }
    acc[key].vendors.push(v)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vendor Directory</h1>
          <p className="text-gray-500 text-sm mt-1">{vendors.length} vendors across all couples</p>
        </div>
        <Button onClick={() => setShowAdd(true)}>
          <PlusIcon className="w-4 h-4" />
          Add Vendor
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-600" />
        </div>
      ) : Object.keys(byCouple).length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 py-16 text-center">
          <BuildingStorefrontIcon className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400">No vendors yet</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(byCouple).map(([coupleId, { name, vendors: coupleVendors }]) => (
            <div key={coupleId} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-50 bg-gray-50/50">
                <h2 className="font-semibold text-gray-900">{name}</h2>
              </div>
              <div className="divide-y divide-gray-50">
                {coupleVendors.map(vendor => (
                  <div key={vendor.id} className="px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-900">{vendor.business_name}</p>
                          <Badge variant={vendor.booked ? 'booked' : 'pending'}>
                            {vendor.booked ? 'Booked' : 'Considering'}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">{vendor.vendor_type}</p>
                        {vendor.contact_name && (
                          <p className="text-xs text-gray-500">Contact: {vendor.contact_name}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-right">
                      <div className="text-xs text-gray-400">
                        {vendor.phone && <p>{vendor.phone}</p>}
                        {vendor.email && <p>{vendor.email}</p>}
                      </div>
                      <button
                        onClick={() => handleDelete(vendor.id)}
                        className="text-xs text-red-400 hover:text-red-600"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add Vendor" size="lg">
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Couple</label>
              <select
                value={form.couple_id}
                onChange={e => setForm(f => ({...f, couple_id: e.target.value}))}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              >
                <option value="">Select couple...</option>
                {couples.map(c => (
                  <option key={c.id} value={c.id}>{c.partner1_name} & {c.partner2_name}</option>
                ))}
              </select>
            </div>
            <Input label="Vendor Type" value={form.vendor_type} onChange={e => setForm(f => ({...f, vendor_type: e.target.value}))} required placeholder="Photography, Catering..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Business Name" value={form.business_name} onChange={e => setForm(f => ({...f, business_name: e.target.value}))} required />
            <Input label="Contact Name" value={form.contact_name} onChange={e => setForm(f => ({...f, contact_name: e.target.value}))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Phone" value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))} />
            <Input label="Email" type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} />
          </div>
          <Input label="Website" value={form.website} onChange={e => setForm(f => ({...f, website: e.target.value}))} />
          <Textarea label="Notes" value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} />
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.booked} onChange={e => setForm(f => ({...f, booked: e.target.checked}))} className="rounded text-rose-600" />
            <span className="text-sm text-gray-700">Already booked</span>
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button type="submit">Add Vendor</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
