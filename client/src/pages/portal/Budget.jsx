import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import Modal from '../../components/ui/Modal'
import Input, { Select, Textarea } from '../../components/ui/Input'
import { PlusIcon, CurrencyDollarIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const CATEGORIES = ['Venue', 'Catering', 'Photography', 'Videography', 'Flowers', 'Music', 'Attire', 'Beauty', 'Invitations', 'Cake', 'Rings', 'Transportation', 'Accommodation', 'Honeymoon', 'Miscellaneous']

const emptyForm = { category: '', description: '', estimated_cost: '', actual_cost: '', paid: false, vendor_name: '', notes: '' }

export default function Budget() {
  const { getCoupleAxios } = useAuth()
  const [items, setItems] = useState([])
  const [budgetTotal, setBudgetTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  const fetchData = async () => {
    const r = await getCoupleAxios().get('/api/budget/portal')
    setItems(r.data.items); setBudgetTotal(r.data.budget_total || 0)
  }

  useEffect(() => { fetchData().finally(() => setLoading(false)) }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const api = getCoupleAxios()
      const data = { ...form, estimated_cost: parseFloat(form.estimated_cost) || 0, actual_cost: parseFloat(form.actual_cost) || 0 }
      if (editItem) { await api.put(`/api/budget/${editItem.id}`, data); toast.success('Updated!') }
      else { await api.post('/api/budget/portal', data); toast.success('Item added!') }
      setShowAdd(false); setEditItem(null); setForm(emptyForm); fetchData()
    } catch { toast.error('Failed to save') }
  }

  const openEdit = (item) => {
    setEditItem(item)
    setForm({ category: item.category, description: item.description, estimated_cost: item.estimated_cost, actual_cost: item.actual_cost, paid: item.paid === 1, vendor_name: item.vendor_name || '', notes: item.notes || '' })
    setShowAdd(true)
  }

  const deleteItem = async (id) => {
    if (!confirm('Delete this item?')) return
    await getCoupleAxios().delete(`/api/budget/${id}`); fetchData()
  }

  const totalEstimated = items.reduce((s, i) => s + (i.estimated_cost || 0), 0)
  const totalActual = items.reduce((s, i) => s + (i.actual_cost || 0), 0)
  const totalPaid = items.filter(i => i.paid).reduce((s, i) => s + (i.actual_cost || 0), 0)
  const remaining = budgetTotal - totalActual
  const pct = budgetTotal > 0 ? Math.min(100, Math.round(totalActual / budgetTotal * 100)) : 0
  const over = totalActual > budgetTotal

  const byCategory = items.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = []
    acc[item.category].push(item)
    return acc
  }, {})

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Budget Tracker</h1>
          <p className="page-subtitle">{items.length} line items</p>
        </div>
        <button className="btn-primary" onClick={() => { setForm(emptyForm); setEditItem(null); setShowAdd(true) }}>
          <PlusIcon className="w-4 h-4" />
          Add Item
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-5"><p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Total Budget</p><p className="text-2xl font-bold text-slate-900 mt-1">${budgetTotal.toLocaleString()}</p></div>
        <div className="card p-5"><p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Estimated</p><p className="text-2xl font-bold text-blue-700 mt-1">${totalEstimated.toLocaleString()}</p></div>
        <div className="card p-5"><p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Actual Spend</p><p className="text-2xl font-bold text-rose-700 mt-1">${totalActual.toLocaleString()}</p></div>
        <div className={`rounded-xl border p-5 ${remaining >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Remaining</p>
          <p className={`text-2xl font-bold mt-1 ${remaining >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
            {remaining >= 0 ? '+' : ''}${Math.abs(remaining).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Progress */}
      {budgetTotal > 0 && (
        <div className="card p-5">
          <div className="flex justify-between text-sm mb-2">
            <span className="font-medium text-slate-700">Budget Used</span>
            <span className={`font-semibold ${over ? 'text-red-600' : 'text-slate-600'}`}>{pct}%{over ? ' — Over budget!' : ''}</span>
          </div>
          <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${over ? 'bg-red-500' : 'bg-rose-500'}`} style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between text-xs text-slate-400 mt-2">
            <span><span className="font-medium text-emerald-600">${totalPaid.toLocaleString()}</span> paid</span>
            <span><span className="font-medium text-slate-500">${(totalActual - totalPaid).toLocaleString()}</span> unpaid</span>
          </div>
        </div>
      )}

      {/* Items by category */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-7 w-7 border-2 border-rose-200 border-t-rose-500" /></div>
      ) : items.length === 0 ? (
        <div className="card py-16 text-center">
          <CurrencyDollarIcon className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400">No budget items yet. Add your first item above.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(byCategory).map(([category, catItems]) => (
            <div key={category} className="card overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-50 bg-slate-50/50 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800">{category}</h3>
                <span className="text-xs text-slate-500">
                  Actual <span className="font-semibold text-slate-700">${catItems.reduce((s, i) => s + (i.actual_cost || 0), 0).toLocaleString()}</span>
                  {' / '}Est <span className="font-semibold text-slate-600">${catItems.reduce((s, i) => s + (i.estimated_cost || 0), 0).toLocaleString()}</span>
                </span>
              </div>
              <table className="table">
                <thead><tr><th>Description</th><th>Vendor</th><th>Estimated</th><th>Actual</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {catItems.map(item => (
                    <tr key={item.id}>
                      <td>
                        <div className="font-medium text-slate-800">{item.description}</div>
                        {item.notes && <div className="text-xs text-slate-400 italic">{item.notes}</div>}
                      </td>
                      <td className="text-slate-500">{item.vendor_name || <span className="text-slate-300">—</span>}</td>
                      <td className="text-slate-600">${(item.estimated_cost || 0).toLocaleString()}</td>
                      <td className="font-medium text-slate-800">${(item.actual_cost || 0).toLocaleString()}</td>
                      <td>
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${item.paid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {item.paid ? 'Paid' : 'Unpaid'}
                        </span>
                      </td>
                      <td>
                        <div className="flex gap-2">
                          <button onClick={() => openEdit(item)} className="text-xs text-rose-600 hover:text-rose-700 font-medium">Edit</button>
                          <button onClick={() => deleteItem(item.id)} className="text-xs text-slate-400 hover:text-red-500">Del</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={showAdd} onClose={() => { setShowAdd(false); setEditItem(null) }} title={editItem ? 'Edit Budget Item' : 'Add Budget Item'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Select label="Category" value={form.category} onChange={f('category')} required>
              <option value="">Select category...</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
            <Input label="Description" value={form.description} onChange={f('description')} required placeholder="What is this for?" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Estimated Cost ($)" type="number" step="0.01" value={form.estimated_cost} onChange={f('estimated_cost')} placeholder="0.00" />
            <Input label="Actual Cost ($)" type="number" step="0.01" value={form.actual_cost} onChange={f('actual_cost')} placeholder="0.00" />
          </div>
          <Input label="Vendor Name (optional)" value={form.vendor_name} onChange={f('vendor_name')} placeholder="Who are you paying?" />
          <Textarea label="Notes" value={form.notes} onChange={f('notes')} rows={2} />
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" checked={form.paid} onChange={e => setForm(p => ({ ...p, paid: e.target.checked }))} className="w-4 h-4 rounded text-rose-600 border-slate-300" />
            <span className="text-sm text-slate-700">Already paid</span>
          </label>
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button type="button" className="btn-secondary" onClick={() => { setShowAdd(false); setEditItem(null) }}>Cancel</button>
            <button type="submit" className="btn-primary">{editItem ? 'Update' : 'Add'} Item</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
