import { useMemo } from 'react'
import { CheckCircleIcon, PencilSquareIcon } from '@heroicons/react/24/solid'

/**
 * Renders a contract template packet.
 *
 * The same component serves three jobs: the venue filling in its own details
 * before sending, the couple filling in theirs and initialling, and either of
 * them reading a document that is already locked. Which one it is comes from
 * `editableFill` and `initialsFor`, not from three separate components — the
 * whole point of the template being data is that the document is described once.
 *
 * The server renders this same vocabulary to static HTML for the printed record
 * (server/services/contractRender.js). Adding a block type means touching both.
 */

const fmtMoney = v => {
  const n = parseFloat(String(v ?? '').replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' }) : ''
}
// Rendered from the ISO parts rather than through a Date, which would shift the
// day for anyone whose timezone is behind UTC.
const fmtDate = v => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? ''))
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (v || '')
}
const fmtTime = v => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(v ?? ''))
  if (!m) return v || ''
  let h = Number(m[1]); const ampm = h >= 12 ? 'p.m.' : 'a.m.'; h = h % 12 || 12
  return `${h}:${m[2]} ${ampm}`
}
const display = (f, v) => {
  if (v == null || v === '') return ''
  if (f.type === 'money') return fmtMoney(v)
  if (f.type === 'date') return fmtDate(v)
  if (f.type === 'time') return fmtTime(v)
  return String(v)
}

