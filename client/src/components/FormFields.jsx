// A form's questions as inputs. Shared by the staff fill-in screen and the
// public page couples open from their private link, so both show the same
// questions the same way. Checkbox answers are stored as 'Yes' / 'No', as the
// portal does.
export function parseOptions(options) {
  if (!options) return []
  try { const v = JSON.parse(options); return Array.isArray(v) ? v : [] } catch { return String(options).split(',').map(s => s.trim()).filter(Boolean) }
}

export default function FormFields({ fields, values, onChange, inputClass = 'input-field' }) {
  const set = (id) => (v) => onChange({ ...values, [id]: v })
  return (
    <div className="space-y-4">
      {fields.map(field => {
        const id = `form-field-${field.id}`
        const val = values[field.id] ?? ''
        const change = set(field.id)
        const label = (
          <label htmlFor={id} className="block text-sm font-medium text-slate-700 mb-1">
            {field.label}{field.required ? <span className="text-red-500"> *</span> : null}
          </label>
        )
        let input
        switch (field.field_type) {
          case 'textarea': input = <textarea id={id} rows={3} className={`${inputClass} resize-y`} value={val} onChange={e => change(e.target.value)} />; break
          case 'number': input = <input id={id} type="number" className={inputClass} value={val} onChange={e => change(e.target.value)} />; break
          case 'date': input = <input id={id} type="date" className={inputClass} value={val} onChange={e => change(e.target.value)} />; break
          case 'select': {
            const opts = parseOptions(field.options)
            input = (
              <select id={id} className={inputClass} value={val} onChange={e => change(e.target.value)}>
                <option value="">Choose…</option>
                {[...opts, ...(val && !opts.includes(val) ? [val] : [])].map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            )
            break
          }
          case 'checkbox': input = (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input id={id} type="checkbox" checked={val === 'Yes'} onChange={e => change(e.target.checked ? 'Yes' : 'No')} className="w-4 h-4 accent-rose-600" /> Yes
            </label>
          ); break
          default: input = <input id={id} type="text" className={inputClass} value={val} onChange={e => change(e.target.value)} />
        }
        return <div key={field.id}>{label}{input}</div>
      })}
    </div>
  )
}
