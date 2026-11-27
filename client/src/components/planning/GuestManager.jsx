import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import toast from 'react-hot-toast'
import { PlusIcon, ArrowUpTrayIcon, ArrowDownTrayIcon, PencilIcon, TrashIcon, UserGroupIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../../contexts/AuthContext'
import Modal from '../ui/Modal'
import Input, { Select, Textarea } from '../ui/Input'
import { downloadFile } from '../../utils/files'

// The couple's guest list, kept by staff: RSVPs, meals and dietary needs feed
// the event order, and tables come from the floor plan's seating.

const RSVP_STYLE = { accepted: 'bg-emerald-100 text-emerald-700', pending: 'bg-amber-100 text-amber-700', declined: 'bg-slate-100 text-slate-500' }
const RSVP_LABEL = { accepted: 'Attending', pending: 'Awaiting reply', declined: 'Declined' }
const blank = { first_name: '', last_name: '', party: '', email: '', phone: '', rsvp_status: 'pending', meal_preference: '', dietary_restrictions: '', plus_one: false, notes: '' }

export default function GuestManager({ coupleId, couple }) {
  const { getAdminAxios } = useAuth()
  const api = useRef(getAdminAxios()).current
  const [guests, setGuests] = useState(null)
  const [tables, setTables] = useState({})
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(blank)
  const [showImport, setShowImport] = useState(false)
  const [csv, setCsv] = useState('')
  const [importing, setImporting] = useState(false)
  const [search, setSearch] = useState('')
  const [rsvp, setRsvp] = useState('')
  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const load = useCallback(async () => {
    const [g, p] = await Promise.all([api.get(`/api/guests/couple/${coupleId}`), api.get(`/api/floorplans/couple/${coupleId}`)])
    setGuests(g.data)
    const t = {}
    for (const plan of p.data) for (const it of plan.items) t[`${plan.id}:${it.id}`] = it.label || 'Unnamed table'
    setTables(t)
  }, [api, coupleId])
  useEffect(() => { load().catch(() => toast.error('Could not load the guest list')) }, [load])

  const stats = useMemo(() => {
    const g = guests || []
    const accepted = g.filter(x => x.rsvp_status === 'accepted')
    const meals = {}
    for (const x of accepted) if (x.meal_preference) meals[x.meal_preference] = (meals[x.meal_preference] || 0) + 1
    return {
      total: g.length, accepted: accepted.length, plusOnes: accepted.filter(x => x.plus_one).length,
      pending: g.filter(x => x.rsvp_status === 'pending').length, declined: g.filter(x => x.rsvp_status === 'declined').length,
      dietary: g.filter(x => x.rsvp_status !== 'declined' && x.dietary_restrictions).length,
      seated: g.filter(x => x.seat_plan_id).length, meals: Object.entries(meals),
    }
  }, [guests])

  const shown = (guests || []).filter(g => (!rsvp || g.rsvp_status === rsvp) && (!search ||
    `${g.first_name} ${g.last_name} ${g.party || ''} ${g.email || ''}`.toLowerCase().includes(search.toLowerCase())))

  const openNew = () => { setForm(blank); setEditing('new') }
  const openEdit = (g) => { setForm({ ...blank, ...Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v ?? ''])), plus_one: !!g.plus_one }); setEditing(g) }

  const save = async (e) => {
    e.preventDefault()
    try {
      if (editing === 'new') await api.post(`/api/guests/couple/${coupleId}`, form)
      else await api.put(`/api/guests/${editing.id}`, form)
      toast.success(editing === 'new' ? 'Guest added' : 'Guest updated'); setEditing(null); load()
    } catch (err) { toast.error(err.response?.data?.error || 'Could not save the guest') }
  }

  const setStatus = async (g, status) => {
    try { await api.put(`/api/guests/${g.id}`, { rsvp_status: status }); setGuests(list => list.map(x => (x.id === g.id ? { ...x, rsvp_status: status } : x))) }
    catch (err) { toast.error(err.response?.data?.error || 'Could not update the RSVP') }
  }

  const remove = async (g) => {
    if (!confirm(`Remove ${g.first_name} ${g.last_name} from the guest list?`)) return
    try { await api.delete(`/api/guests/${g.id}`); load() } catch (err) { toast.error(err.response?.data?.error || 'Could not remove') }
  }

  const readFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setCsv(String(reader.result || ''))
    reader.readAsText(file)
  }

  const runImport = async (e) => {
    e.preventDefault()
    setImporting(true)
    try {
      const { data } = await api.post(`/api/guests/couple/${coupleId}/import`, { csv })
      toast.success(`Added ${data.added} guest${data.added === 1 ? '' : 's'}${data.skipped.length ? `, skipped ${data.skipped.length}` : ''}`)
      setShowImport(false); setCsv(''); setGuests(data.guests)
    } catch (err) { toast.error(err.response?.data?.error || 'Could not import that file') }
    finally { setImporting(false) }
  }

  const exportCsv = async () => {
    try { await downloadFile(api, `/api/guests/couple/${coupleId}/export`, `guest-list-${couple?.partner1_name || 'couple'}.csv`) }
    catch { toast.error('Could not export the guest list') }
  }

  if (!guests) return <div className="card p-6 text-sm text-slate-400">Loading the guest list…</div>

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ['Expected', stats.accepted + stats.plusOnes, stats.plusOnes ? `${stats.accepted} attending + ${stats.plusOnes} plus-ones` : `${stats.accepted} attending`],
          ['Awaiting reply', stats.pending, `${stats.total} on the list`],
          ['Declined', stats.declined, ''],
          ['Dietary needs', stats.dietary, stats.seated ? `${stats.seated} seated` : 'No one seated yet'],
        ].map(([k, v, sub]) => (
          <div key={k} className="card p-4"><div className="text-2xl font-bold text-slate-900">{v}</div><div className="text-sm text-slate-600">{k}</div>{sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}</div>
        ))}
      </div>
      {stats.meals.length > 0 && <p className="text-sm text-slate-600"><strong>Meals:</strong> {stats.meals.map(([m, n]) => `${m} ${n}`).join(' · ')}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primary" onClick={openNew}><PlusIcon className="w-4 h-4" /> Add guest</button>
        <button className="btn-secondary" onClick={() => setShowImport(true)}><ArrowUpTrayIcon className="w-4 h-4" /> Import CSV</button>
        {guests.length > 0 && <button className="btn-secondary" onClick={exportCsv}><ArrowDownTrayIcon className="w-4 h-4" /> Export CSV</button>}
        <div className="flex-1" />
        <div className="relative">
          <MagnifyingGlassIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input id="guest-search" name="guest-search" aria-label="Search guests" className="input-field pl-9 w-56" placeholder="Search guests" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select aria-label="Filter by RSVP" value={rsvp} onChange={e => setRsvp(e.target.value)} className="w-auto">
          <option value="">All replies</option>
          {Object.entries(RSVP_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </div>

      {guests.length === 0 ? (
        <div className="card py-14 text-center">
          <UserGroupIcon className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No guests yet</p>
          <p className="text-sm text-slate-400 mt-1 max-w-md mx-auto">Add guests one by one, or import the couple’s spreadsheet saved as CSV (a “First Name” or “Name” column is all it needs).</p>
        </div>
      ) : (
        <div className="card overflow-x-auto relative">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50">
              <th className="px-4 py-2.5">Guest</th><th className="px-4 py-2.5">RSVP</th><th className="px-4 py-2.5">Meal</th>
              <th className="px-4 py-2.5">Dietary</th><th className="px-4 py-2.5">Table</th><th className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map(g => (
                <tr key={g.id}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-slate-900">{g.first_name} {g.last_name}{g.plus_one ? <span className="text-xs text-slate-500 font-normal"> +1</span> : null}</div>
                    {(g.party || g.email) && <div className="text-xs text-slate-400">{[g.party, g.email].filter(Boolean).join(' · ')}</div>}
                  </td>
                  <td className="px-4 py-2.5">
                    <select id={`rsvp-${g.id}`} name={`rsvp-${g.id}`} aria-label={`RSVP for ${g.first_name} ${g.last_name}`} value={g.rsvp_status} onChange={e => setStatus(g, e.target.value)}
                      className={`text-xs font-medium rounded-full px-2.5 py-1 border-0 ${RSVP_STYLE[g.rsvp_status]}`}>
                      {Object.entries(RSVP_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{g.meal_preference || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-600">{g.dietary_restrictions || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-600">{g.seat_plan_id ? tables[`${g.seat_plan_id}:${g.seat_table}`] || '—' : '—'}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg" onClick={() => openEdit(g)} aria-label={`Edit ${g.first_name} ${g.last_name}`}><PencilIcon className="w-4 h-4" /></button>
                    <button className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg" onClick={() => remove(g)} aria-label={`Remove ${g.first_name} ${g.last_name}`}><TrashIcon className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">No guests match.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add guest' : 'Edit guest'} size="lg">
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="First name" value={form.first_name} onChange={f('first_name')} required />
            <Input label="Last name" value={form.last_name} onChange={f('last_name')} required />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input label="Party / household" value={form.party} onChange={f('party')} placeholder="e.g. Larsson family" />
            <Input label="Email" type="email" value={form.email} onChange={f('email')} />
            <Input label="Phone" value={form.phone} onChange={f('phone')} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Select label="RSVP" value={form.rsvp_status} onChange={f('rsvp_status')}>
              {Object.entries(RSVP_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <Input label="Meal" value={form.meal_preference} onChange={f('meal_preference')} />
            <Input label="Dietary needs" value={form.dietary_restrictions} onChange={f('dietary_restrictions')} placeholder="e.g. Nut allergy" />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700"><input id="guest-plus-one" name="guest-plus-one" type="checkbox" checked={form.plus_one} onChange={f('plus_one')} /> Bringing a plus-one</label>
          <Textarea label="Notes" value={form.notes} onChange={f('notes')} rows={2} />
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
            <button type="submit" className="btn-primary">{editing === 'new' ? 'Add guest' : 'Save'}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={showImport} onClose={() => setShowImport(false)} title="Import guests from a spreadsheet" size="lg">
        <form onSubmit={runImport} className="space-y-4">
          <p className="text-sm text-slate-600">Save the spreadsheet as CSV, then choose it or paste its contents. The first row must name the columns.
            Recognised: First Name, Last Name (or just Name), Party/Household, Email, Phone, RSVP (yes/no), Meal, Dietary, Plus One, Notes.
            Guests already on the list are skipped.</p>
          <div>
            <label htmlFor="guest-csv-file" className="label">CSV file</label>
            <input id="guest-csv-file" name="guest-csv-file" type="file" accept=".csv,text/csv" onChange={readFile} className="block text-sm" />
          </div>
          <Textarea label="Or paste the CSV" value={csv} onChange={e => setCsv(e.target.value)} rows={8} placeholder={'First Name,Last Name,RSVP,Meal\nLinda,Larsson,yes,Beef'} />
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button type="button" className="btn-secondary" onClick={() => setShowImport(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={!csv.trim() || importing}>{importing ? 'Importing…' : 'Import'}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
