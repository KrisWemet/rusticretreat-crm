import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input, { Select, Textarea } from '../../components/ui/Input'
import { PlusIcon, ClipboardDocumentListIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid'
import toast from 'react-hot-toast'
import { format, parseISO, isPast, isToday } from 'date-fns'

export default function Tasks() {
  const { getAdminAxios } = useAuth()
  const [tasks, setTasks] = useState([])
  const [couples, setCouples] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('incomplete')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({
    title: '', description: '', assigned_to: '', couple_id: '',
    due_date: '', priority: 'medium'
  })

  const fetchData = async () => {
    const api = getAdminAxios()
    const [tasksRes, couplesRes] = await Promise.all([
      api.get('/api/tasks'),
      api.get('/api/couples')
    ])
    setTasks(tasksRes.data)
    setCouples(couplesRes.data)
  }

  useEffect(() => { fetchData().finally(() => setLoading(false)) }, [])

  const handleAdd = async (e) => {
    e.preventDefault()
    try {
      const api = getAdminAxios()
      await api.post('/api/tasks', { ...form, couple_id: form.couple_id || null })
      toast.success('Task created!')
      setShowAdd(false)
      setForm({ title: '', description: '', assigned_to: '', couple_id: '', due_date: '', priority: 'medium' })
      fetchData()
    } catch (err) {
      toast.error('Failed to create task')
    }
  }

  const toggleComplete = async (task) => {
    const api = getAdminAxios()
    await api.put(`/api/tasks/${task.id}`, { completed: !task.completed })
    fetchData()
  }

  const deleteTask = async (id) => {
    if (!confirm('Delete this task?')) return
    const api = getAdminAxios()
    await api.delete(`/api/tasks/${id}`)
    toast.success('Task deleted')
    fetchData()
  }

  const filtered = tasks.filter(t => {
    if (filter === 'incomplete') return !t.completed
    if (filter === 'completed') return t.completed
    return true
  })

  const getDueColor = (due_date, completed) => {
    if (completed) return 'text-gray-400'
    if (!due_date) return 'text-gray-500'
    const date = parseISO(due_date)
    if (isPast(date) && !isToday(date)) return 'text-red-600 font-medium'
    if (isToday(date)) return 'text-amber-600 font-medium'
    return 'text-gray-500'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
          <p className="text-gray-500 text-sm mt-1">
            {tasks.filter(t => !t.completed).length} incomplete tasks
          </p>
        </div>
        <Button onClick={() => setShowAdd(true)}>
          <PlusIcon className="w-4 h-4" />
          Add Task
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {[
          { key: 'incomplete', label: 'Incomplete' },
          { key: 'completed', label: 'Completed' },
          { key: 'all', label: 'All' }
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              filter === key ? 'bg-rose-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 py-16 text-center">
          <ClipboardDocumentListIcon className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400">No tasks found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(task => (
            <div
              key={task.id}
              className={`bg-white rounded-xl border border-gray-100 p-4 flex items-start gap-4 ${task.completed ? 'opacity-60' : ''}`}
            >
              <button onClick={() => toggleComplete(task)} className="mt-0.5 flex-shrink-0">
                {task.completed
                  ? <CheckCircleSolid className="w-5 h-5 text-emerald-500" />
                  : <CheckCircleIcon className="w-5 h-5 text-gray-300 hover:text-emerald-400 transition-colors" />
                }
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={`text-sm font-medium ${task.completed ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                    {task.title}
                  </p>
                  <Badge variant={task.priority}>{task.priority}</Badge>
                  {task.partner1_name && (
                    <span className="text-xs text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">
                      {task.partner1_name} & {task.partner2_name}
                    </span>
                  )}
                </div>
                {task.description && (
                  <p className="text-xs text-gray-400 mt-0.5">{task.description}</p>
                )}
                <div className="flex items-center gap-4 mt-1.5">
                  {task.assigned_to && (
                    <span className="text-xs text-gray-400">Assigned to: <span className="text-gray-600">{task.assigned_to}</span></span>
                  )}
                  {task.due_date && (
                    <span className={`text-xs ${getDueColor(task.due_date, task.completed)}`}>
                      Due: {format(parseISO(task.due_date), 'MMM d, yyyy')}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => deleteTask(task.id)}
                className="text-gray-300 hover:text-red-500 transition-colors text-xs"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add Task">
        <form onSubmit={handleAdd} className="space-y-4">
          <Input label="Task Title" value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))} required />
          <Textarea label="Description" value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Assigned To" value={form.assigned_to} onChange={e => setForm(f => ({...f, assigned_to: e.target.value}))} placeholder="Staff name" />
            <Input label="Due Date" type="date" value={form.due_date} onChange={e => setForm(f => ({...f, due_date: e.target.value}))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Priority" value={form.priority} onChange={e => setForm(f => ({...f, priority: e.target.value}))}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </Select>
            <Select label="Related Couple" value={form.couple_id} onChange={e => setForm(f => ({...f, couple_id: e.target.value}))}>
              <option value="">None</option>
              {couples.map(c => (
                <option key={c.id} value={c.id}>{c.partner1_name} & {c.partner2_name}</option>
              ))}
            </Select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button type="submit">Create Task</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
