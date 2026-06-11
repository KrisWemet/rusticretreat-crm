import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input, { Select, Textarea } from '../../components/ui/Input'
import { PlusIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid'
import toast from 'react-hot-toast'
import { format, parseISO, isPast, isToday } from 'date-fns'

const CATEGORIES = ['Venue', 'Catering', 'Photography', 'Florals', 'Music', 'Attire', 'Beauty', 'Ceremony', 'Guests', 'Vendors', 'Travel', 'Legal', 'General']

export default function Checklist() {
  const { getCoupleAxios } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [form, setForm] = useState({ title: '', description: '', due_date: '', category: 'General' })

  const fetchItems = async () => {
    const api = getCoupleAxios()
    const r = await api.get('/api/checklist/portal')
    setItems(r.data)
  }

  useEffect(() => { fetchItems().finally(() => setLoading(false)) }, [])

  const handleAdd = async (e) => {
    e.preventDefault()
    try {
      const api = getCoupleAxios()
      await api.post('/api/checklist/portal', form)
      toast.success('Item added!')
      setShowAdd(false)
      setForm({ title: '', description: '', due_date: '', category: 'General' })
      fetchItems()
    } catch (err) {
      toast.error('Failed to add item')
    }
  }

  const toggleComplete = async (item) => {
    const api = getCoupleAxios()
    await api.put(`/api/checklist/${item.id}`, { completed: !item.completed })
    fetchItems()
  }

  const deleteItem = async (id) => {
    const api = getCoupleAxios()
    await api.delete(`/api/checklist/${id}`)
    fetchItems()
  }

  const categories = ['All', ...new Set(items.map(i => i.category))]
  const filtered = categoryFilter === 'All' ? items : items.filter(i => i.category === categoryFilter)
  const completed = filtered.filter(i => i.completed).length

  const getDueBadge = (due_date, completed) => {
    if (completed || !due_date) return null
    const date = parseISO(due_date)
    if (isPast(date) && !isToday(date)) return <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Overdue</span>
    if (isToday(date)) return <span className="text-xs bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full">Due today</span>
    return null
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Planning Checklist</h1>
          <p className="text-gray-500 text-sm mt-1">{completed} of {filtered.length} completed</p>
        </div>
        <Button onClick={() => setShowAdd(true)}>
          <PlusIcon className="w-4 h-4" />
          Add Item
        </Button>
      </div>

      {/* Progress */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Overall Progress</span>
          <span className="text-sm text-gray-500">{filtered.length > 0 ? Math.round(completed / filtered.length * 100) : 0}%</span>
        </div>
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-rose-500 rounded-full transition-all duration-500"
            style={{ width: `${filtered.length > 0 ? completed / filtered.length * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 flex-wrap">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              categoryFilter === cat
                ? 'bg-rose-600 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-500" />
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => (
            <div
              key={item.id}
              className={`bg-white rounded-xl border border-gray-100 p-4 flex items-start gap-4 transition-all ${item.completed ? 'opacity-60' : ''}`}
            >
              <button onClick={() => toggleComplete(item)} className="mt-0.5 flex-shrink-0">
                {item.completed
                  ? <CheckCircleSolid className="w-5 h-5 text-emerald-500" />
                  : <CheckCircleIcon className="w-5 h-5 text-gray-300 hover:text-emerald-400 transition-colors" />
                }
              </button>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={`text-sm font-medium ${item.completed ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                    {item.title}
                  </p>
                  <span className="text-xs bg-rose-50 text-rose-600 px-2 py-0.5 rounded-full">{item.category}</span>
                  {getDueBadge(item.due_date, item.completed)}
                </div>
                {item.description && (
                  <p className="text-xs text-gray-400 mt-0.5">{item.description}</p>
                )}
                {item.due_date && (
                  <p className="text-xs text-gray-400 mt-1">
                    Due: {format(parseISO(item.due_date), 'MMMM d, yyyy')}
                  </p>
                )}
              </div>
              <button
                onClick={() => deleteItem(item.id)}
                className="text-xs text-gray-300 hover:text-red-400 transition-colors flex-shrink-0"
              >
                Remove
              </button>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-12 text-gray-400 text-sm">No items in this category</div>
          )}
        </div>
      )}

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add Checklist Item">
        <form onSubmit={handleAdd} className="space-y-4">
          <Input label="Task" value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))} required placeholder="What needs to be done?" />
          <Textarea label="Details" value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} placeholder="Optional notes" rows={2} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Due Date" type="date" value={form.due_date} onChange={e => setForm(f => ({...f, due_date: e.target.value}))} />
            <Select label="Category" value={form.category} onChange={e => setForm(f => ({...f, category: e.target.value}))}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button type="submit">Add Item</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
