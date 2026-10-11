import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import Modal from './ui/Modal'
import Input from './ui/Input'

// "Mark as done" for something handled outside the CRM — a phone call, a
// text, an email from your own inbox. Both the note and the date are optional;
// the date defaults to today. What's entered shows in the couple's history.
//
// `target` is null (closed) or { title, subject, save } where save({ note,
// done_on }) makes the request and returns a promise.
export default function MarkDoneModal({ target, onClose, onDone }) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const [note, setNote] = useState('')
  const [doneOn, setDoneOn] = useState(today)
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (target) { setNote(''); setDoneOn(format(new Date(), 'yyyy-MM-dd')) } }, [target])

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await target.save({ note: note.trim() || null, done_on: doneOn || today })
      toast.success('Marked as done')
      onClose()
      onDone?.()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not mark it done')
    } finally { setSaving(false) }
  }

  return (
    <Modal isOpen={!!target} onClose={onClose} title={target?.title || 'Mark as done'} size="sm">
      <form onSubmit={submit} className="space-y-4">
        {target?.subject && <p className="text-sm text-gray-600">{target.subject}</p>}
        <Input label="What did you do? (optional)" value={note} onChange={e => setNote(e.target.value)}
          placeholder="e.g. Called them, emailed from Gmail" maxLength={500} autoFocus />
        <Input label="Date it was done" type="date" value={doneOn} max={today} onChange={e => setDoneOn(e.target.value)} required />
        <p className="text-xs text-gray-400">This is saved to the couple’s history so everyone can see it was handled.</p>
        <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Mark as done'}</button>
        </div>
      </form>
    </Modal>
  )
}
