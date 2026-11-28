import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'

// The couple's plans and notes: one text, written by the couple in their portal
// and read (and edited) by staff on the Event plan tab. Printed on the event
// order. A save carries the version it started from, so if the other side
// saved in the meantime nothing is overwritten: their version is shown next to
// this one and the person chooses.

const when = (s) => {
  if (!s) return ''
  const d = new Date(String(s).replace(' ', 'T') + 'Z')
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function PlanNotes({ api, url, audience = 'couple', rows = 10, placeholder = '', saveLabel = 'Save notes' }) {
  const [saved, setSaved] = useState(null) // { text, updated_at, updated_by }
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [conflict, setConflict] = useState(null)

  useEffect(() => {
    api.get(url).then(r => { setSaved(r.data); setText(r.data.text) }).catch(() => setSaved({ text: '', updated_at: null, updated_by: null }))
  }, [api, url])

  const byLabel = (by) => {
    if (!by) return ''
    if (by === 'couple') return audience === 'couple' ? 'you' : 'the couple'
    return audience === 'couple' ? `${by} at Rustic Retreat` : by
  }

  const save = async () => {
    setSaving(true)
    try {
      const r = await api.put(url, { text, base_updated_at: saved?.updated_at || null })
      setSaved(r.data); setText(r.data.text); setConflict(null)
      toast.success('Notes saved')
    } catch (err) {
      if (err.response?.status === 409) setConflict(err.response.data.current)
      else toast.error(err.response?.data?.error || 'Could not save the notes')
    } finally { setSaving(false) }
  }

  if (!saved) return <p className="text-sm text-slate-400">Loading…</p>
  const id = `plan-notes-${audience}`
  return (
    <div>
      <label htmlFor={id} className="sr-only">Plans and notes</label>
      <textarea id={id} name={id} rows={rows} value={text} onChange={e => setText(e.target.value)}
        className="input-field resize-y leading-relaxed print:hidden" placeholder={placeholder} />
      <div className="hidden print:block whitespace-pre-wrap text-sm text-slate-800">{text || 'No notes yet.'}</div>
      {conflict && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4" role="alert">
          <p className="text-sm font-medium text-amber-900">
            {byLabel(conflict.updated_by) ? `${byLabel(conflict.updated_by)[0].toUpperCase()}${byLabel(conflict.updated_by).slice(1)} changed` : 'Someone changed'} these notes while you were editing{conflict.updated_at ? ` (${when(conflict.updated_at)})` : ''}. Nothing has been overwritten.
          </p>
          <p className="text-xs text-amber-800 mt-1">Their version is below. Copy anything you need from your own text above, then use theirs and add your changes back in.</p>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-white p-3 text-sm text-slate-700 border border-amber-100">{conflict.text || '(empty)'}</pre>
          <div className="mt-2 flex justify-end">
            <button type="button" className="btn-secondary" onClick={() => { setSaved(conflict); setText(conflict.text); setConflict(null) }}>Use their version</button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 mt-3 print:hidden">
        <p className="text-xs text-slate-400">
          {saved.updated_at ? `Last saved by ${byLabel(saved.updated_by)} · ${when(saved.updated_at)}` : 'Nothing saved yet'}
          {text !== saved.text && <span className="text-amber-600 font-medium"> · Unsaved changes</span>}
        </p>
        <button type="button" className="btn-primary" onClick={save} disabled={saving || !!conflict || text === saved.text}>{saving ? 'Saving…' : saveLabel}</button>
      </div>
    </div>
  )
}
