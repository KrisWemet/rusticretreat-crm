import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import FormFields from '../components/FormFields'

// The page a couple opens from their private form link. No login: the link's
// token is the key, as with contract signing.
export default function PublicForm() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [values, setValues] = useState({})
  const [dirty, setDirty] = useState(false)
  const [notice, setNotice] = useState('')
  const [state, setState] = useState('idle') // idle | saving | done

  useEffect(() => {
    axios.get(`/api/forms/public/${token}`).then(r => {
      setData(r.data)
      setValues(Object.fromEntries(r.data.fields.filter(f => f.value != null).map(f => [f.id, f.value])))
    }).catch(err => setError(err.response?.data?.error || 'This form could not be loaded.'))
  }, [token])

  useEffect(() => {
    const warn = e => { if (dirty) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const submit = async (e, complete = true) => {
    e?.preventDefault()
    setState('saving'); setError('')
    try {
      const r = await axios.post(`/api/forms/public/${token}`, { answers: values, complete, revision: data.revision })
      setData(p => ({ ...p, revision: r.data.revision, status: complete ? 'completed' : 'pending' })); setDirty(false)
      setState(complete ? 'done' : 'idle'); setNotice('Draft saved. Open this link again to continue.')
    } catch (err) {
      setError(err.response?.data?.error || 'Your answers could not be saved. Please try again.')
      setState('idle')
    }
  }

  return (
    <div className="min-h-screen bg-stone-50 py-10 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm border border-stone-200 p-6 sm:p-8">
        <p className="text-xs uppercase tracking-widest text-rose-600 font-semibold mb-1">Rustic Retreat</p>
        {!data && !error && <p className="text-slate-400">Loading…</p>}
        {!data && error && <p className="text-slate-700">{error}</p>}
        {data && state === 'done' && (
          <div className="py-8 text-center">
            <h1 className="text-2xl font-semibold text-slate-800 mb-2">Thank you!</h1>
            <p className="text-slate-600">Your answers to "{data.form.title}" have been sent to Rustic Retreat. You can open this link again to change them.</p>
          </div>
        )}
        {data && state !== 'done' && (
          <form onSubmit={e => submit(e)} className="space-y-5">
            <div>
              <h1 className="text-2xl font-semibold text-slate-800">{data.form.title}</h1>
              <p className="text-sm text-slate-500 mt-1">For {data.couple}</p>
              {data.form.description && <p className="text-sm text-slate-600 mt-3">{data.form.description}</p>}
              {data.status === 'completed' && <p className="text-sm text-emerald-700 mt-3">You've already filled this in. Change anything below and save again.</p>}
            </div>
            <FormFields fields={data.fields} values={values} onChange={v => { setValues(v); setDirty(true) }}
              inputClass="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500" />
            {notice && <p className="text-sm text-emerald-700">{notice}</p>}
            <button type="button" disabled={state === 'saving'} onClick={() => submit(null, false)} className="btn-secondary w-full">Save for later</button>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={state === 'saving'} className="w-full bg-rose-600 hover:bg-rose-700 text-white font-semibold py-3 rounded-lg disabled:opacity-60">
              {state === 'saving' ? 'Saving…' : 'Send my answers'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
