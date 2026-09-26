import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'
import { PaperClipIcon, ArrowUpTrayIcon, TrashIcon } from '@heroicons/react/24/outline'
import Modal from './ui/Modal'
import Input, { Select, Textarea } from './ui/Input'

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/*'
// Uploads get longer than the usual 20s: a 15 MB scan on a rural connection is slow.
const UPLOAD = { timeout: 120000 }
const today = () => new Date().toISOString().slice(0, 10)
const kb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

// Files are only served to signed-in staff, so they are fetched with the admin
// token and opened from memory rather than linked directly.
export async function openContractFile(api, contractId, file) {
  const w = window.open('', '_blank')
  try {
    const r = await api.get(`/api/contracts/${contractId}/files/${file.id}`, { responseType: 'blob' })
    const url = URL.createObjectURL(r.data)
    if (w) w.location.href = url
    else window.location.href = url
  } catch {
    if (w) w.close()
    toast.error('Could not open the file')
  }
}

// ── Record a contract signed outside the CRM ─────────────────────────────────
const EMPTY_RECORD = {
  couple_id: '', title: 'Event Venue Rental Agreement', signed_date: today(), signed_by: '',
  wedding_date: '', package_name: '', total_price: '', guest_count: '', notes: '',
}

export function RecordSignedContractModal({ isOpen, onClose, onSaved, api, couples, packages }) {
  const [form, setForm] = useState(EMPTY_RECORD)
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))
  const close = () => { setForm(EMPTY_RECORD); setFile(null); onClose() }

  // Picking the couple fills in what the CRM already knows about them.
  const pickCouple = async (e) => {
    const id = e.target.value
    const c = couples.find(x => String(x.id) === id)
    setForm(p => ({ ...p, couple_id: id, signed_by: c ? `${c.partner1_name} & ${c.partner2_name}` : '',
      wedding_date: c?.wedding_date || '', package_name: c?.venue_package || '' }))
    if (!id) return
    try {
      const b = (await api.get(`/api/bookings/couple/${id}`)).data[0]
      if (b) setForm(p => ({ ...p, wedding_date: b.event_date || p.wedding_date, package_name: b.package_name || p.package_name,
        total_price: b.total_price ? String(b.total_price) : p.total_price, guest_count: b.guest_count ? String(b.guest_count) : p.guest_count }))
    } catch { /* the couple's own details are enough */ }
  }

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const body = new FormData()
      Object.entries(form).forEach(([k, v]) => body.append(k, v))
      if (file) body.append('file', file)
      await api.post('/api/contracts/external', body, UPLOAD)
      toast.success('Signed contract recorded')
      close(); onSaved()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not save the contract')
    } finally { setSaving(false) }
  }

  const packageNames = [...new Set([...packages.filter(p => p.is_active).map(p => p.name), form.package_name].filter(Boolean))]

  return (
    <Modal isOpen={isOpen} onClose={close} title="Record a signed contract" size="lg">
      <form onSubmit={save} className="space-y-4">
        <p className="text-sm text-slate-500">
          For a contract signed on paper or through another service. It is saved as <strong>signed</strong> with the
          file attached, so every agreement is in one place. Nothing is emailed to the couple.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <Select label="Couple" value={form.couple_id} onChange={pickCouple} required>
            <option value="">Select couple...</option>
            {couples.map(c => <option key={c.id} value={c.id}>{c.partner1_name} & {c.partner2_name}</option>)}
          </Select>
          <Input label="Contract title" value={form.title} onChange={f('title')} required />
          <Input label="Date signed" type="date" value={form.signed_date} onChange={f('signed_date')} required />
          <Input label="Signed by" value={form.signed_by} onChange={f('signed_by')} placeholder="Names as signed" />
          <Input label="Wedding date" type="date" value={form.wedding_date} onChange={f('wedding_date')} />
          <Select label="Package" value={form.package_name} onChange={f('package_name')}>
            <option value="">Not specified</option>
            {packageNames.map(n => <option key={n} value={n}>{n}</option>)}
          </Select>
          <Input label="Total (CAD, incl. GST)" type="number" min="0" step="0.01" value={form.total_price} onChange={f('total_price')} />
          <Input label="Guest count" type="number" min="1" value={form.guest_count} onChange={f('guest_count')} />
        </div>
        <Textarea label="Notes (optional)" value={form.notes} onChange={f('notes')} placeholder="e.g. Signed at the property tour; deposit paid by e-transfer" />
        <div>
          <label htmlFor="record-contract-file" className="label">Signed copy (PDF or photo, up to 15 MB)</label>
          <input id="record-contract-file" type="file" accept={ACCEPT} onChange={e => setFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200" />
          {!file && <p className="text-xs text-amber-700 mt-1">No file chosen. You can attach one later from the contract.</p>}
        </div>
        <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
          <button type="button" className="btn-secondary" onClick={close}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save signed contract'}</button>
        </div>
      </form>
    </Modal>
  )
}

