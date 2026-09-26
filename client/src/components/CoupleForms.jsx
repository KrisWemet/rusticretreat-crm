import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'
import { PencilIcon, PlusIcon } from '@heroicons/react/24/outline'
import FillFormModal from './FillFormModal'

const when = (s) => (s ? format(parseISO(String(s).replace(' ', 'T')), 'MMM d, yyyy') : '')
const source = (a) => a.filled_by === 'website' ? 'From the website'
  : a.filled_by === 'couple' ? 'Filled in by the couple'
  : a.filled_by ? `Entered by ${a.filled_by.replace(/^staff: /, '')}` : a.link_sent_at ? `Link sent ${when(a.link_sent_at)}` : 'Not filled in yet'

// Every form a couple has on their client page: website enquiries and booking
// requests, and any form staff gave them. Staff can open any of them to fill
// in, correct, or send a private link, and add another form.
export default function CoupleForms({ coupleId, api }) {
  const [items, setItems] = useState([])
  const [forms, setForms] = useState([])
  const [pick, setPick] = useState('')
  const [open, setOpen] = useState(null)

  const load = () => api.get(`/api/forms/couple/${coupleId}`).then(r => setItems(r.data)).catch(() => {})
  useEffect(() => {
    load()
    api.get('/api/forms').then(r => setForms(r.data.filter(f => f.is_active && !f.system_key))).catch(() => {})
  }, [coupleId])

  const add = async () => {
    if (!pick) return
    try {
      const r = await api.post(`/api/forms/${pick}/assign`, { couple_id: Number(coupleId) })
      setPick(''); await load(); setOpen(r.data.id)
    } catch (err) {
      // Already given to this couple: open the one they have.
      if (err.response?.status === 409 && err.response.data?.assignment_id) { setPick(''); setOpen(err.response.data.assignment_id) }
      else toast.error(err.response?.data?.error || 'Could not add the form')
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h2 className="font-semibold text-gray-900">Forms</h2>
        <div className="flex gap-2">
          <select aria-label="Choose a form to add" value={pick} onChange={e => setPick(e.target.value)} className="input-field text-sm py-1.5 w-56">
            <option value="">Add a form…</option>
            {forms.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}
          </select>
          <button type="button" onClick={add} disabled={!pick} className="btn-secondary text-sm py-1.5 disabled:opacity-50"><PlusIcon className="w-4 h-4" /> Add</button>
        </div>
      </div>
      {items.length === 0 ? <p className="text-sm text-gray-400">No forms yet.</p> : (
        <div className="divide-y divide-gray-100">
          {items.map(a => (
            <div key={a.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-gray-800 truncate">{a.title}</div>
                <div className="text-xs text-gray-400">{source(a)}{a.submitted_at ? ` · ${when(a.submitted_at)}` : ''}{a.updated_by && a.updated_by !== a.filled_by ? ` · edited by ${a.updated_by.replace(/^staff: /, '')}` : ''}</div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${a.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{a.status === 'completed' ? 'Completed' : 'Pending'}</span>
              <button type="button" onClick={() => setOpen(a.id)} className="btn-ghost py-1 px-2 text-xs" aria-label={`Open ${a.title}`}><PencilIcon className="w-3.5 h-3.5" /> Open</button>
            </div>
          ))}
        </div>
      )}
      <FillFormModal assignmentId={open} api={api} onClose={() => setOpen(null)} onSaved={load} />
    </div>
  )
}
