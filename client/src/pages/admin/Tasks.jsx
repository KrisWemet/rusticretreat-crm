import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import Modal from '../../components/ui/Modal'
import Input, { Select, Textarea } from '../../components/ui/Input'
import { PlusIcon, ClipboardDocumentListIcon } from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid'
import { CheckCircleIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { format, parseISO, isPast, isToday } from 'date-fns'

const priorityStyle = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-slate-100 text-slate-500',
}

const emptyForm = { title: '', description: '', assigned_to: '', couple_id: '', due_date: '', priority: 'medium' }

export default function Tasks() {
  const { getAdminAxios } = useAuth()
  const [tasks, setTasks] = useState([])
  const [couples, setCouples] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('incomplete')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  const fetchData = async () => {
    const api = getAdminAxios()
    const [tRes, cRes] = await Promise.all([api.get('/api/tasks'), api.get('/api/couples')])
    setTasks(tRes.data); setCouples(cRes.data)
  }

  useEffect(() => { fetchData().catch(() => {}).finally(() => setLoading(false)) }, [])

  const handleAdd = async (e) => {
    e.preventDefault()
    try {
      await getAdminAxios().post('/api/tasks', { ...form, couple_id: form.couple_id || null })
      toast.success('Task created!'); setShowAdd(false); setForm(emptyForm); fetchData()
    } catch { toast.error('Failed to create task') }
  }

  const toggleComplete = async (task) => {
    await getAdminAxios().put(`/api/tasks/${task.id}`, { completed: !task.completed })
    fetchData()
  }

  const deleteTask = async (id) => {
    if (!confirm('Delete this task?')) return
    await getAdminAxios().delete(`/api/tasks/${id}`)
    toast.success('Deleted'); fetchData()
  }

  const filtered = tasks.filter(t => {
    if (filter === 'incomplete') return !t.completed
    if (filter === 'completed') return t.completed
    return true
  })

  const dueClass = (due_date, completed) => {
    if (completed || !due_date) return 'text-slate-400'
    const d = parseISO(due_date)
    if (isPast(d) && !isToday(d)) return 'text-red-600 font-medium'
    if (isToday(d)) return 'text-amber-600 font-medium'
    return 'text-slate-400'
  }

  const incompleteCount = tasks.filter(t => !t.completed).length
  const overdueCount = tasks.filter(t => !t.completed && t.due_date && isPast(parseISO(t.due_date)) && !isToday(parseISO(t.due_date))).length

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Tasks</h1>
          <p className="page-subtitle">
            {incompleteCount} incomplete{overdueCount > 0 ? ` · ${overdueCount} overdue` : ''}
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>
          <PlusIcon className="w-4 h-4" />
          Add Task
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 w-fit">
        {[{ key: 'incomplete', label: 'Incomplete' }, { key: 'completed', label: 'Completed' }, { key: 'all', label: 'All' }].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${filter === key ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-7 w-7 border-2 border-rose-200 border-t-rose-600" /></div>
      ) : filtered.length === 0 ? (
        <div className="card py-16 text-center">
          <ClipboardDocumentListIcon className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400">{filter === 'incomplete' ? 'All caught up! No pending tasks.' : 'No tasks found'}</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="table">
            <thead>
              <tr>
                <th className="w-8"></th>
                <th>Task</th>
                <th>Priority</th>
                <th>Related Couple</th>
                <th>Assigned To</th>
                <th>Due Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(task => (
                <tr key={task.id} className={task.completed ? 'opacity-50' : ''}>
                  <td>
                    <button onClick={() => toggleComplete(task)}>
                      {task.completed
                        ? <CheckCircleSolid className="w-5 h-5 text-emerald-500" />
                        : <CheckCircleIcon className="w-5 h-5 text-slate-300 hover:text-emerald-400 transition-colors" />}
                    </button>
                  </td>
                  <td>
                    <div className={`font-medium text-slate-800 ${task.completed ? 'line-through text-slate-400' : ''}`}>{task.title}</div>
                    {task.description && <div className="text-xs text-slate-400 mt-0.5">{task.description}</div>}
                  </td>
                  <td>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${priorityStyle[task.priority]}`}>{task.priority}</span>
                  </td>
                  <td className="text-slate-500 text-xs">
                    {task.partner1_name ? `${task.partner1_name} & ${task.partner2_name}` : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="text-slate-500 text-xs">{task.assigned_to || <span className="text-slate-300">—</span>}</td>
                  <td className={`text-xs ${dueClass(task.due_date, task.completed)}`}>
                    {task.due_date ? format(parseISO(task.due_date), 'MMM d, yyyy') : <span className="text-slate-300">—</span>}
                  </td>
                  <td>
                    <button onClick={() => deleteTask(task.id)} className="text-xs text-slate-400 hover:text-red-500 transition-colors">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add Task">
        <form onSubmit={handleAdd} className="space-y-4">
          <Input label="Task Title" value={form.title} onChange={f('title')} required />
          <Textarea label="Description (optional)" value={form.description} onChange={f('description')} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Assigned To" value={form.assigned_to} onChange={f('assigned_to')} placeholder="Staff name" />
            <Input label="Due Date" type="date" value={form.due_date} onChange={f('due_date')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Priority" value={form.priority} onChange={f('priority')}>
              {['low','medium','high'].map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
            </Select>
            <Select label="Related Couple" value={form.couple_id} onChange={f('couple_id')}>
              <option value="">None</option>
              {couples.map(c => <option key={c.id} value={c.id}>{c.partner1_name} & {c.partner2_name}</option>)}
            </Select>
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button type="button" className="btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
            <button type="submit" className="btn-primary">Create Task</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
