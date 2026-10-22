import { stayRule, usualEndDate, fitsUsualDays, describeStay } from '../utils/stayDates'

// Check-in / check-out pickers for bookings and proposals. On the package's
// usual days (a 3-Day Weekend is Friday–Sunday) the check-out fills itself in;
// "Custom dates" lets staff choose other days for this couple. The check-out
// is only filled in when someone changes the check-in (or, via withUsualEnd,
// the package), so opening an older booking never rewrites its dates.
export default function StayDates({ idPrefix, start, end, custom, packageName, onChange, required = false }) {
  const rule = stayRule(packageName)
  const isCustom = !!Number(custom)

  const setCustom = (on) => {
    // Turning custom off snaps back to the usual check-out.
    const patch = { custom_dates: on ? 1 : 0 }
    if (!on) { const usual = usualEndDate(start, packageName); if (usual) patch.end_date = usual }
    onChange(patch)
  }

  const summary = describeStay(start, end)
  const fits = fitsUsualDays(start, end, packageName)

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor={`${idPrefix}-check-in`} className="label">Check-In Date</label>
          <input id={`${idPrefix}-check-in`} type="date" className="input-field" value={start || ''} required={required}
            onChange={e => {
              const patch = { event_date: e.target.value }
              const usual = !isCustom && usualEndDate(e.target.value, packageName)
              if (usual) patch.end_date = usual
              onChange(patch)
            }} />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-check-out`} className="label">Check-Out Date</label>
          <input id={`${idPrefix}-check-out`} type="date" className="input-field" value={end || ''} min={start || undefined}
            onChange={e => onChange({ end_date: e.target.value })} />
        </div>
      </div>

      {rule && (
        <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
          <input type="checkbox" className="mt-0.5 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
            checked={isCustom} onChange={e => setCustom(e.target.checked)} />
          <span>Custom dates <span className="text-slate-400">— this couple isn&apos;t using the usual {rule.label}</span></span>
        </label>
      )}

      {summary && (
        rule && !isCustom && !fits ? (
          <p className="text-xs rounded-md bg-amber-50 border border-amber-200 text-amber-800 px-2.5 py-1.5">
            {summary}. This package usually runs {rule.label}. Pick a matching check-in, or tick Custom dates to keep these days.
          </p>
        ) : (
          <p className="text-xs text-slate-500">
            {summary}{isCustom ? ' · custom dates (other bookings and blocked dates are still checked)' : ''}
          </p>
        )
      )}
    </div>
  )
}
