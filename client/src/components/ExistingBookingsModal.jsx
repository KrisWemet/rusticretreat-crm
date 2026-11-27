import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import Modal from './ui/Modal'
import Input, { Select, Textarea } from './ui/Input'
import { ArrowDownTrayIcon, ArrowUpTrayIcon, CheckCircleIcon, ExclamationTriangleIcon, XCircleIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'
import { REFERRAL_SOURCES, CEREMONY_SPACES, RECEPTION_SPACES } from '../utils/options'

// Couples who booked before the CRM was in use: one by hand, or many from a
// spreadsheet. They go in as booked, and nothing is emailed to anyone.

const emptyForm = {
  partner1_name: '', partner2_name: '', email: '', partner2_email: '', phone: '',
  event_date: '', end_date: '', package_name: '', guest_count: '', total_price: '', amount_paid: '',
  ceremony_location: '', reception_location: '', referral_source: '', notes: '',
}

const money = (n) => n == null ? '' : `$${Number(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const day = (d) => d ? format(parseISO(d), 'MMM d, yyyy') : ''

function Messages({ errors = [], warnings = [] }) {
  if (!errors.length && !warnings.length) return null
  return (
    <ul className="space-y-1 text-xs">
      {errors.map((m, i) => <li key={`e${i}`} className="text-red-600">{m}</li>)}
      {warnings.map((m, i) => <li key={`w${i}`} className="text-amber-700">{m}</li>)}
    </ul>
  )
}

function OneCouple({ packages, onAdded }) {
  const { getAdminAxios } = useAuth()
  const [form, setForm] = useState(emptyForm)
  const [check, setCheck] = useState(null)
  const [saving, setSaving] = useState(false)
  const f = (k) => (e) => { setCheck(null); setForm(p => ({ ...p, [k]: e.target.value })) }

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const api = getAdminAxios()
      // Warnings (a possible duplicate, a blocked date) are shown once; a second
      // click on "Add anyway" saves.
      if (!check || check.errors.length) {
        const { data } = await api.post('/api/bookings/existing/preview', { rows: [form] })
        const result = data.results[0]
        if (result.errors.length || result.warnings.length) { setCheck(result); return }
      }
      const { data } = await api.post('/api/bookings/existing', { rows: [form] })
      const result = data.results[0]
      if (result.outcome !== 'added') { setCheck(result); return }
      toast.success(`${result.names} added as ${result.status}`)
      setForm(emptyForm)
      setCheck(null)
      onAdded(1)
    } catch (err) {
      const result = err.response?.data?.results?.[0]
      if (result) setCheck(result)
      else toast.error(err.response?.data?.error || 'Could not add the booking')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input label="Partner 1 Name" value={form.partner1_name} onChange={f('partner1_name')} required />
        <Input label="Partner 2 Name" value={form.partner2_name} onChange={f('partner2_name')} required />
        <Input label="Partner 1 Email" type="email" value={form.email} onChange={f('email')} required />
        <Input label="Partner 2 Email (optional)" type="email" value={form.partner2_email} onChange={f('partner2_email')} />
        <Input label="Phone" value={form.phone} onChange={f('phone')} />
        <Select label="How they heard about us" value={form.referral_source} onChange={f('referral_source')}>
          <option value="">Not specified</option>
          {REFERRAL_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
        </Select>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input label="Wedding Date (first day)" type="date" value={form.event_date} onChange={f('event_date')} required />
        <Input label="Last Day (optional)" type="date" value={form.end_date} onChange={f('end_date')} min={form.event_date || undefined} />
        <Select label="Package" value={form.package_name} onChange={f('package_name')}>
          <option value="">Not selected</option>
          {packages.map(p => <option key={p.id} value={p.name}>{p.name}{p.is_active ? '' : ' (no longer offered)'}</option>)}
        </Select>
        <Input label="Guests" type="number" min="0" value={form.guest_count} onChange={f('guest_count')} />
        <Input label="Total Price" type="number" min="0" step="0.01" value={form.total_price} onChange={f('total_price')} placeholder="Including GST" />
        <Input label="Paid So Far" type="number" min="0" step="0.01" value={form.amount_paid} onChange={f('amount_paid')} placeholder="0" />
        <Input label="Ceremony Location" list="existing-ceremony-spaces" value={form.ceremony_location} onChange={f('ceremony_location')} />
        <Input label="Reception Location" list="existing-reception-spaces" value={form.reception_location} onChange={f('reception_location')} />
        <datalist id="existing-ceremony-spaces">{CEREMONY_SPACES.map(s => <option key={s} value={s} />)}</datalist>
        <datalist id="existing-reception-spaces">{RECEPTION_SPACES.map(s => <option key={s} value={s} />)}</datalist>
      </div>
      <Textarea label="Notes" rows={2} value={form.notes} onChange={f('notes')} />
      <p className="text-xs text-slate-500">
        The last day fills in from the package if left blank. What they have paid is recorded as received; any
        balance is added with no due date, so no payment reminder goes out until you give it one.
      </p>
      {check && (
        <div className={`rounded-lg border p-3 ${check.errors.length ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
          <Messages errors={check.errors} warnings={check.warnings} />
        </div>
      )}
      <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Checking…' : check && !check.errors.length ? 'Add anyway' : 'Add booking'}
        </button>
      </div>
    </form>
  )
}

