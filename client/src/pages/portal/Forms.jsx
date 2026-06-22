import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import {
  ClipboardDocumentCheckIcon, CheckCircleIcon, ArrowLeftIcon,
} from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckSolid } from '@heroicons/react/24/solid'
import toast from 'react-hot-toast'

export default function Forms() {
  const { getCoupleAxios } = useAuth()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState(null) // { form, fields }
  const [answers, setAnswers] = useState({})
  const [submitting, setSubmitting] = useState(false)

  function load() {
    getCoupleAxios().get('/api/portal/forms')
      .then(r => setList(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  async function open(assignmentId) {
    const { data } = await getCoupleAxios().get(`/api/portal/forms/${assignmentId}`)
    const init = {}
    data.fields.forEach(f => { init[f.id] = f.value || '' })
    setAnswers(init)
    setActive(data)
  }

  async function submit() {
    // Validate required fields
    const missing = active.fields.filter(f => f.required && !String(answers[f.id] || '').trim())
    if (missing.length) return toast.error(`Please answer: ${missing[0].label}`)
    setSubmitting(true)
    try {
      await getCoupleAxios().post(`/api/portal/forms/${active.assignment.id}`, { answers })
      toast.success('Thank you — your answers were saved!')
      setActive(null); load()
    } catch { toast.error('Could not submit') }
    finally { setSubmitting(false) }
  }

  function renderField(f) {
    const val = answers[f.id] ?? ''
    const set = v => setAnswers(a => ({ ...a, [f.id]: v }))
    const base = 'w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500'
    switch (f.field_type) {
      case 'textarea': return <textarea rows={3} className={base + ' resize-none'} value={val} onChange={e => set(e.target.value)} />
      case 'number':   return <input type="number" className={base} value={val} onChange={e => set(e.target.value)} />
      case 'date':     return <input type="date" className={base} value={val} onChange={e => set(e.target.value)} />
      case 'select':   return (
        <select className={base} value={val} onChange={e => set(e.target.value)}>
          <option value="">Select…</option>
          {(f.options ? JSON.parse(f.options) : []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      )
      case 'checkbox': return (
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={val === 'Yes'} onChange={e => set(e.target.checked ? 'Yes' : 'No')} className="w-4 h-4 accent-rose-600" /> Yes
        </label>
      )
      default: return <input type="text" className={base} value={val} onChange={e => set(e.target.value)} />
    }
  }

  if (active) {
    return (
      <div className="p-6 max-w-2xl space-y-5">
        <button onClick={() => setActive(null)} className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1"><ArrowLeftIcon className="w-4 h-4" /> Back to forms</button>
        <div className="card p-6 space-y-5">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{active.form.title}</h1>
            {active.form.description && <p className="text-sm text-slate-500 mt-1">{active.form.description}</p>}
          </div>
          {active.fields.map(f => (
            <div key={f.id}>
              <label className="block text-sm font-medium text-slate-700 mb-1">{f.label}{f.required && <span className="text-red-500"> *</span>}</label>
              {renderField(f)}
            </div>
          ))}
          <button onClick={submit} disabled={submitting} className="btn-primary w-full">{submitting ? 'Saving…' : 'Submit Answers'}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      <div>
        <h1 className="page-title">Forms & Questionnaires</h1>
        <p className="page-subtitle">Help us prepare for your special weekend</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-7 w-7 border-2 border-rose-200 border-t-rose-500" /></div>
      ) : list.length === 0 ? (
        <div className="card py-16 text-center">
          <ClipboardDocumentCheckIcon className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">No forms to fill out right now</p>
          <p className="text-xs text-slate-300 mt-1">Your coordinator will send questionnaires here when they need details.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map(item => (
            <div key={item.assignment_id} className="card p-5 flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${item.status === 'completed' ? 'bg-emerald-100' : 'bg-rose-100'}`}>
                  {item.status === 'completed'
                    ? <CheckSolid className="w-5 h-5 text-emerald-600" />
                    : <ClipboardDocumentCheckIcon className="w-5 h-5 text-rose-600" />}
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">{item.title}</h3>
                  {item.description && <p className="text-sm text-slate-500 mt-0.5">{item.description}</p>}
                </div>
              </div>
              <button onClick={() => open(item.assignment_id)} className={item.status === 'completed' ? 'btn-secondary flex-shrink-0' : 'btn-primary flex-shrink-0'}>
                {item.status === 'completed' ? 'Review' : 'Fill out'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
