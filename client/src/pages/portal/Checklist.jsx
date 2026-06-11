import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import Modal from '../../components/ui/Modal'
import Input, { Select, Textarea } from '../../components/ui/Input'
import { PlusIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid'
import toast from 'react-hot-toast'
import { format, parseISO, isPast, isToday } from 'date-fns'

const CATEGORIES = ['All', 'Venue', 'Catering', 'Photography', 'Florals', 'Music', 'Attire', 'Beauty', 'Ceremony', 'Guests', 'Vendors', 'Travel', 'Legal', 'General']
const ADD_CATEGORIES = CATEGORIES.filter(c => c !== 'All')

export default function Checklist() {
  const { getCoupleAxios } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [showCompleted, setShowCompleted] = useState(true)
  const [form, setForm] = useState({ title: '', description: '', due_date: '', category: 'General' })
  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  const fetchItems = async () => {
    const r = await getCoupleAxios().get('/api/checklist/portal')
    setItems(r.data)
  }

  useEffect(() => { fetchItems().finally(() => setLoading(false)) }, [])

  const handleAdd = async (e) => {
    e.preventDefault()
    try {
      await getCoupleAxios().post('/api/checklist/portal', form)
      toast.success('Item added!'); setShowAdd(false); setForm({ title: '', description: '', due_date: '', category: 'General' }); fetchItems()
    } catch { toast.error('Failed to add item') }
  }

  const toggleComplete = async (item) => {
    await getCoupleAxios().put(`/api/checklist/${item.id}`, { completed: !item.completed })
    fetchItems()
  }

  const deleteItem = async (id) => {
    if (!confirm('Remove this item?')) return
    await getCoupleAxios().delete(`/api/checklist/${id}`)
    fetchItems()
  }

  const catItems = categoryFilter === 'All' ? items : items.filter(i => i.category === categoryFilter)
  const filtered = showCompleted ? catItems : catItems.filter(i => !i.completed)
  const completed = items.filter(i => i.completed).length
  const total = items.length
  const pct = total > 0 ? Math.round(completed / total * 100) : 0

  const dueBadge = (due_date, done) => {
    if (done || !due_date) return null
    const d = parseISO(due_date)
    if (isPast(d) && !isToday(d)) return <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">Overdue</span>
    if (isToday(d)) return <span className="text-xs bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full font-medium">Due today</span>
    return null
  }

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Planning Checklist</h1>
          <p className="page-subtitle">{completed} of {total} tasks complete · {pct}%</p>
        </div>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>
          <PlusIcon className="w-4 h-4" />
          Add Task
        </button>
      </div>

      {/* Progress bar */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-slate-700">Overall Progress</span>
          <span className="text-sm font-semibold text-rose-600">{pct}%</span>
        </div>
        <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-rose-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex gap-4 mt-3 text-xs text-slate-400">
          <span><span className="font-medium text-emerald-600">{completed}</span> completed</span>
          <span><span className="font-medium text-slate-600">{total - completed}</span> remaining</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 flex-wrap">
          {CATEGORIES.slice(0, 8).map(cat => (
            <button key={cat} onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${categoryFilter === cat ? 'bg-rose-600 text-white' : 'text-slate-500 hover:text-slate-700'}`}>
              {cat}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowCompleted(!showCompleted)}
          className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${!showCompleted ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:text-slate-700'}`}
        >
          {showCompleted ? 'Hide completed' : 'Show completed'}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-7 w-7 border-2 border-rose-200 border-t-rose-500" /></div>
      ) : (
        <div className="card overflow-hidden">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">No items in this category</div>
          ) : (
            <div className="divide-y divide-slate-50">
              {filtered.map(item => (
                <div key={item.id} className={`flex items-start gap-4 px-5 py-4 hover:bg-slate-50/50 transition-colors ${item.completed ? 'opacity-60' : ''}`}>
                  <button onClick={() => toggleComplete(item)} className="mt-0.5 flex-shrink-0">
                    {item.completed
                      ? <CheckCircleSolid className="w-5 h-5 text-emerald-500" />
                      : <CheckCircleIcon className="w-5 h-5 text-slate-300 hover:text-emerald-400 transition-colors" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-medium ${item.completed ? 'line-through text-slate-400' : 'text-slate-800'}`}>{item.title}</span>
                      <span className="text-xs bg-rose-50 text-rose-600 px-2 py-0.5 rounded-full">{item.category}</span>
                      {dueBadge(item.due_date, item.completed)}
                    </div>
                    {item.description && <p className="text-xs text-slate-400 mt-0.5">{item.description}</p>}
                    {item.due_date && !item.completed && (
                      <p className="text-xs text-slate-400 mt-1">Due {format(parseISO(item.due_date), 'MMMM d, yyyy')}</p>
                    )}
                  </div>
                  <button onClick={() => deleteItem(item.id)} className="text-xs text-slate-300 hover:text-red-400 transition-colors flex-shrink-0">Remove</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add Checklist Item">
        <form onSubmit={handleAdd} className="space-y-4">
          <Input label="Task" value={form.title} onChange={f('title')} required placeholder="What needs to be done?" />
          <Textarea label="Details (optional)" value={form.description} onChange={f('description')} placeholder="Notes, links, reminders..." rows={2} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Due Date" type="date" value={form.due_date} onChange={f('due_date')} />
            <Select label="Category" value={form.category} onChange={f('category')}>
              {ADD_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button type="button" className="btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
            <button type="submit" className="btn-primary">Add Task</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
