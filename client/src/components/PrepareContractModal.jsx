import { useState, useEffect, useCallback, useMemo } from 'react'
import Modal from './ui/Modal'
import ContractDocument from './ContractDocument'
import toast from 'react-hot-toast'
import { CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/solid'

/**
 * The venue's prep pass over a template contract: fill in the details that have
 * to be settled before the couple sees it — dates, package, price, notes.
 *
 * This exists because signing is one-way. The venue's fields are frozen the
 * moment the contract is signed, so anything left blank here is blank forever on
 * a document the couple is about to be legally bound by. The server refuses to
 * sign an incomplete one; this screen is how the venue sees what is outstanding
 * before it gets that far.
 */
export default function PrepareContractModal({ contract, api, onClose, onSaved }) {
  const [data, setData] = useState(null)
  const [values, setValues] = useState({})
  const [invalid, setInvalid] = useState({})
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    // Closing sets contract to null while `data` is still populated. The body
    // below reads contract.title, and Modal cannot save us — React evaluates a
    // component's children before Modal ever decides whether to render them, so
    // the stale data alone was enough to blank the whole Contracts page.
    if (!contract) { setData(null); setValues({}); setInvalid({}); setDirty(false); return }
    setLoading(true)
    api.get(`/api/contracts/${contract.id}/template`)
      .then(r => { setData(r.data); setValues(r.data.values || {}); setDirty(false) })
      .catch(e => toast.error(e.response?.data?.error || 'Could not load this contract'))
      .finally(() => setLoading(false))
  }, [contract, api])

  const setField = useCallback((key, value) => {
    setValues(v => ({ ...v, [key]: value }))
    setInvalid(f => (f[key] ? { ...f, [key]: false } : f))
    setDirty(true)
  }, [])

  const save = async ({ quiet } = {}) => {
    setSaving(true)
    try {
      const r = await api.put(`/api/contracts/${contract.id}/fields`, { fields: values })
      setData(d => ({ ...d, ...r.data }))
      setDirty(false)
      if (!quiet) toast.success('Venue details saved')
      onSaved?.()
      return r.data
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not save')
      return null
    } finally {
      setSaving(false)
    }
  }

  const missing = (data?.missing_venue || []).filter(m => !String(values[m.key] ?? '').trim())
  const ready = missing.length === 0

  // The server computes the schedule too, but only on save. Recomputing here off
  // the values being typed means the venue sees what the couple will owe as they
  // set the fee, rather than after committing it. The shape mirrors
  // services/contractTemplate.paymentSchedule: a percentage row is a share of the
  // package fee, a TBD row has no amount, and the remaining flat row is the
  // damage deposit.
  const num = v => parseFloat(String(v ?? '').replace(/[^0-9.]/g, '')) || 0
  const livePaymentSchedule = useMemo(() => {
    const rows = data?.payment_schedule || []
    const total = num(values.total_package_fee)
    return rows.map(r => ({
      ...r,
      amount: r.tbd ? null
            : r.pct != null ? total * (r.pct / 100)
            : num(values.damage_deposit),
    }))
  }, [data?.payment_schedule, values.total_package_fee, values.damage_deposit])

  const jumpTo = (key) => {
    const el = document.getElementById(`f-${key}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el?.focus?.()
    setInvalid(f => ({ ...f, [key]: true }))
  }

  return (
    <Modal
      isOpen={!!contract}
      onClose={() => {
        if (dirty && !window.confirm('You have unsaved changes. Close anyway?')) return
        onClose()
      }}
      title="Prepare contract"
      size="xl"
    >
      {loading && <p className="text-sm text-slate-400 py-8 text-center">Loading contract…</p>}

      {!loading && data && contract && (
        <div className="space-y-4">
          <div className="bg-slate-50 rounded-xl px-4 py-3">
            <p className="font-semibold text-slate-900 text-sm">{contract.title}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {contract.partner1_name} &amp; {contract.partner2_name} ·{' '}
              {data.packet.documents.length} documents · {data.initials_blocks.length} clauses the couple must initial
            </p>
          </div>

          {data.locked ? (
            <div className="flex items-start gap-2 bg-slate-100 border border-slate-200 rounded-xl px-4 py-3">
              <CheckCircleIcon className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-slate-600">
                This contract was locked when the venue signed it. These details can no longer be changed.
              </p>
            </div>
          ) : ready ? (
            <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
              <CheckCircleIcon className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-emerald-800">
                All venue details are filled in. You can sign and send this to the couple.
              </p>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <div className="flex items-start gap-2">
                <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-amber-900">
                    {missing.length} venue {missing.length === 1 ? 'detail' : 'details'} still to fill in
                  </p>
                  <p className="text-xs text-amber-700 mt-0.5 mb-2">
                    You cannot sign until these are complete — signing locks them permanently.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {missing.map(m => (
                      <button key={m.key} type="button" onClick={() => jumpTo(m.key)}
                        className="text-[11px] font-medium bg-white border border-amber-300 text-amber-800
                                   hover:bg-amber-100 px-2 py-1 rounded-md transition-colors">
                        {m.label || m.key}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="max-h-[58vh] overflow-y-auto rounded-xl bg-slate-50 p-3">
            <ContractDocument
              packet={data.packet}
              values={values}
              onChange={setField}
              editableFill={data.locked ? null : 'venue'}
              paymentSchedule={livePaymentSchedule}
              invalidFields={invalid}
            />
          </div>

          {!data.locked && (
            <div className="flex items-center justify-between gap-3 pt-1">
              <p className="text-xs text-slate-400">
                {dirty ? 'Unsaved changes' : 'All changes saved'}
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                  Close
                </button>
                <button type="button" onClick={() => save()} disabled={saving}
                  className="inline-flex items-center gap-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-40
                             text-white text-sm font-semibold px-5 py-2 rounded-xl transition-colors">
                  {saving ? 'Saving…' : 'Save venue details'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