// ── Edit a free-text draft before the venue signs it ─────────────────────────
export function EditDraftContractModal({ contract, onClose, onSaved, api, packages }) {
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!contract) { setForm(null); return }
    // The list row has no wording; fetch the whole contract.
    api.get(`/api/contracts/${contract.id}`).then(r => {
      const c = r.data
      setForm({
        title: c.title || '', content: c.content || '', wedding_date: c.wedding_date || '',
        start_time: c.start_time || '', end_time: c.end_time || '', guest_count: c.guest_count ?? '',
        package_name: c.package_name || '', total_price: c.total_price ?? '',
        ceremony_location: c.ceremony_location || '', reception_location: c.reception_location || '',
      })
    }).catch(() => { toast.error('Could not load the contract'); onClose() })
  }, [contract?.id])

  if (!contract) return null
  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))
  const packageNames = form ? [...new Set([...packages.filter(p => p.is_active).map(p => p.name), form.package_name].filter(Boolean))] : []

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.put(`/api/contracts/${contract.id}`, {
        ...form,
        guest_count: form.guest_count === '' ? '' : Number(form.guest_count),
        total_price: form.total_price === '' ? '' : Number(form.total_price),
      })
      toast.success('Contract updated')
      onSaved(); onClose()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not save the changes')
    } finally { setSaving(false) }
  }

  return (
    <Modal isOpen={!!contract} onClose={onClose} title="Edit draft contract" size="xl">
      {!form ? <p className="text-sm text-slate-400">Loading…</p> : (
        <form onSubmit={save} className="space-y-4">
          <p className="text-sm text-slate-500">
            Drafts can be changed until the venue signs. Signing locks the wording, so the couple signs exactly what the venue did.
          </p>
          <Input label="Contract title" value={form.title} onChange={f('title')} required />
          <div className="grid grid-cols-3 gap-4">
            <Input label="Wedding date" type="date" value={form.wedding_date} onChange={f('wedding_date')} />
            <Input label="Start time" value={form.start_time} onChange={f('start_time')} />
            <Input label="End time" value={form.end_time} onChange={f('end_time')} />
            <Input label="Guest count" type="number" min="1" value={form.guest_count} onChange={f('guest_count')} />
            <Select label="Package" value={form.package_name} onChange={f('package_name')}>
              <option value="">Not specified</option>
              {packageNames.map(n => <option key={n} value={n}>{n}</option>)}
            </Select>
            <Input label="Total (CAD)" type="number" min="0" step="0.01" value={form.total_price} onChange={f('total_price')} />
            <Input label="Ceremony location" value={form.ceremony_location} onChange={f('ceremony_location')} />
            <Input label="Reception location" value={form.reception_location} onChange={f('reception_location')} />
          </div>
          <div>
            <label htmlFor="edit-contract-wording" className="label">Contract wording</label>
            <textarea id="edit-contract-wording" value={form.content} onChange={f('content')} rows={16} required
              className="input-field font-mono text-xs resize-y leading-relaxed" />
            <p className="text-xs text-slate-400 mt-1">This is exactly what the couple will read and sign. The event details above are stored with the contract; edit the wording too if they appear in it.</p>
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
          </div>
        </form>
      )}
    </Modal>
  )
}

// ── Files attached to a contract ─────────────────────────────────────────────
export function ContractFiles({ contract, api, onChanged }) {
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const load = () => api.get(`/api/contracts/${contract.id}/files`).then(r => setFiles(r.data)).catch(() => {})
  useEffect(() => { load() }, [contract.id])

  const add = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      const body = new FormData(); body.append('file', file)
      await api.post(`/api/contracts/${contract.id}/files`, body, UPLOAD)
      toast.success('File attached'); load(); onChanged?.()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not attach the file')
    } finally { setBusy(false) }
  }

  const remove = async (file) => {
    if (!confirm(`Remove ${file.filename}?`)) return
    await api.delete(`/api/contracts/${contract.id}/files/${file.id}`)
    load(); onChanged?.()
  }

  return (
    <div className="border border-slate-200 rounded-xl p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Files</span>
        <label className={`text-xs text-rose-600 hover:text-rose-700 font-medium flex items-center gap-1 cursor-pointer ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
          <ArrowUpTrayIcon className="w-3.5 h-3.5" /> {busy ? 'Uploading…' : 'Attach PDF or photo'}
          <input type="file" accept={ACCEPT} className="hidden" onChange={add} aria-label="Attach a file to this contract" />
        </label>
      </div>
      {files.length === 0 ? <p className="text-xs text-slate-400">No files attached.</p> : files.map(file => (
        <div key={file.id} className="flex items-center gap-2 text-sm">
          <PaperClipIcon className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <button type="button" onClick={() => openContractFile(api, contract.id, file)} className="text-rose-600 hover:underline truncate text-left">{file.filename}</button>
          <span className="text-xs text-slate-400 whitespace-nowrap">{kb(file.size)} · {format(parseISO(file.uploaded_at.replace(' ', 'T')), 'MMM d, yyyy')}</span>
          <button type="button" onClick={() => remove(file)} className="ml-auto text-slate-300 hover:text-red-500" aria-label={`Remove ${file.filename}`}><TrashIcon className="w-4 h-4" /></button>
        </div>
      ))}
    </div>
  )
}
