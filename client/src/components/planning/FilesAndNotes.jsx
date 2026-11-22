import { useEffect, useRef, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import { ArrowUpTrayIcon, DocumentIcon, TrashIcon, PencilIcon, PhoneIcon, EnvelopeIcon, UsersIcon, MapPinIcon, ChatBubbleLeftEllipsisIcon } from '@heroicons/react/24/outline'
import { BookmarkIcon as PinSolid } from '@heroicons/react/24/solid'
import { BookmarkIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../../contexts/AuthContext'
import { openFile, downloadFile } from '../../utils/files'

// Files kept on the couple (licences, insurance certificates, layouts) and a
// dated notes log of calls, meetings and visits.

const KIND = {
  note: { label: 'Note', icon: ChatBubbleLeftEllipsisIcon }, call: { label: 'Call', icon: PhoneIcon },
  email: { label: 'Email', icon: EnvelopeIcon }, meeting: { label: 'Meeting', icon: UsersIcon }, visit: { label: 'Site visit', icon: MapPinIcon },
}
const INLINE = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif']
const size = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)
const when = (s) => (s ? new Date(String(s).replace(' ', 'T') + (String(s).includes('Z') ? '' : 'Z')).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' }) : '')

export default function FilesAndNotes({ coupleId }) {
  const { getAdminAxios } = useAuth()
  const api = useRef(getAdminAxios()).current
  const [files, setFiles] = useState(null)
  const [categories, setCategories] = useState([])
  const [category, setCategory] = useState('Other')
  const [uploading, setUploading] = useState(false)
  const [notes, setNotes] = useState(null)
  const [draft, setDraft] = useState({ body: '', kind: 'note' })
  const [editId, setEditId] = useState(null)
  const [editBody, setEditBody] = useState('')
  const fileInput = useRef(null)

  const load = useCallback(async () => {
    const [f, n] = await Promise.all([api.get(`/api/couple-files/couple/${coupleId}`), api.get(`/api/notes/couple/${coupleId}`)])
    setFiles(f.data); setNotes(n.data)
  }, [api, coupleId])
  useEffect(() => {
    load().catch(() => toast.error('Could not load files and notes'))
    api.get('/api/couple-files/categories').then(r => setCategories(r.data)).catch(() => {})
  }, [api, load])

  const upload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append('category', category)
    fd.append('file', file)
    setUploading(true)
    try { await api.post(`/api/couple-files/couple/${coupleId}`, fd); toast.success('File uploaded'); load() }
    catch (err) { toast.error(err.response?.data?.error || 'Could not upload the file') }
    finally { setUploading(false); if (fileInput.current) fileInput.current.value = '' }
  }

  const open = async (f) => {
    try {
      if (INLINE.includes(f.mime_type)) await openFile(api, `/api/couple-files/${f.id}`)
      else await downloadFile(api, `/api/couple-files/${f.id}`, f.filename)
    } catch { toast.error('Could not open the file') }
  }
  const removeFile = async (f) => {
    if (!confirm(`Delete ${f.filename}?`)) return
    try { await api.delete(`/api/couple-files/${f.id}`); load() } catch { toast.error('Could not delete the file') }
  }

  const addNote = async (e) => {
    e.preventDefault()
    if (!draft.body.trim()) return
    try { await api.post(`/api/notes/couple/${coupleId}`, draft); setDraft({ body: '', kind: draft.kind }); load() }
    catch (err) { toast.error(err.response?.data?.error || 'Could not save the note') }
  }
  const updateNote = async (n, patch) => {
    try { await api.put(`/api/notes/${n.id}`, patch); setEditId(null); load() } catch (err) { toast.error(err.response?.data?.error || 'Could not update the note') }
  }
  const removeNote = async (n) => {
    if (!confirm('Delete this note?')) return
    try { await api.delete(`/api/notes/${n.id}`); load() } catch { toast.error('Could not delete the note') }
  }

  if (!files || !notes) return <div className="card p-6 text-sm text-slate-400">Loading…</div>

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      <div className="card p-6">
        <h2 className="font-semibold text-slate-900 mb-1">Files</h2>
        <p className="text-xs text-slate-500 mb-4">PDFs, photos, Word, Excel or CSV up to 15 MB. Kept with the couple’s record and in every backup; staff only.</p>
        <div className="flex flex-wrap items-end gap-2 mb-4">
          <div className="space-y-1">
            <label htmlFor="file-category" className="block text-xs font-medium text-slate-600">Kind of file</label>
            <select id="file-category" name="file-category" className="input-field w-48" value={category} onChange={e => setCategory(e.target.value)}>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <label className={`btn-primary cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
            <ArrowUpTrayIcon className="w-4 h-4" /> {uploading ? 'Uploading…' : 'Upload a file'}
            <input ref={fileInput} id="file-upload" name="file-upload" type="file" className="sr-only" onChange={upload}
              accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.gif,.docx,.xlsx,.csv,.txt" />
          </label>
        </div>
        {files.length === 0 ? <p className="text-sm text-slate-400">No files yet.</p> : (
          <ul className="divide-y divide-slate-100">
            {files.map(f => (
              <li key={f.id} className="flex items-center gap-3 py-2.5">
                <DocumentIcon className="w-5 h-5 text-slate-400 flex-shrink-0" />
                <button className="flex-1 min-w-0 text-left" onClick={() => open(f)}>
                  <div className="text-sm font-medium text-slate-800 truncate hover:text-rose-600">{f.filename}</div>
                  <div className="text-xs text-slate-400">{f.category || 'Other'} · {size(f.size)} · {when(f.uploaded_at)}{f.uploaded_by ? ` · ${f.uploaded_by}` : ''}</div>
                </button>
                <button className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg" onClick={() => removeFile(f)} aria-label={`Delete ${f.filename}`}><TrashIcon className="w-4 h-4" /></button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card p-6">
        <h2 className="font-semibold text-slate-900 mb-1">Notes</h2>
        <p className="text-xs text-slate-500 mb-4">A dated log of calls, emails, meetings and visits. Pin the ones the team must not miss.</p>
        <form onSubmit={addNote} className="space-y-2 mb-5">
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Kind of note">
            {Object.entries(KIND).map(([k, v]) => (
              <button key={k} type="button" role="radio" aria-checked={draft.kind === k} onClick={() => setDraft(d => ({ ...d, kind: k }))}
                className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border ${draft.kind === k ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                <v.icon className="w-3.5 h-3.5" /> {v.label}
              </button>
            ))}
          </div>
          <label htmlFor="note-body" className="sr-only">Note</label>
          <textarea id="note-body" name="note-body" rows={3} className="input-field resize-y" value={draft.body}
            onChange={e => setDraft(d => ({ ...d, body: e.target.value }))} placeholder="What was said or agreed?" />
          <div className="flex justify-end"><button type="submit" className="btn-primary" disabled={!draft.body.trim()}>Add note</button></div>
        </form>
        {notes.length === 0 ? <p className="text-sm text-slate-400">No notes yet.</p> : (
          <ul className="space-y-3">
            {notes.map(n => {
              const K = KIND[n.kind] || KIND.note
              return (
                <li key={n.id} className={`rounded-lg border p-3 ${n.pinned ? 'border-amber-200 bg-amber-50/60' : 'border-slate-100'}`}>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <K.icon className="w-4 h-4" /> <span className="font-medium text-slate-700">{K.label}</span>
                    <span>· {when(n.created_at)}{n.author ? ` · ${n.author}` : ''}{n.updated_at ? ' · edited' : ''}</span>
                    <div className="flex-1" />
                    <button onClick={() => updateNote(n, { pinned: !n.pinned })} aria-label={n.pinned ? 'Unpin note' : 'Pin note'} className="p-1 hover:bg-slate-100 rounded">
                      {n.pinned ? <PinSolid className="w-4 h-4 text-amber-500" /> : <BookmarkIcon className="w-4 h-4" />}
                    </button>
                    <button onClick={() => { setEditId(n.id); setEditBody(n.body) }} aria-label="Edit note" className="p-1 hover:bg-slate-100 rounded"><PencilIcon className="w-4 h-4" /></button>
                    <button onClick={() => removeNote(n)} aria-label="Delete note" className="p-1 hover:bg-red-50 hover:text-red-600 rounded"><TrashIcon className="w-4 h-4" /></button>
                  </div>
                  {editId === n.id ? (
                    <div className="mt-2 space-y-2">
                      <label htmlFor={`note-edit-${n.id}`} className="sr-only">Edit note</label>
                      <textarea id={`note-edit-${n.id}`} rows={3} className="input-field resize-y" value={editBody} onChange={e => setEditBody(e.target.value)} />
                      <div className="flex justify-end gap-2">
                        <button className="btn-secondary" onClick={() => setEditId(null)}>Cancel</button>
                        <button className="btn-primary" onClick={() => updateNote(n, { body: editBody })} disabled={!editBody.trim()}>Save</button>
                      </div>
                    </div>
                  ) : <p className="text-sm text-slate-800 mt-1.5 whitespace-pre-wrap">{n.body}</p>}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
