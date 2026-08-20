import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import {
  PlusIcon, TrashIcon, PencilIcon, ClipboardDocumentCheckIcon,
  UserPlusIcon, EyeIcon, XMarkIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'

const FIELD_TYPES = [
  { value: 'text', label: 'Short text' },
  { value: 'textarea', label: 'Paragraph' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Dropdown' },
  { value: 'checkbox', label: 'Yes / No' },
]

const emptyForm = { title: '', description: '', fields: [] }

export default function Forms() {
  const { getAdminAxios } = useAuth()
  const api = getAdminAxios()
  const [forms, setForms] = useState([])
  const [couples, setCouples] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // null | 'new' | id
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [manage, setManage] = useState(null) // form being assigned/viewed
  const [assignments, setAssignments] = useState([])
  const [assignCouple, setAssignCouple] = useState('')
  const [viewing, setViewing] = useState(null) // { assignment, responses }

  function load() {
    Promise.all([api.get('/api/forms'), api.get('/api/couples')])
      .then(([f, c]) => { setForms(f.data); setCouples(c.data) })
      .catch(() => toast.error('Failed to load forms'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  function openNew() { setForm(emptyForm); setEditing('new') }
  async function openEdit(id) {
    const { data } = await api.get(`/api/forms/${id}`)
    setForm({
      title: data.title, description: data.description || '',
      fields: data.fields.map(f => ({
        label: f.label, field_type: f.field_type, required: !!f.required,
        options: f.options ? JSON.parse(f.options).join(', ') : '',
      })),
    })
    setEditing(id)
  }

  function addField() {
    setForm(f => ({ ...f, fields: [...f.fields, { label: '', field_type: 'text', required: false, options: '' }] }))
  }
  function setField(idx, patch) {
    setForm(f => ({ ...f, fields: f.fields.map((x, i) => i === idx ? { ...x, ...patch } : x) }))
  }
  function removeField(idx) { setForm(f => ({ ...f, fields: f.fields.filter((_, i) => i !== idx) })) }

  async function save() {
    if (!form.title) return toast.error('Add a form title')
    if (form.fields.length === 0) return toast.error('Add at least one question')
    setSaving(true)
    try {
      const payload = {
        title: form.title, description: form.description,
        fields: form.fields.map(f => ({
          label: f.label, field_type: f.field_type, required: f.required,
          options: f.field_type === 'select' && f.options ? f.options.split(',').map(s => s.trim()).filter(Boolean) : null,
        })),
      }
      if (editing === 'new') await api.post('/api/forms', payload)
      else await api.put(`/api/forms/${editing}`, payload)
      toast.success('Form saved')
      setEditing(null); load()
    } catch { toast.error('Failed to save form') }
    finally { setSaving(false) }
  }

  async function del(f) {
    if (!confirm(`Delete "${f.title}"? Responses will be lost.`)) return
    await api.delete(`/api/forms/${f.id}`); toast.success('Deleted'); load()
  }

  async function openManage(f) {
    setManage(f); setAssignCouple('')
    const { data } = await api.get(`/api/forms/${f.id}/assignments`)
    setAssignments(data)
  }
  async function assign() {
    if (!assignCouple) return
    try {
      await api.post(`/api/forms/${manage.id}/assign`, { couple_id: Number(assignCouple) })
      toast.success('Form assigned')
      const { data } = await api.get(`/api/forms/${manage.id}/assignments`)
      setAssignments(data); setAssignCouple(''); load()
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to assign') }
  }
  async function viewResponses(a) {
    const { data } = await api.get(`/api/forms/assignments/${a.id}/responses`)
    setViewing({ assignment: a, responses: data.responses })
  }

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Forms & Questionnaires</h1>
          <p className="page-subtitle">Collect event details from couples without the email back-and-forth</p>
        </div>
        <button onClick={openNew} className="btn-primary"><PlusIcon className="w-4 h-4" /> New Form</button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-7 w-7 border-2 border-rose-200 border-t-rose-500" /></div>
      ) : forms.length === 0 ? (
        <div className="card py-16 text-center">
          <ClipboardDocumentCheckIcon className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">No forms yet</p>
          <p className="text-xs text-slate-300 mt-1">Build a questionnaire and assign it to couples to gather their details.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {forms.map(f => (
            <div key={f.id} className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-800">{f.title}</h3>
                  {f.description && <p className="text-sm text-slate-500 mt-0.5">{f.description}</p>}
                  <div className="flex gap-3 text-xs text-slate-400 mt-2">
                    <span>{f.field_count} questions</span>
                    <span>·</span>
                    <span>{f.completed_count}/{f.assigned_count} completed</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => openEdit(f.id)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg" title="Edit"><PencilIcon className="w-4 h-4" /></button>
                  <button onClick={() => del(f)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Delete"><TrashIcon className="w-4 h-4" /></button>
                </div>
              </div>
              <button onClick={() => openManage(f)} className="btn-secondary w-full mt-4 text-sm"><UserPlusIcon className="w-4 h-4" /> Assign & View Responses</button>
            </div>
          ))}
        </div>
      )}

      {/* Builder */}
      {editing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
              <h2 className="font-semibold text-slate-800">{editing === 'new' ? 'New Form' : 'Edit Form'}</h2>
              <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label htmlFor="forms-form-title-1" className="label">Form Title</label>
                <input id="forms-form-title-1" name="forms-form-title-1" className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Event Details Questionnaire" />
              </div>
              <div>
                <label htmlFor="forms-description-2" className="label">Description</label>
                <textarea id="forms-description-2" name="forms-description-2" className="input" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Shown to the couple above the questions…" />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Questions</span>
                  <button onClick={addField} className="text-xs text-rose-600 hover:text-rose-700 font-medium flex items-center gap-1"><PlusIcon className="w-3.5 h-3.5" /> Add question</button>
                </div>
                {form.fields.map((field, idx) => (
                  <div key={idx} className="border border-slate-100 rounded-xl p-3 space-y-2 bg-slate-50/50">
                    <div className="flex gap-2">
                      <input className="input flex-1" value={field.label} onChange={e => setField(idx, { label: e.target.value })} placeholder="Question label" />
                      <select className="input w-36" value={field.field_type} onChange={e => setField(idx, { field_type: e.target.value })}>
                        {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                      <button onClick={() => removeField(idx)} className="text-slate-300 hover:text-red-500 px-1"><TrashIcon className="w-4 h-4" /></button>
                    </div>
                    {field.field_type === 'select' && (
                      <input className="input" value={field.options} onChange={e => setField(idx, { options: e.target.value })} placeholder="Options, comma-separated (e.g. Yes, No, Maybe)" />
                    )}
                    <label className="flex items-center gap-2 text-xs text-slate-500">
                      <input type="checkbox" checked={field.required} onChange={e => setField(idx, { required: e.target.checked })} className="w-3.5 h-3.5 accent-rose-600" />
                      Required
                    </label>
                  </div>
                ))}
                {form.fields.length === 0 && <p className="text-sm text-slate-300 text-center py-4">No questions yet — add your first above.</p>}
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setEditing(null)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={save} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : 'Save Form'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Assign & responses */}
      {manage && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">{manage.title}</h2>
              <button onClick={() => setManage(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex gap-2">
                <select className="input flex-1" value={assignCouple} onChange={e => setAssignCouple(e.target.value)}>
                  <option value="">Assign to couple…</option>
                  {couples.map(c => <option key={c.id} value={c.id}>{c.partner1_name} & {c.partner2_name}</option>)}
                </select>
                <button onClick={assign} className="btn-primary">Assign</button>
              </div>
              <div className="space-y-2">
                {assignments.length === 0 && <p className="text-sm text-slate-300 text-center py-4">Not assigned to anyone yet.</p>}
                {assignments.map(a => (
                  <div key={a.id} className="flex items-center justify-between border border-slate-100 rounded-lg px-3 py-2">
                    <div>
                      <div className="text-sm font-medium text-slate-700">{a.partner1_name} & {a.partner2_name}</div>
                      <div className="text-xs text-slate-400">
                        {a.status === 'completed' ? `Completed ${a.submitted_at ? format(parseISO(a.submitted_at), 'MMM d') : ''}` : 'Pending'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${a.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{a.status}</span>
                      {a.status === 'completed' && (
                        <button onClick={() => viewResponses(a)} className="p-1 text-slate-400 hover:text-slate-700" title="View responses"><EyeIcon className="w-4 h-4" /></button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Response viewer */}
      {viewing && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">{viewing.assignment.partner1_name} & {viewing.assignment.partner2_name}'s answers</h2>
              <button onClick={() => setViewing(null)} className="text-slate-400 hover:text-slate-600"><XMarkIcon className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-3">
              {viewing.responses.map((r, i) => (
                <div key={i}>
                  <div className="text-xs font-medium text-slate-400">{r.label}</div>
                  <div className="text-sm text-slate-800">{r.value || <span className="text-slate-300">No answer</span>}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
