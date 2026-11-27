import { useEffect, useRef, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import { PlusIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../contexts/AuthContext'
import Modal from './ui/Modal'
import Input, { Textarea } from './ui/Input'

// Saved emails for Messages → "Use a template". {placeholders} are filled in
// from the couple's record when used; staff still read and edit before sending.

export default function EmailTemplatesSettings() {
  const { getAdminAxios } = useAuth()
  const api = useRef(getAdminAxios()).current
  const [templates, setTemplates] = useState([])
  const [placeholders, setPlaceholders] = useState({})
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', subject: '', body: '' })
  const bodyRef = useRef(null)

  const load = useCallback(async () => { setTemplates((await api.get('/api/email-templates')).data) }, [api])
  useEffect(() => {
    load().catch(() => toast.error('Could not load email templates'))
    api.get('/api/email-templates/placeholders').then(r => setPlaceholders(r.data)).catch(() => {})
  }, [api, load])

  const open = (t) => { setForm(t ? { name: t.name, subject: t.subject || '', body: t.body } : { name: '', subject: '', body: '' }); setEditing(t || 'new') }
  const save = async (e) => {
    e.preventDefault()
    try {
      if (editing === 'new') await api.post('/api/email-templates', form)
      else await api.put(`/api/email-templates/${editing.id}`, form)
      toast.success('Template saved'); setEditing(null); load()
    } catch (err) { toast.error(err.response?.data?.error || 'Could not save the template') }
  }
  const remove = async (t) => {
    if (!confirm(`Delete the template "${t.name}"?`)) return
    try { await api.delete(`/api/email-templates/${t.id}`); load() } catch { toast.error('Could not delete') }
  }
  // Put a placeholder where the cursor is in the message.
  const insert = (key) => {
    const el = bodyRef.current
    const token = `{${key}}`
    setForm(f => {
      const at = el ? el.selectionStart : f.body.length
      return { ...f, body: f.body.slice(0, at) + token + f.body.slice(el ? el.selectionEnd : at) }
    })
    setTimeout(() => el?.focus(), 0)
  }

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-800">Email templates</h2>
          <p className="text-sm text-slate-500">Reusable emails for Messages. Placeholders like {'{first_names}'} or {'{balance_owing}'} fill in from the couple’s record, and you review the email before it goes.</p>
        </div>
        <button className="btn-secondary whitespace-nowrap" onClick={() => open(null)}><PlusIcon className="w-4 h-4" /> New</button>
      </div>
      <ul className="divide-y divide-slate-100">
        {templates.map(t => (
          <li key={t.id} className="flex items-center gap-3 py-2.5">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-slate-800">{t.name}</div>
              <div className="text-xs text-slate-400 truncate">{t.subject || t.body.split('\n')[0]}</div>
            </div>
            <button className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg" onClick={() => open(t)} aria-label={`Edit ${t.name}`}><PencilIcon className="w-4 h-4" /></button>
            <button className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg" onClick={() => remove(t)} aria-label={`Delete ${t.name}`}><TrashIcon className="w-4 h-4" /></button>
          </li>
        ))}
        {templates.length === 0 && <li className="py-3 text-sm text-slate-400">No templates yet.</li>}
      </ul>

      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'New email template' : 'Edit email template'} size="lg">
        <form onSubmit={save} className="space-y-4">
          <Input label="Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required placeholder="e.g. After a tour" />
          <Input label="Subject" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} />
          <div className="space-y-1">
            <label htmlFor="tpl-body" className="block text-sm font-medium text-gray-700">Message</label>
            <textarea id="tpl-body" name="tpl-body" ref={bodyRef} rows={9} required className="input-field resize-y font-mono text-[13px]" value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-600 mb-1.5">Insert a placeholder</div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(placeholders).map(([k, label]) => (
                <button key={k} type="button" title={label} onClick={() => insert(k)} className="text-xs px-2 py-1 rounded-md bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-600 font-mono">{`{${k}}`}</button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
            <button type="submit" className="btn-primary">Save template</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
