import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import FinalDetailsFields, { QuoteSummary, emptyValues } from '../components/FinalDetailsFields'

// The page a couple opens from their Final Details Form link (rental agreement
// Section 2.3). No login: the link's token is the key, as with contract
// signing. The price is worked out by the server as they type.

const day = (d) => (d ? new Intl.DateTimeFormat('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(d + 'T00:00:00Z')) : '')
const stamp = (s) => (s ? new Intl.DateTimeFormat('en-CA', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Edmonton' }).format(new Date(s.replace(' ', 'T') + 'Z')).replace(/\s?a\.m\./, ' AM').replace(/\s?p\.m\./, ' PM') : '')

export default function FinalDetails() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [values, setValues] = useState(emptyValues())
  const [quote, setQuote] = useState(null)
  const [name, setName] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const first = useRef(true)

  useEffect(() => {
    axios.get(`/api/final-details/public/${token}`).then(r => {
      setData(r.data); setValues(emptyValues(r.data.values)); setQuote(r.data.quote)
    }).catch(err => setLoadError(err.response?.data?.error || 'This form could not be loaded.'))
  }, [token])

  // Re-price as they type, a moment after they stop.
  useEffect(() => {
    if (!data || data.submitted) return
    if (first.current) { first.current = false; return }
    const t = setTimeout(() => {
      axios.post(`/api/final-details/public/${token}/quote`, values).then(r => setQuote(r.data)).catch(() => {})
    }, 350)
    return () => clearTimeout(t)
  }, [values, data, token])

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      const { data: done } = await axios.post(`/api/final-details/public/${token}/submit`, { ...values, signer_name: name.trim(), agreed })
      setData(done); setQuote(done.quote); window.scrollTo(0, 0)
    } catch (err) {
      setError(err.response?.data?.error || 'Your form could not be sent. Please try again.')
    } finally { setSaving(false) }
  }

  const shell = (body) => (
    <div className="min-h-screen bg-stone-50 py-10 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm border border-stone-200 p-6 sm:p-8">
        <p className="text-xs uppercase tracking-widest text-rose-600 font-semibold mb-1">Rustic Retreat</p>
        {body}
      </div>
    </div>
  )

  if (loadError) return shell(<p className="text-slate-700 mt-2">{loadError}</p>)
  if (!data) return shell(<p className="text-slate-400 mt-2">Loading…</p>)

  const couple = `${data.couple.partner1_name} & ${data.couple.partner2_name}`
  const stay = data.stay?.check_in ? `${day(data.stay.check_in)}${data.stay.check_out ? ` to ${day(data.stay.check_out)}` : ''}` : null

  if (data.submitted) {
    const v = data.values
    const extras = v.extras || []
    return shell(
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Thank you, your Final Details are in</h1>
          <p className="text-sm text-slate-500 mt-1">For {couple}{stay ? ` · ${stay}` : ''}</p>
          <p className="text-sm text-slate-600 mt-3">Submitted by {data.submitted.name} on {stamp(data.submitted.at)}. These numbers are now locked. We will review them and, if anything is owing, send you an invoice payable by {day(data.deadline) || 'the form’s due date'}.</p>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          {[['Guests', v.guests], ['Overnight campers', v.campers], ['Tents', v.tents], ['RVs', `${v.rvs}${v.rv_over_30ft ? ' (one or more over 30 ft)' : ''}`],
            ...extras.map(e => [e.name, e.quantity])].map(([k, val]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-slate-100 py-1"><dt className="text-slate-500">{k}</dt><dd className="font-medium text-slate-800">{val}</dd></div>
          ))}
        </dl>
        {v.notes && <p className="text-sm text-slate-600 whitespace-pre-wrap"><span className="font-medium text-slate-800">Notes:</span> {v.notes}</p>}
        <QuoteSummary quote={quote} />
        <p className="text-xs text-slate-500">Something wrong? Contact Rustic Retreat directly. You can keep this page as your record.</p>
      </div>
    )
  }

  const blocked = quote?.errors?.length > 0
  return shell(
    <form onSubmit={submit} className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">Final Details Form</h1>
        <p className="text-sm text-slate-500 mt-1">For {couple}{stay ? ` · ${stay}` : ''}</p>
        <p className={`text-sm mt-3 ${data.overdue ? 'text-red-600 font-medium' : 'text-slate-600'}`}>
          {!data.deadline ? 'Please submit at least 7 days before check-in.'
            : data.overdue ? `This was due ${day(data.deadline)}. Please submit it as soon as you can.`
            : `Please submit by ${day(data.deadline)}.`}
        </p>
        <p className="text-sm text-slate-600 mt-2">Once you submit, these numbers are final and cannot be changed (Section 2.3 of your rental agreement). Overage fees are non-refundable, even if fewer people come.</p>
      </div>

      <FinalDetailsFields rates={data.rates} offered={data.offered} values={values} onChange={setValues} nights={data.nights} idPrefix="fd" />

      <QuoteSummary quote={quote} />

      <fieldset className="space-y-3 border-t border-slate-200 pt-5">
        <legend className="sr-only">Submit</legend>
        <div>
          <label htmlFor="fd-signer" className="block text-sm font-medium text-slate-800">Your full name</label>
          <input id="fd-signer" name="fd-signer" type="text" required autoComplete="name" value={name} onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500" />
        </div>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" name="fd-agree" className="mt-0.5" checked={agreed} onChange={e => setAgreed(e.target.checked)} required />
          <span>I confirm these are our final numbers. I understand they are locked once submitted and that overage fees are non-refundable.</span>
        </label>
      </fieldset>

      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      <button type="submit" disabled={saving || blocked} className="w-full bg-rose-600 hover:bg-rose-700 text-white font-semibold py-3 rounded-lg disabled:opacity-60">
        {saving ? 'Sending…' : 'Submit our final details'}
      </button>
      {blocked && <p className="text-xs text-center text-red-600">Fix the numbers marked in red above to submit.</p>}
    </form>
  )
}