function FromSpreadsheet({ onAdded }) {
  const { getAdminAxios } = useAuth()
  const [fileName, setFileName] = useState('')
  const [csv, setCsv] = useState(null)
  const [preview, setPreview] = useState(null)
  const [excluded, setExcluded] = useState(new Set())
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)

  const downloadTemplate = async () => {
    try {
      const { data } = await getAdminAxios().get('/api/bookings/existing/template.csv', { responseType: 'blob' })
      const url = URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url
      a.download = 'existing-bookings-template.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Could not download the template')
    }
  }

  const choose = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPreview(null); setDone(null); setExcluded(new Set())
    if (/\.(xlsx|xls|numbers|ods)$/i.test(file.name)) {
      toast.error('Save the spreadsheet as CSV first (File → Save As → CSV, or in Google Sheets File → Download → CSV).')
      return
    }
    setFileName(file.name)
    const text = await file.text()
    setCsv(text)
    setBusy(true)
    try {
      const { data } = await getAdminAxios().post('/api/bookings/existing/preview', { csv: text })
      setPreview(data)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not read that file')
      setCsv(null)
    } finally {
      setBusy(false)
    }
  }

  const toggle = (row) => setExcluded(s => { const n = new Set(s); n.has(row) ? n.delete(row) : n.add(row); return n })

  const save = async () => {
    setBusy(true)
    try {
      const { data } = await getAdminAxios().post('/api/bookings/existing', { csv, exclude: [...excluded] })
      setDone(data)
      onAdded(data.added)
    } catch (err) {
      if (err.response?.data?.results) setDone(err.response.data)
      else toast.error(err.response?.data?.error || 'Could not add the bookings')
    } finally {
      setBusy(false)
    }
  }

  const results = done?.results || preview?.results || []
  const ready = (preview?.results || []).filter(r => r.outcome === 'ready' && !excluded.has(r.row))
  const problems = results.filter(r => r.outcome === 'error').length

  return (
    <div className="space-y-4">
      <ol className="list-decimal pl-5 text-sm text-slate-600 space-y-1">
        <li>
          <button type="button" onClick={downloadTemplate} className="inline-flex items-center gap-1 text-rose-600 hover:text-rose-700 font-medium">
            <ArrowDownTrayIcon className="w-4 h-4" /> Download the template
          </button>{' '}
          and fill in one couple per row. Only both names, Partner 1's email and the wedding date are required.
        </li>
        <li>Save it as CSV (Excel: File → Save As → CSV. Google Sheets: File → Download → CSV).</li>
        <li>Choose the file below. You'll see every row checked before anything is added.</li>
      </ol>

      <label className="flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl py-6 cursor-pointer hover:border-rose-300 text-sm text-slate-600">
        <ArrowUpTrayIcon className="w-5 h-5" />
        {busy && !preview ? 'Checking…' : fileName ? `${fileName} (choose another)` : 'Choose a CSV file'}
        <input type="file" accept=".csv,.tsv,.txt,text/csv" className="sr-only" onChange={choose}
          id="existing-bookings-file" name="existing-bookings-file" aria-label="Choose a CSV file of existing bookings" />
      </label>

      {preview?.unknownColumns?.length > 0 && (
        <p className="text-xs text-amber-700">Ignored columns: {preview.unknownColumns.join(', ')}</p>
      )}

      {results.length > 0 && (
        <>
          <div className="text-sm text-slate-700">
            {done
              ? <>Added <strong>{done.added}</strong> of {results.length}.{problems > 0 && ` ${problems} need fixing in the spreadsheet; fix those rows and upload again. Rows already added will show as already in the CRM.`}</>
              : <>{ready.length} ready to add{problems > 0 && <>, <span className="text-red-600">{problems} with problems that will be skipped</span></>}. Untick any you don't want.</>}
          </div>
          <div className="max-h-80 overflow-y-auto border border-slate-200 rounded-lg">
            <table className="table text-sm">
              <thead>
                <tr><th></th><th>Row</th><th>Couple</th><th>Dates</th><th>Package</th><th>Total / paid</th></tr>
              </thead>
              <tbody>
                {results.map(r => (
                  <tr key={r.row} className={r.outcome === 'error' ? 'bg-red-50/50' : r.warnings.length ? 'bg-amber-50/50' : ''}>
                    <td className="align-top">
                      {done ? (
                        r.outcome === 'added' ? <CheckCircleIcon className="w-5 h-5 text-emerald-600" aria-label="Added" />
                          : r.outcome === 'skipped' ? <span className="text-xs text-slate-400">Skipped</span>
                          : <XCircleIcon className="w-5 h-5 text-red-500" aria-label="Not added" />
                      ) : r.outcome === 'error' ? <XCircleIcon className="w-5 h-5 text-red-500" aria-label="Has problems" /> : (
                        <input type="checkbox" checked={!excluded.has(r.row)} onChange={() => toggle(r.row)}
                          id={`existing-row-${r.row}`} name={`existing-row-${r.row}`} aria-label={`Add row ${r.row}`} />
                      )}
                    </td>
                    <td className="align-top text-slate-400">{r.row}</td>
                    <td className="align-top">
                      <div className="font-medium text-slate-800 flex items-center gap-1">
                        {r.names || <span className="text-slate-400">No names</span>}
                        {r.outcome !== 'error' && r.warnings.length > 0 && <ExclamationTriangleIcon className="w-4 h-4 text-amber-500" aria-label="Check this row" />}
                      </div>
                      <Messages errors={r.errors} warnings={r.warnings} />
                    </td>
                    <td className="align-top whitespace-nowrap text-slate-600">
                      {day(r.event_date)}{r.end_date && r.end_date !== r.event_date && <> – {day(r.end_date)}</>}
                    </td>
                    <td className="align-top text-slate-600">{r.package_name}</td>
                    <td className="align-top whitespace-nowrap text-slate-600">
                      {money(r.total_price)}{r.amount_paid != null && <div className="text-xs text-slate-400">paid {money(r.amount_paid)}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!done && (
            <div className="flex justify-end">
              <button type="button" className="btn-primary" disabled={busy || !ready.length} onClick={save}>
                {busy ? 'Adding…' : `Add ${ready.length} booking${ready.length === 1 ? '' : 's'}`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function ExistingBookingsModal({ isOpen, onClose, onAdded }) {
  const { getAdminAxios } = useAuth()
  const [tab, setTab] = useState('one')
  const [packages, setPackages] = useState([])

  useEffect(() => {
    if (isOpen) getAdminAxios().get('/api/packages').then(r => setPackages(r.data)).catch(() => {})
  }, [isOpen])

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Existing Bookings" size="xl">
      <p className="text-sm text-slate-500 -mt-2 mb-4">
        For couples who booked before you used the CRM. They're added as booked, and no emails or reminders go out.
      </p>
      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 mb-4 w-fit">
        {[['one', 'One couple'], ['file', 'From a spreadsheet']].map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium ${tab === k ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'one' ? <OneCouple packages={packages} onAdded={onAdded} /> : <FromSpreadsheet onAdded={onAdded} />}
    </Modal>
  )
}