const COLS = { 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3' }

function Field({ f, value, onChange, editable, invalid }) {
  if (f.type === 'spacer') return <div className="hidden sm:block" />

  const labelClass = 'block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1'
  const labelText = f.label
    ? <>{f.label}{f.required && editable && <span className="text-rose-500 ml-1">*</span>}</>
    : null

  if (!editable) {
    // Read-only: there is no input here, so this is a caption, not a label.
    // Rendering <label htmlFor="f-…"> pointed at an id that does not exist and
    // was the bulk of the browser's reported form issues. The value carries the
    // id instead, and is described by the caption.
    const shown = display(f, value)
    const capId = `cap-${f.key}`
    return (
      <div>
        {labelText && <div id={capId} className={labelClass}>{labelText}</div>}
        <div
          id={`f-${f.key}-value`}
          aria-labelledby={labelText ? capId : undefined}
          className={`border-b py-1 min-h-[28px] text-[15px] break-words ${shown ? 'border-slate-300 text-slate-900' : 'border-slate-200 text-slate-300'}`}
        >
          {shown || '—'}
        </div>
      </div>
    )
  }

  const label = labelText
    ? <label htmlFor={`f-${f.key}`} className={labelClass}>{labelText}</label>
    : null

  const base = `w-full border rounded-lg px-3 py-2 text-[15px] transition-colors
    focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-400
    ${invalid ? 'border-rose-400 bg-rose-50' : 'border-slate-200 bg-white'}`

  // A few fields carry no visible label because the heading above them already
  // says what they are — Section 13's notes box, for one. They still need a
  // name a screen reader can announce.
  const a11y = f.label ? {} : { 'aria-label': f.ariaLabel || f.placeholder || f.key.replace(/_/g, ' ') }

  return (
    <div>
      {label}
      {f.type === 'textarea' ? (
        <textarea id={`f-${f.key}`} {...a11y} rows={4} className={base} placeholder={f.placeholder || ''}
          value={value || ''} onChange={e => onChange(f.key, e.target.value)} />
      ) : f.type === 'select' ? (
        <select id={`f-${f.key}`} {...a11y} className={base} value={value || ''} onChange={e => onChange(f.key, e.target.value)}>
          <option value="">Select…</option>
          {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input id={`f-${f.key}`} {...a11y} className={base} placeholder={f.placeholder || ''}
          type={f.type === 'money' ? 'text' : (f.type || 'text')}
          inputMode={f.type === 'money' ? 'decimal' : undefined}
          value={value || ''} onChange={e => onChange(f.key, e.target.value)} />
      )}
      {invalid && <p className="text-xs text-rose-600 mt-1">Required</p>}
    </div>
  )
}

function ChoiceBlock({ block, value, onChange, editable, invalid }) {
  const hasCols = Array.isArray(block.columns)
  return (
    <div className="my-4">
      {block.label && (
        <div id={`cg-${block.key}`} className="text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-2">
          {block.label}{block.required && editable && <span className="text-rose-500 ml-1">*</span>}
        </div>
      )}
      <div
        role={editable ? 'radiogroup' : undefined}
        aria-labelledby={editable && block.label ? `cg-${block.key}` : undefined}
        className={`overflow-x-auto rounded-lg border ${invalid ? 'border-rose-400' : 'border-slate-200'}`}
      >
        <table className="w-full text-sm">
          {hasCols && (
            <thead>
              <tr className="bg-slate-50">
                <th className="w-10" />
                {block.columns.map(c => (
                  <th key={c} className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">{c}</th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {block.options.map(o => {
              const on = o.value === value
              // One id per radio, and every cell is a <label for> pointing at it.
              // The row used to be a bare <label> with an onClick and no control
              // inside, which is both an accessibility fault and the reason the
              // browser reported labels with nothing attached.
              const rid = `c-${block.key}-${o.value}`
              return (
                <tr key={o.value} className={on ? 'bg-emerald-50' : ''}>
                  <td className="px-3 py-2 align-top">
                    {editable ? (
                      <input type="radio" id={rid} name={block.key} value={o.value} checked={on}
                        onChange={() => onChange(block.key, o.value)}
                        className="w-4 h-4 text-rose-600 focus:ring-rose-400" />
                    ) : (
                      <span className="text-base" aria-hidden="true">{on ? '☑' : '☐'}</span>
                    )}
                  </td>
                  {o.cells.map((c, i) => (
                    <td key={i} className={`px-3 py-2 align-top ${on ? 'font-semibold text-slate-900' : 'text-slate-500'}`}>
                      {editable
                        ? <label htmlFor={rid} className="cursor-pointer block">{c}</label>
                        : c}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {invalid && <p className="text-xs text-rose-600 mt-1">Please choose one</p>}
    </div>
  )
}

/**
 * One initials block. Both clients initial every one of these, and each click is
 * its own recorded acknowledgment — there is deliberately no "initial
 * everything" shortcut, because separate initials that are applied in bulk are
 * not separate acknowledgments.
 */
function InitialsBlock({ block, index, mine, theirs, onInitial, initialsText, canInitial, highlight }) {
  const done = !!mine
  return (
    <div
      id={`ini-${block.key}`}
      className={`my-5 rounded-xl border-2 px-4 py-3 transition-colors scroll-mt-28
        ${done ? 'border-emerald-200 bg-emerald-50/60'
               : highlight ? 'border-rose-400 bg-rose-50 animate-pulse'
               : canInitial ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {['partner1', 'partner2'].map((role, i) => {
          // Prefer what this signer has just stamped in the browser over the
          // stored copy: mid-session their own box should follow their typing,
          // while their partner's stays as recorded.
          const stored = theirs[role]
          const text = block._me === role ? (mine || '') : (stored?.initials_text ?? stored ?? '')
          return (
            <div key={role} className="flex items-center gap-2">
              <span className="text-xs text-slate-500 whitespace-nowrap">Initials, Client {i + 1}:</span>
              <span className="inline-block min-w-[74px] text-center border-b border-slate-400 pb-0.5 text-lg"
                    style={{ fontFamily: "'Brush Script MT', cursive" }}>
                {text}
              </span>
            </div>
          )
        })}

        {canInitial && (
          done ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-700 text-sm font-semibold ml-auto">
              <CheckCircleIcon className="w-5 h-5" /> Initialled
            </span>
          ) : (
            <button type="button" onClick={() => onInitial(block.key)}
              disabled={!initialsText}
              className="ml-auto inline-flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300
                         disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
              <PencilSquareIcon className="w-4 h-4" />
              {initialsText ? `Initial here (${index})` : 'Enter your initials above first'}
            </button>
          )
        )}
      </div>
      {block.label && <div className="text-[11px] text-slate-400 mt-2">{block.label}</div>}
    </div>
  )
}

function PaymentScheduleTable({ rows }) {
  return (
    <div className="overflow-x-auto my-4 rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50">
            {['Payment', 'Share', 'Amount', 'Payment Schedule'].map(h => (
              <th key={h} className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-slate-100">
              <td className="px-3 py-2 text-slate-700">{r.label}</td>
              <td className="px-3 py-2 text-right whitespace-nowrap text-slate-500">{r.tbd ? 'TBD' : (r.pct != null ? `${r.pct}%` : '')}</td>
              <td className="px-3 py-2 text-right whitespace-nowrap font-semibold text-slate-900">
                {r.amount == null ? 'TBD' : fmtMoney(r.amount)}
              </td>
              <td className="px-3 py-2 text-slate-500">{r.due}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FeeSummary({ breakdown }) {
  if (!breakdown?.total) return null
  const { subtotal, gst, total, rate } = breakdown
  return (
    <div className="my-4 ml-auto max-w-sm rounded-lg border border-slate-200 overflow-hidden">
      <table className="w-full text-sm">
        <tbody>
          <tr className="border-b border-slate-100">
            <td className="px-3 py-2 text-slate-600">Package fee (before tax)</td>
            <td className="px-3 py-2 text-right whitespace-nowrap">{fmtMoney(subtotal)}</td>
          </tr>
          <tr className="border-b border-slate-100">
            <td className="px-3 py-2 text-slate-600">GST ({Math.round(rate * 100)}%)</td>
            <td className="px-3 py-2 text-right whitespace-nowrap">{fmtMoney(gst)}</td>
          </tr>
          <tr className="bg-slate-50">
            <td className="px-3 py-2 font-bold text-slate-900">Total package fee (including GST)</td>
            <td className="px-3 py-2 text-right whitespace-nowrap font-bold text-slate-900">{fmtMoney(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

export default function ContractDocument({
  packet,
  values = {},
  onChange,
  editableFill = null,     // 'venue' | 'client' | null
  paymentSchedule = [],
  feeBreakdown = null,
  initialsFor = null,      // 'partner1' | 'partner2' | null — whose turn it is
  myInitials = {},         // { blockKey: 'AB' }
  allInitials = {},        // { blockKey: { partner1: 'AB', partner2: 'JR' } }
  initialsText = '',
  onInitial,
  invalidFields = {},
  highlightBlock = null,
}) {
  const isEditable = f => editableFill && f === editableFill

  // Numbering the initials blocks 1..12 across the whole packet gives the signer
  // a countable task ("7 of 12") instead of an unbounded scroll.
  const iniIndex = useMemo(() => {
    const m = {}; let n = 0
    for (const doc of packet.documents)
      for (const s of doc.sections)
        for (const b of s.blocks)
          if (b.t === 'initials') m[b.key] = ++n
    return m
  }, [packet])

  const renderBlock = (block, key) => {
    switch (block.t) {
      case 'h1':
        return <h2 key={key} className="text-base font-extrabold tracking-wide text-emerald-900 border-b border-slate-200 pb-1.5 mt-8 mb-3">{block.text}</h2>
      case 'h2':
        return <h3 key={key} className="text-[15px] font-bold text-emerald-900 mt-5 mb-2">{block.text}</h3>
      case 'h3':
        return <h4 key={key} className="text-sm font-bold text-slate-700 mt-4 mb-1.5">{block.text}</h4>
      case 'p':
        return <p key={key} className={`mb-2.5 leading-relaxed ${block.small ? 'text-xs text-slate-500' : 'text-[14px] text-slate-700'}`}>{block.text}</p>
      case 'list':
        return (
          <ul key={key} className="list-disc pl-5 mb-3 space-y-1 text-[14px] text-slate-700">
            {block.items.map((i, n) => <li key={n} className="leading-relaxed">{i}</li>)}
          </ul>
        )
      case 'note':
        return (
          <div key={key} className="my-4 rounded-r-lg border-l-4 border-rose-500 bg-rose-50 px-4 py-3">
            {block.title && <div className="text-[11px] font-extrabold uppercase tracking-wider text-rose-700 mb-1.5">{block.title}</div>}
            {block.text && <p className="text-[13.5px] text-slate-700 leading-relaxed">{block.text}</p>}
            {block.items && (
              <ul className="list-disc pl-5 space-y-1 text-[13.5px] text-slate-700">
                {block.items.map((i, n) => <li key={n}>{i}</li>)}
              </ul>
            )}
          </div>
        )
      case 'table':
        return (
          <div key={key} className="overflow-x-auto my-4 rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              {block.head && (
                <thead><tr className="bg-slate-50">
                  {block.head.map(h => <th key={h} className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">{h}</th>)}
                </tr></thead>
              )}
              <tbody>
                {block.rows.map((r, n) => (
                  <tr key={n} className="border-t border-slate-100">
                    {r.map((c, i) => <td key={i} className="px-3 py-2 text-slate-700 align-top">{c}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      case 'fields':
        return (
          <div key={key} className="my-4">
            {block.label && <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-2">{block.label}</div>}
            <div className={`grid grid-cols-1 ${COLS[block.cols] || COLS[1]} gap-4`}>
              {block.items.map(f => (
                <Field key={f.key} f={f} value={values[f.key]} onChange={onChange}
                  editable={isEditable(f.fill)} invalid={!!invalidFields[f.key]} />
              ))}
            </div>
          </div>
        )
      case 'choice':
        return <ChoiceBlock key={key} block={block} value={values[block.key]} onChange={onChange}
                 editable={isEditable(block.fill)} invalid={!!invalidFields[block.key]} />
      case 'initials':
        return (
          <InitialsBlock
            key={key}
            block={{ ...block, _me: initialsFor }}
            index={`${iniIndex[block.key]} of ${Object.keys(iniIndex).length}`}
            mine={myInitials[block.key]}
            theirs={allInitials[block.key] || {}}
            onInitial={onInitial}
            initialsText={initialsText}
            canInitial={!!initialsFor}
            highlight={highlightBlock === block.key}
          />
        )
      case 'feeSummary':
        return <FeeSummary key={key} breakdown={feeBreakdown} />
      case 'paymentSchedule':
        return <PaymentScheduleTable key={key} rows={paymentSchedule} />
      default:
        return null
    }
  }

  return (
    <div className="space-y-8">
      {packet.documents.map(doc => (
        <article key={doc.key} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <header className="px-6 pt-6 pb-4 border-b-2 border-emerald-900">
            <div className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-emerald-900">
              Rustic Retreat <span className="font-medium normal-case tracking-normal">Weddings &amp; Events Ltd.</span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 mt-2">{doc.title}</h1>
            {doc.subtitle && <div className="text-xs text-slate-500 mt-0.5">{doc.subtitle}</div>}
          </header>
          <div className="px-6 py-5">
            {doc.preamble && (
              <p className="italic text-slate-600 border-l-4 border-slate-200 pl-4 mb-5 text-[14px] leading-relaxed">
                {doc.preamble}
              </p>
            )}
            {doc.sections.map(section => (
              <section key={section.id}>
                {section.blocks.map((b, i) => renderBlock(b, `${doc.key}-${section.id}-${i}`))}
              </section>
            ))}
            {doc.appendix && (
              <div className="mt-8">
                <h2 className="text-base font-extrabold tracking-wide text-emerald-900 border-b border-slate-200 pb-1.5 mb-3">
                  {doc.appendix.title}
                </h2>
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-sm">
                    <tbody>
                      {doc.appendix.rows.map((r, i) => (
                        <tr key={i} className="border-t border-slate-100 first:border-t-0">
                          <td className="px-3 py-2 text-slate-400 whitespace-nowrap w-1/3">{r[0]}</td>
                          <td className="px-3 py-2 text-slate-700">{r[1]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </article>
      ))}
    </div>
  )
}
