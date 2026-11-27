import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '../contexts/AuthContext'

// The numbers the Final Details Form prices with. They start as the rental
// agreement's own table (Section 2.3). Changing them reprices forms not yet
// submitted; a submitted form keeps the price it was submitted at.

const GROUPS = [
  ['Guests', ['included_guests', 'guest_fee', 'max_guests', 'included_campers']],
  ['Tents and RVs', ['included_tents', 'tent_fee_per_night', 'included_rvs', 'rv_fee_per_night', 'max_rvs', 'tents_per_extra_rv']],
  ['Tax and timing', ['gst_rate', 'deadline_days']],
]

export default function FinalDetailsRates() {
  const { getAdminAxios, user } = useAuth()
  const api = useRef(getAdminAxios()).current
  const isAdmin = user?.role === 'admin'
  const [data, setData] = useState(null)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/api/final-details/rates').then(r => { setData(r.data); setForm(r.data.rates) }).catch(() => {})
  }, [api])
  if (!data) return null

  const changed = Object.keys(data.rates).some(k => String(form[k]) !== String(data.rates[k]))
  const save = async () => {
    setSaving(true)
    try {
      const { data: r } = await api.put('/api/final-details/rates', form)
      setData(d => ({ ...d, rates: r.rates })); setForm(r.rates); toast.success('Final Details rates saved')
    } catch (err) { toast.error(err.response?.data?.error || 'Could not save the rates') }
    finally { setSaving(false) }
  }

  return (
    <div className="card p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-slate-900">Final Details Form rates</h2>
        <p className="text-xs text-slate-500 mt-0.5">What the couple’s Final Details Form charges for extra guests, tents and RVs. These start as your rental agreement’s Section 2.3 table. A form already submitted keeps the price it was submitted at.
          {!isAdmin && ' Only an admin can change them.'}</p>
      </div>
      {GROUPS.map(([title, keys]) => (
        <div key={title}>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{title}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {keys.map(k => (
              <div key={k} className="flex items-center justify-between gap-3">
                <label htmlFor={`fdr-${k}`} className="text-sm text-slate-700">{data.labels[k]}</label>
                <input id={`fdr-${k}`} name={`fdr-${k}`} type="number" min="0" step={/fee|rate/.test(k) ? '0.01' : '1'} disabled={!isAdmin}
                  value={form[k] ?? ''} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                  className="input-field w-28 text-right" />
              </div>
            ))}
          </div>
        </div>
      ))}
      {isAdmin && (
        <div className="flex items-center justify-between gap-3">
          <button type="button" className="text-xs text-slate-500 hover:text-slate-800" onClick={() => setForm(data.defaults)}>Put back the agreement’s numbers</button>
          <button className="btn-primary" onClick={save} disabled={saving || !changed}>{saving ? 'Saving…' : 'Save rates'}</button>
        </div>
      )}
      <p className="text-xs text-slate-500">Extras such as propane, firewood or a generator come from <span className="font-medium">Packages &amp; Add-Ons</span>: tick “Offer on the Final Details Form” on each one.</p>
    </div>
  )
}
