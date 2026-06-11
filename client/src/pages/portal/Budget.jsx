import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input, { Select, Textarea } from '../../components/ui/Input'
import { PlusIcon, CurrencyDollarIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const CATEGORIES = ['Venue', 'Catering', 'Photography', 'Videography', 'Flowers', 'Music', 'Attire', 'Beauty', 'Invitations', 'Cake', 'Rings', 'Transportation', 'Accommodation', 'Honeymoon', 'Miscellaneous']

export default function Budget() {
  const { getCoupleAxios } = useAuth()
  const [items, setItems] = useState([])
  const [budgetTotal, setBudgetTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState({
    category: '', description: '', estimated_cost: '', actual_cost: '',
    paid: false, vendor_name: '', notes: ''
  })

  const fetchData = async () => {
    const api = getCoupleAxios()
    const r = await api.get('/api/budget/portal')
    setItems(r.data.items)
    setBudgetTotal(r.data.budget_total || 0)
  }

  useEffect(() => { fetchData().finally(() => setLoading(false)) }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const api = getCoupleAxios()
      const data = {
        ...form,
        estimated_cost: parseFloat(form.estimated_cost) || 0,
        actual_cost: parseFloat(form.actual_cost) || 0
      }
      if (editItem) {
        await api.put(`/api/budget/${editItem.id}`, data)
        toast.success('Item updated!')
      } else {
        await api.post('/api/budget/portal', data)
        toast.success('Item added!')
      }
      setShowAdd(false)
      setEditItem(null)
      resetForm()
      fetchData()
    } catch (err) {
      toast.error('Failed to save')
    }
  }

  const resetForm = () => setForm({ category: '', description: '', estimated_cost: '', actual_cost: '', paid: false, vendor_name: '', notes: '' })

  const openEdit = (item) => {
    setEditItem(item)
    setForm({ category: item.category, description: item.description, estimated_cost: item.estimated_cost, actual_cost: item.actual_cost, paid: item.paid === 1, vendor_name: item.vendor_name || '', notes: item.notes || '' })
    setShowAdd(true)
  }

  const deleteItem = async (id) => {
    if (!confirm('Delete this item?')) return
    const api = getCoupleAxios()
    await api.delete(`/api/budget/${id}`)
    fetchData()
  }

  const totalEstimated = items.reduce((s, i) => s + (i.estimated_cost || 0), 0)
  const totalActual = items.reduce((s, i) => s + (i.actual_cost || 0), 0)
  const totalPaid = items.filter(i => i.paid).reduce((s, i) => s + (i.actual_cost || 0), 0)
  const remaining = budgetTotal - totalActual

  // Group by category
  const byCategory = items.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = []
    acc[item.category].push(item)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Budget Tracker</h1>
          <p className="text-gray-500 text-sm mt-1">{items.length} line items</p>
        </div>
        <Button onClick={() => { resetForm(); setEditItem(null); setShowAdd(true) }}>
          <PlusIcon className="w-4 h-4" />
          Add Item
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total Budget</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">${budgetTotal.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Estimated</p>
          <p className="text-2xl font-bold text-blue-700 mt-1">${totalEstimated.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Actual Spend</p>
          <p className="text-2xl font-bold text-rose-700 mt-1">${totalActual.toLocaleString()}</p>
        </div>
        <div className={`rounded-xl border p-5 ${remaining >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Remaining</p>
          <p className={`text-2xl font-bold mt-1 ${remaining >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
            {remaining >= 0 ? '+' : ''}{remaining.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Budget progress */}
      {budgetTotal > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="font-medium text-gray-700">Budget Used</span>
            <span className="text-gray-500">{Math.min(100, Math.round(totalActual / budgetTotal * 100))}%</span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${totalActual > budgetTotal ? 'bg-red-500' : 'bg-rose-500'}`}
              style={{ width: `${Math.min(100, totalActual / budgetTotal * 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-1.5">
            <span>${totalPaid.toLocaleString()} paid</span>
            <span>${(totalActual - totalPaid).toLocaleString()} unpaid</span>
          </div>
        </div>
      )}

      {/* Items by category */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-500" />
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(byCategory).map(([category, categoryItems]) => (
            <div key={category} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-50 bg-gray-50/50 flex items-center justify-between">
                <h3 className="font-medium text-gray-900">{category}</h3>
                <span className="text-sm text-gray-500">
                  ${categoryItems.reduce((s, i) => s + (i.actual_cost || 0), 0).toLocaleString()} / ${categoryItems.reduce((s, i) => s + (i.estimated_cost || 0), 0).toLocaleString()}
                </span>
              </div>
              <div className="divide-y divide-gray-50">
                {categoryItems.map(item => (
                  <div key={item.id} className="px-5 py-3 flex items-center gap-4">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{item.description}</p>
                      {item.vendor_name && <p className="text-xs text-gray-400">{item.vendor_name}</p>}
                      {item.notes && <p className="text-xs text-gray-400 italic">{item.notes}</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">${(item.actual_cost || 0).toLocaleString()}</p>
                      <p className="text-xs text-gray-400">est. ${(item.estimated_cost || 0).toLocaleString()}</p>
                    </div>
                    <Badge variant={item.paid ? 'paid' : 'pending'}>
                      {item.paid ? 'Paid' : 'Unpaid'}
                    </Badge>
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(item)} className="text-xs text-rose-600 hover:text-rose-700">Edit</button>
                      <button onClick={() => deleteItem(item.id)} className="text-xs text-gray-400 hover:text-red-500">Del</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {items.length === 0 && (
            <div className="py-16 text-center">
              <CurrencyDollarIcon className="w-12 h-12 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400">No budget items yet</p>
            </div>
          )}
        </div>
      )}

      <Modal isOpen={showAdd} onClose={() => { setShowAdd(false); setEditItem(null) }}
        title={editItem ? 'Edit Budget Item' : 'Add Budget Item'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Select label="Category" value={form.category} onChange={e => setForm(f => ({...f, category: e.target.value}))} required>
              <option value="">Select category...</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
            <Input label="Description" value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Estimated Cost" type="number" step="0.01" value={form.estimated_cost} onChange={e => setForm(f => ({...f, estimated_cost: e.target.value}))} placeholder="0.00" />
            <Input label="Actual Cost" type="number" step="0.01" value={form.actual_cost} onChange={e => setForm(f => ({...f, actual_cost: e.target.value}))} placeholder="0.00" />
          </div>
          <Input label="Vendor" value={form.vendor_name} onChange={e => setForm(f => ({...f, vendor_name: e.target.value}))} placeholder="Vendor name (optional)" />
          <Textarea label="Notes" value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} rows={2} />
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.paid} onChange={e => setForm(f => ({...f, paid: e.target.checked}))} className="rounded text-rose-600" />
            <span className="text-sm text-gray-700">Already paid</span>
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => { setShowAdd(false); setEditItem(null) }}>Cancel</Button>
            <Button type="submit">{editItem ? 'Update' : 'Add'} Item</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
