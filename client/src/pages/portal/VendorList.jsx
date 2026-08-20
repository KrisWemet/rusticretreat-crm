import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input, { Textarea } from '../../components/ui/Input'
import { PlusIcon, BuildingStorefrontIcon, PhoneIcon, EnvelopeIcon, GlobeAltIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

export default function VendorList() {
  const { getCoupleAxios } = useAuth()
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editVendor, setEditVendor] = useState(null)
  const [form, setForm] = useState({
    vendor_type: '', business_name: '', contact_name: '',
    phone: '', email: '', website: '', notes: '', booked: false
  })

  const fetchVendors = async () => {
    const api = getCoupleAxios()
    const r = await api.get('/api/vendors/portal')
    setVendors(r.data)
  }

  useEffect(() => { fetchVendors().catch(() => {}).finally(() => setLoading(false)) }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const api = getCoupleAxios()
      if (editVendor) {
        await api.put(`/api/vendors/${editVendor.id}`, form)
        toast.success('Vendor updated!')
      } else {
        await api.post('/api/vendors/portal', form)
        toast.success('Vendor added!')
      }
      setShowAdd(false)
      setEditVendor(null)
      resetForm()
      fetchVendors()
    } catch (err) {
      toast.error('Failed to save vendor')
    }
  }

  const resetForm = () => setForm({
    vendor_type: '', business_name: '', contact_name: '',
    phone: '', email: '', website: '', notes: '', booked: false
  })

  const openEdit = (vendor) => {
    setEditVendor(vendor)
    setForm({
      vendor_type: vendor.vendor_type, business_name: vendor.business_name,
      contact_name: vendor.contact_name || '', phone: vendor.phone || '',
      email: vendor.email || '', website: vendor.website || '',
      notes: vendor.notes || '', booked: vendor.booked === 1
    })
    setShowAdd(true)
  }

  const deleteVendor = async (id) => {
    if (!confirm('Remove this vendor?')) return
    const api = getCoupleAxios()
    await api.delete(`/api/vendors/${id}`)
    fetchVendors()
  }

  // Group by type
  const byType = vendors.reduce((acc, v) => {
    if (!acc[v.vendor_type]) acc[v.vendor_type] = []
    acc[v.vendor_type].push(v)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vendors</h1>
          <p className="text-gray-500 text-sm mt-1">
            {vendors.filter(v => v.booked).length} booked · {vendors.filter(v => !v.booked).length} considering
          </p>
        </div>
        <Button onClick={() => { resetForm(); setEditVendor(null); setShowAdd(true) }}>
          <PlusIcon className="w-4 h-4" />
          Add Vendor
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-500" />
        </div>
      ) : vendors.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-xl border border-gray-100">
          <BuildingStorefrontIcon className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400">No vendors added yet</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(byType).map(([type, typeVendors]) => (
            <div key={type}>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">{type}</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {typeVendors.map(vendor => (
                  <div key={vendor.id} className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-gray-900">{vendor.business_name}</h3>
                        {vendor.contact_name && (
                          <p className="text-sm text-gray-500 mt-0.5">{vendor.contact_name}</p>
                        )}
                      </div>
                      <Badge variant={vendor.booked ? 'booked' : 'pending'}>
                        {vendor.booked ? 'Booked' : 'Considering'}
                      </Badge>
                    </div>
                    <div className="space-y-1.5">
                      {vendor.phone && (
                        <a href={`tel:${vendor.phone}`} className="flex items-center gap-2 text-sm text-gray-600 hover:text-rose-600">
                          <PhoneIcon className="w-4 h-4 text-gray-400" /> {vendor.phone}
                        </a>
                      )}
                      {vendor.email && (
                        <a href={`mailto:${vendor.email}`} className="flex items-center gap-2 text-sm text-gray-600 hover:text-rose-600">
                          <EnvelopeIcon className="w-4 h-4 text-gray-400" /> {vendor.email}
                        </a>
                      )}
                      {vendor.website && (
                        <a href={vendor.website.startsWith('http') ? vendor.website : `https://${vendor.website}`} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-gray-600 hover:text-rose-600">
                          <GlobeAltIcon className="w-4 h-4 text-gray-400" /> {vendor.website}
                        </a>
                      )}
                    </div>
                    {vendor.notes && (
                      <p className="text-xs text-gray-400 mt-3 bg-gray-50 p-2 rounded-lg">{vendor.notes}</p>
                    )}
                    <div className="flex gap-2 mt-3 pt-3 border-t border-gray-50">
                      <button onClick={() => openEdit(vendor)} className="text-xs text-rose-600 hover:text-rose-700">Edit</button>
                      <button onClick={() => deleteVendor(vendor.id)} className="text-xs text-gray-400 hover:text-red-500">Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={showAdd} onClose={() => { setShowAdd(false); setEditVendor(null) }}
        title={editVendor ? 'Edit Vendor' : 'Add Vendor'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Vendor Type" value={form.vendor_type} onChange={e => setForm(f => ({...f, vendor_type: e.target.value}))} required placeholder="Photography, Catering..." />
            <Input label="Business Name" value={form.business_name} onChange={e => setForm(f => ({...f, business_name: e.target.value}))} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Contact Name" value={form.contact_name} onChange={e => setForm(f => ({...f, contact_name: e.target.value}))} />
            <Input label="Phone" value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Email" type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} />
            <Input label="Website" value={form.website} onChange={e => setForm(f => ({...f, website: e.target.value}))} />
          </div>
          <Textarea label="Notes" value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} rows={2} />
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.booked} onChange={e => setForm(f => ({...f, booked: e.target.checked}))} className="rounded text-rose-600" />
            <span className="text-sm text-gray-700">Officially booked</span>
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => { setShowAdd(false); setEditVendor(null) }}>Cancel</Button>
            <Button type="submit">{editVendor ? 'Update' : 'Add'} Vendor</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
