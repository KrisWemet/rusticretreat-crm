import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'
import { PaperAirplaneIcon, LinkIcon } from '@heroicons/react/24/outline'
import Modal from './ui/Modal'
import FormFields from './FormFields'

const when = (s) => (s ? format(parseISO(String(s).replace(' ', 'T')), 'MMM d, yyyy h:mm a') : '')
const who = (s) => (s === 'website' ? 'the website' : s === 'couple' ? 'the couple (private link)' : s ? s.replace(/^staff: /, '') : '')

// Staff view of one couple's answers to a form: fill it in, correct it, or send
// the couple a private link to do it themselves.
export default function FillFormModal({ assignmentId, api, onClose, onSaved }) {
  const [data, setData] = useState(null)
  const [values, setValues] = useState({})
  const [saving, setSaving] = useState(false)
  const [link, setLink] = useState(null)

  useEffect(() => {
    if (!assignmentId) { setData(null); setLink(null); return }
    api.get(`/api/forms/assignments/${assignmentId}`).then(r => {
      setData(r.data)
      setValues(Object.fromEntries(r.data.fields.filter(f => f.value != null).map(f => [f.id, f.value])))
    }).catch(() => { toast.error('Could not load the form'); onClose() })
  }, [assignmentId])

  if (!assignmentId) return null

  const save = async (complete) => {
    setSaving(true)
    try {
      await api.put(`/api/forms/assignments/${assignmentId}/responses`, { answers: values, complete })
      toast.success(complete ? 'Answers saved' : 'Saved as in progress')
      onSaved?.(); onClose()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not save the answers')
    } finally { setSaving(false) }
  }

  const sendLink = async (send) => {
    try {
      const r = await api.post(`/api/forms/assignments/${assignmentId}/link`, { send })
      const url = `${window.location.origin}${r.data.path}`
      setLink({ url, sent: r.data.sent, to: r.data.sent_to, error: r.data.error })
      if (send && r.data.sent) toast.success(`Link emailed to ${r.data.sent_to}`)
      onSaved?.()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not create the link')
    }
  }

  const a = data?.assignment
  return (
    <Modal isOpen={!!assignmentId} onClose={onClose} title={data ? `${data.form.title}: ${a.partner1_name} & ${a.partner2_name}` : 'Form'} size="lg">
      {!data ? <p className="text-sm text-slate-400">Loading…</p> : (
        <div className="space-y-4">
          <div className="text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
            <span>Status: <strong className={a.status === 'completed' ? 'text-emerald-700' : 'text-amber-700'}>{a.status === 'completed' ? 'Completed' : 'Not completed'}</strong></span>
            {a.filled_by && <span>First filled in by {who(a.filled_by)}{a.submitted_at ? `, ${when(a.submitted_at)}` : ''}</span>}
            {a.updated_by && a.updated_at && <span>Last changed by {who(a.updated_by)}, {when(a.updated_at)}</span>}
          </div>
          {data.form.description && <p className="text-sm text-slate-500">{data.form.description}</p>}
          <FormFields fields={data.fields} values={values} onChange={setValues} />

          <div className="border border-slate-200 rounded-xl p-3 space-y-2">
            <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Ask the couple to fill it in</div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary text-xs" onClick={() => sendLink(true)}><PaperAirplaneIcon className="w-3.5 h-3.5" /> Email them a private link</button>
              <button type="button" className="btn-secondary text-xs" onClick={() => sendLink(false)}><LinkIcon className="w-3.5 h-3.5" /> Just get the link</button>
            </div>
            {link && (
              <div className="text-xs space-y-1">
                {link.sent ? <p className="text-emerald-700">Emailed to {link.to}.</p> : <p className="text-amber-700">{link.error && link.error !== 'Not sent' ? `Email not sent (${link.error}). ` : ''}Copy the link below and send it yourself.</p>}
                <div className="flex gap-2">
                  <input readOnly value={link.url} className="input-field text-xs flex-1" onFocus={e => e.target.select()} aria-label="Private form link" />
                  <button type="button" className="btn-secondary text-xs" onClick={() => { navigator.clipboard?.writeText(link.url); toast.success('Link copied') }}>Copy</button>
                </div>
                <p className="text-slate-400">The link works for 60 days. Sending a new one replaces it.</p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="button" className="btn-secondary" disabled={saving} onClick={() => save(false)}>Save for later</button>
            <button type="button" className="btn-primary" disabled={saving} onClick={() => save(true)}>{saving ? 'Saving…' : 'Save answers'}</button>
          </div>
        </div>
      )}
    </Modal>
  )
}
