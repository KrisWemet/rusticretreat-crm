import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import Modal from '../../components/ui/Modal'
import Input, { Select, Textarea } from '../../components/ui/Input'
import { PlusIcon, ClipboardDocumentListIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid'
import { CheckCircleIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { format, parseISO, isPast, isToday, addDays } from 'date-fns'
import { TASK_TITLES, DUE_IN, withCurrent } from '../../utils/options'

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
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('incomplete')
  const [showAdd, setShowAdd] = useState(false)
  // null = adding a new task; otherwise the id of the task being edited
  const [editingId, setEditingId] = useState(null)
  const [coupleFilter, setCoupleFilter] = useState('')
  const [search, setSearch] = useState('')
  const [loadError, setLoadError] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  const fetchData = async () => {
    const api = getAdminAxios()
    const [tRes, cRes, sRes] = await Promise.all([api.get('/api/tasks'), api.get('/api/couples'), api.get('/api/auth/staff')])
    setTasks(tRes.data); setCouples(cRes.data); setStaff(sRes.data)
  }

  useEffect(() => {
    fetchData()
      .then(() => setLoadError(null))
      .catch(err => setLoadError(err.response?.data?.error || 'Could not load tasks'))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openAdd = () => { setEditingId(null); setForm(emptyForm); setShowAdd(true) }
  const openEdit = (t) => {
    setEditingId(t.id)
    setForm({ title: t.title || '', description: t.description || '', assigned_to: t.assigned_to || '',
      couple_id: t.couple_id ? String(t.couple_id) : '', due_date: t.due_date || '', priority: t.priority || 'medium' })
    setShowAdd(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    try {
      const body = { ...form, couple_id: form.couple_id || null, due_date: form.due_date || null }
      if (editingId) await getAdminAxios().put(`/api/tasks/${editingId}`, body)
      else await getAdminAxios().post('/api/tasks', body)
      toast.success(editingId ? 'Task updated' : 'Task created!')
      setShowAdd(false); setForm(emptyForm); setEditingId(null); fetchData()
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to save the task') }
  }

  const toggleComplete = async (task) => {
    try {
      await getAdminAxios().put(`/api/tasks/${task.id}`, { completed: !task.completed })
      fetchData()
    } catch (err) { toast.error(err.response?.data?.error || 'Could not update the task') }
  }

  const deleteTask = async (id) => {
    if (!confirm('Delete this task?')) return
    try {
      await getAdminAxios().delete(`/api/tasks/${id}`)
      toast.success('Deleted'); fetchData()
    } catch (err) { toast.error(err.response?.data?.error || 'Could not delete the task') }
  }

  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const q = search.trim().toLowerCase()
  const filtered = tasks.filter(t => {
    if (filter === 'incomplete' && t.completed) return false
    if (filter === 'completed' && !t.completed) return false
    if (filter === 'today' && (t.completed || t.due_date !== todayStr)) return false
    if (filter === 'overdue' && (t.completed || !t.due_date || t.due_date >= todayStr)) return false
    if (coupleFilter && String(t.couple_id) !== coupleFilter) return false
    if (q && !`${t.title} ${t.description || ''} ${t.partner1_name || ''} ${t.partner2_name || ''}`.toLowerCase().includes(q)) return false
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
  const overdueCount = tasks.filter(t => !t.completed && t.due_date && t.due_date < todayStr).length

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Tasks</h1>
          <p className="page-subtitle">
            {incompleteCount} incomplete{overdueCount > 0 ? ` · ${overdueCount} overdue` : ''}
          </p>
        </div>
        <button className="btn-primary" onClick={openAdd}>
          <PlusIcon className="w-4 h-4" />
          Add Task
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 overflow-x-auto max-w-full">
          {[{ key: 'incomplete', label: 'To do' }, { key: 'today', label: 'Due today' }, { key: 'overdue', label: `Overdue${overdueCount ? ` (${overdueCount})` : ''}` }, { key: 'completed', label: 'Done' }, { key: 'all', label: 'All' }].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${filter === key ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <select aria-label="Filter by couple" value={coupleFilter} onChange={e => setCoupleFilter(e.target.value)} className="input-field w-full sm:w-56">
          <option value="">All couples</option>
          {couples.map(c => <option key={c.id} value={c.id}>{c.partner1_name} & {c.partner2_name}</option>)}
        </select>
        <div className="relative flex-1 min-w-[10rem]">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="search" aria-label="Search tasks" placeholder="Search tasks…" value={search} onChange={e => setSearch(e.target.value)} className="input-field pl-9" />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-7 w-7 border-2 border-rose-200 border-t-rose-600" /></div>
      ) : loadError ? (
        <div className="card py-10 text-center text-sm text-red-600">{loadError}</div>
      ) : filtered.length === 0 ? (
        <div className="card py-16 text-center">
          <ClipboardDocumentListIcon className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400">{filter === 'incomplete' ? 'All caught up! No pending tasks.' : 'No tasks found'}</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
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
                    <button onClick={() => toggleComplete(task)} aria-label={task.completed ? 'Mark not done' : 'Mark done'}>
                      {task.completed
                        ? <CheckCircleSolid className="w-5 h-5 text-emerald-500" />
                        : <CheckCircleIcon className="w-5 h-5 text-slate-300 hover:text-emerald-400 transition-colors" />}
                    </button>
                  </td>
                  <td>
                    <button onClick={() => openEdit(task)} className={`text-left font-medium text-slate-800 hover:text-rose-600 ${task.completed ? 'line-through text-slate-400' : ''}`}>{task.title}</button>
                    {task.description && <div className="text-xs text-slate-400 mt-0.5">{task.description}</div>}
                  </td>
                  <td>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${priorityStyle[task.priority]}`}>{task.priority}</span>
                  </td>
                  <td className="text-slate-500 text-xs">
                    {task.partner1_name
                      ? <Link to={`/clients/${task.couple_id}`} className="hover:text-rose-600 hover:underline">{task.partner1_name} & {task.partner2_name}</Link>
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="text-slate-500 text-xs">{task.assigned_to || <span className="text-slate-300">—</span>}</td>
                  <td className={`text-xs ${dueClass(task.due_date, task.completed)}`}>
                    {task.due_date ? format(parseISO(task.due_date), 'MMM d, yyyy') : <span className="text-slate-300">—</span>}
                  </td>
                  <td>
                    <div className="flex gap-3 whitespace-nowrap">
                      <button onClick={() => openEdit(task)} className="text-xs text-slate-400 hover:text-slate-700 transition-colors">Edit</button>
                      <button onClick={() => deleteTask(task.id)} className="text-xs text-slate-400 hover:text-red-500 transition-colors">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title={editingId ? 'Edit Task' : 'Add Task'}>
        <form onSubmit={handleSave} className="space-y-4">
          <Input label="Task Title" value={form.title} onChange={f('title')} required list="task-title-options" placeholder="Pick a common follow-up or type your own" />
          <datalist id="task-title-options">
            {TASK_TITLES.map(t => <option key={t} value={t} />)}
          </datalist>
          <Select label="Related Couple" value={form.couple_id} onChange={f('couple_id')}>
            <option value="">None</option>
            {couples.map(c => <option key={c.id} value={c.id}>{c.partner1_name} & {c.partner2_name}</option>)}
          </Select>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Due Date" type="date" value={form.due_date} onChange={f('due_date')} />
            <Select label="Due in" value="" onChange={e => e.target.value !== '' && setForm(p => ({ ...p, due_date: format(addDays(new Date(), Number(e.target.value)), 'yyyy-MM-dd') }))}>
              <option value="">Pick a shortcut...</option>
              {DUE_IN.map(d => <option key={d.label} value={d.days}>{d.label}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select label="Assigned To" value={form.assigned_to} onChange={f('assigned_to')}>
              <option value="">Unassigned</option>
              {withCurrent(staff.map(u => u.name), form.assigned_to).map(n => <option key={n} value={n}>{n}</option>)}
            </Select>
            <Select label="Priority" value={form.priority} onChange={f('priority')}>
              {['low','medium','high'].map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
            </Select>
          </div>
          <Textarea label="Description (optional)" value={form.description} onChange={f('description')} />
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button type="button" className="btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
            <button type="submit" className="btn-primary">{editingId ? 'Save Task' : 'Create Task'}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
