// The Final Details Form fields and the running price, shared by the couple's
// page and the staff "fill in for them" panel. Prices always come from the
// server (`quote`), so both sides see the same figure.

const money = (n) => `$${Number(n || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const UNIT = { flat: 'each', per_guest: 'per guest', per_night: 'per night' }

function Count({ id, label, hint, value, onChange, disabled }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">{label}</label>
      {hint && <p className="text-xs text-slate-500 mb-1">{hint}</p>}
      <input id={id} name={id} type="number" inputMode="numeric" min="0" step="1" required disabled={disabled}
        value={value ?? ''} onChange={e => onChange(e.target.value === '' ? '' : e.target.value)}
        className="w-32 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:bg-slate-50" />
    </div>
  )
}

export function QuoteSummary({ quote, title = 'Overage fees' }) {
  if (!quote) return null
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm" aria-live="polite">
      <div className="font-semibold text-slate-800 mb-2">{title}</div>
      {quote.lines.length === 0
        ? <p className="text-slate-600">Nothing extra to pay. Everything is within your package.</p>
        : (
          <table className="w-full">
            <tbody>
              {quote.lines.map((l, i) => (
                <tr key={i}><td className="py-1 pr-3 text-slate-700">{l.label}</td><td className="py-1 text-right font-medium text-slate-800 whitespace-nowrap">{money(l.amount)}</td></tr>
              ))}
              <tr className="border-t border-slate-200"><td className="pt-2 pr-3 text-slate-500">Subtotal</td><td className="pt-2 text-right text-slate-700">{money(quote.subtotal)}</td></tr>
              {quote.gst_rate > 0 && <tr><td className="py-1 pr-3 text-slate-500">GST ({quote.gst_rate}%)</td><td className="py-1 text-right text-slate-700">{money(quote.gst)}</td></tr>}
              <tr><td className="pt-1 pr-3 font-semibold text-slate-900">Total</td><td className="pt-1 text-right font-bold text-slate-900">{money(quote.total)}</td></tr>
            </tbody>
          </table>
        )}
      {quote.allowance?.converted_rvs > 0 && (
        <p className="mt-2 text-xs text-emerald-700">Your unused tent spots add {quote.allowance.converted_rvs} more included RV spot{quote.allowance.converted_rvs === 1 ? '' : 's'} ({quote.allowance.rvs} in total).</p>
      )}
      {quote.errors?.length > 0 && <ul className="mt-2 space-y-1">{quote.errors.map((t, i) => <li key={i} className="text-red-600 font-medium">{t}</li>)}</ul>}
      {quote.notes?.length > 0 && <ul className="mt-2 space-y-1">{quote.notes.map((t, i) => <li key={i} className="text-xs text-amber-700">{t}</li>)}</ul>}
    </div>
  )
}

// values: { guests, campers, tents, rvs, rv_over_30ft, notes, extras: [{addon_id, quantity}] }
export default function FinalDetailsFields({ rates, offered = [], values, onChange, disabled = false, idPrefix = 'fd', nights }) {
  const set = (k, v) => onChange({ ...values, [k]: v })
  const qty = (id) => values.extras?.find(e => e.addon_id === id)?.quantity ?? ''
  const setQty = (id, q) => {
    const rest = (values.extras || []).filter(e => e.addon_id !== id)
    const n = Number(q)
    onChange({ ...values, extras: q === '' || !n ? rest : [...rest, { addon_id: id, quantity: n }] })
  }
  const r = rates
  const night = nights ? ` for ${nights} night${nights === 1 ? '' : 's'}` : ''
  return (
    <div className="space-y-6">
      <fieldset className="space-y-4">
        <legend className="text-base font-semibold text-slate-900 mb-1">Your final numbers</legend>
        <Count id={`${idPrefix}-guests`} label="Guests at the ceremony and reception" disabled={disabled}
          hint={`${r.included_guests} included. ${money(r.guest_fee)} for each guest over ${r.included_guests}; at most ${r.max_guests} on the property. Over ${r.included_guests} needs our written approval.`}
          value={values.guests} onChange={v => set('guests', v)} />
        <Count id={`${idPrefix}-campers`} label="Guests staying overnight (camping)" disabled={disabled}
          hint={`Up to ${r.included_campers} included, with no per-person fee.`}
          value={values.campers} onChange={v => set('campers', v)} />
        <Count id={`${idPrefix}-tents`} label="Tents" disabled={disabled}
          hint={`${r.included_tents} included. ${money(r.tent_fee_per_night)} per extra tent, per night${night}. Every ${r.tents_per_extra_rv} unused tent spots become one more RV spot.`}
          value={values.tents} onChange={v => set('tents', v)} />
        <Count id={`${idPrefix}-rvs`} label="RVs and campers (vehicles)" disabled={disabled}
          hint={`${r.included_rvs} included. ${money(r.rv_fee_per_night)} per extra RV, per night${night}; at most ${r.max_rvs}.`}
          value={values.rvs} onChange={v => set('rvs', v)} />
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" name={`${idPrefix}-rv-long`} className="mt-0.5" disabled={disabled}
            checked={!!values.rv_over_30ft} onChange={e => set('rv_over_30ft', e.target.checked)} />
          <span>One or more RVs is over 30 feet long <span className="text-slate-500">(they use the alternate exit route)</span></span>
        </label>
      </fieldset>

      {offered.length > 0 && (
        <fieldset>
          <legend className="text-base font-semibold text-slate-900 mb-1">Extras</legend>
          <p className="text-xs text-slate-500 mb-3">Leave blank anything you don’t need.</p>
          <div className="space-y-3">
            {offered.map(a => (
              <div key={a.id} className="flex items-center gap-3">
                <input id={`${idPrefix}-extra-${a.id}`} name={`${idPrefix}-extra-${a.id}`} type="number" inputMode="numeric" min="0" step="1" disabled={disabled}
                  value={qty(a.id)} onChange={e => setQty(a.id, e.target.value)} aria-label={`How many: ${a.name}`}
                  className="w-20 px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:bg-slate-50" />
                <label htmlFor={`${idPrefix}-extra-${a.id}`} className="text-sm text-slate-700 flex-1">
                  <span className="font-medium text-slate-800">{a.name}</span> <span className="text-slate-500">· {money(a.price)} {UNIT[a.unit] || 'each'}</span>
                  {a.description && <span className="block text-xs text-slate-500">{a.description}</span>}
                </label>
              </div>
            ))}
          </div>
        </fieldset>
      )}

      <div>
        <label htmlFor={`${idPrefix}-notes`} className="block text-base font-semibold text-slate-900 mb-1">Anything else we should know?</label>
        <textarea id={`${idPrefix}-notes`} name={`${idPrefix}-notes`} rows={3} disabled={disabled} value={values.notes || ''}
          onChange={e => set('notes', e.target.value)} placeholder="e.g. two of the RVs arrive Friday evening"
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:bg-slate-50" />
      </div>
    </div>
  )
}

export const emptyValues = (v = {}) => ({
  guests: v.guests ?? '', campers: v.campers ?? '', tents: v.tents ?? '', rvs: v.rvs ?? '',
  rv_over_30ft: !!v.rv_over_30ft, notes: v.notes || '',
  extras: (v.extras || []).map(e => ({ addon_id: e.addon_id, quantity: e.quantity })),
})
export { money as fdMoney }
