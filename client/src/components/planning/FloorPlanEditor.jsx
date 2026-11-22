import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import { ArrowPathIcon, DocumentDuplicateIcon, TrashIcon, PrinterIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../../contexts/AuthContext'
import { openPrintable } from '../../utils/files'

// Drag-and-drop floor plan with seating. Elements are measured in feet; x/y
// is an element's centre. The printed plan is drawn by the server
// (services/floorPlan.js) from the same data — keep the shapes in step.

const GROUPS = [
  ['Tables', ['round', 'rect', 'long', 'head', 'cocktail']],
  ['Ceremony', ['chairs', 'aisle', 'arch']],
  ['Party', ['dancefloor', 'stage', 'dj', 'bar', 'lounge', 'photo', 'firepit']],
  ['Food & gifts', ['food', 'cake', 'gift']],
  ['Site', ['tent', 'gazebo', 'zone', 'restroom', 'generator', 'tree', 'label']],
]
const FILL = { tree: '#dcfce7', firepit: '#ffedd5', dancefloor: '#f5f3ff', stage: '#f1f5f9', bar: '#fef3c7', food: '#fef3c7' }
// Drawing order: tents and areas underneath, then floors, then tables and
// fixtures, labels on top — so a table on the dance floor can still be picked.
// services/floorPlan.js draws the printed plan in the same order.
const LAYER = { tent: 0, gazebo: 0, zone: 0, aisle: 0, dancefloor: 1, stage: 1, chairs: 1, lounge: 1, label: 3 }
const layer = (t) => LAYER[t] ?? 2
const snap = (v) => Math.round(v * 2) / 2
const newId = () => 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

export default function FloorPlanEditor({ plan, coupleId, onClose, onSaved }) {
  const { getAdminAxios } = useAuth()
  const api = useRef(getAdminAxios()).current
  const [types, setTypes] = useState(null)
  const [items, setItems] = useState(plan.items)
  const [meta, setMeta] = useState({ name: plan.name, width_ft: plan.width_ft, height_ft: plan.height_ft, notes: plan.notes || '' })
  const [selectedId, setSelectedId] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [guests, setGuests] = useState([])
  const svgRef = useRef(null)
  const drag = useRef(null)

  const loadGuests = useCallback(() => api.get(`/api/guests/couple/${coupleId}`).then(r => setGuests(r.data)).catch(() => {}), [api, coupleId])
  useEffect(() => {
    api.get('/api/floorplans/element-types').then(r => setTypes(r.data)).catch(() => toast.error('Could not load the element list'))
    if (coupleId) loadGuests()
  }, [api, coupleId, loadGuests])

  const W = Number(meta.width_ft) || 80, H = Number(meta.height_ft) || 50
  const selected = items.find(i => i.id === selectedId) || null
  const isTable = (t) => !!types?.[t]?.table
  const seatedAt = useMemo(() => {
    const m = {}
    for (const g of guests) if (g.seat_plan_id === plan.id) (m[g.seat_table] = m[g.seat_table] || []).push(g)
    return m
  }, [guests, plan.id])
  const unseated = guests.filter(g => g.rsvp_status !== 'declined' && g.seat_plan_id !== plan.id)
  const tables = items.filter(i => isTable(i.type))

  const change = (fn) => { setItems(fn); setDirty(true) }
  const update = (id, patch) => change(list => list.map(i => (i.id === id ? { ...i, ...patch } : i)))

  const add = (type) => {
    const def = types[type]
    const n = items.filter(i => isTable(i.type)).length + 1
    const label = def.table ? (type === 'head' ? 'Head table' : `Table ${n}`) : (type === 'label' ? 'Label' : '')
    // Start in the middle, stepping aside from anything already there.
    let x = snap(W / 2), y = snap(H / 2), tries = 0
    while (items.some(i => Math.abs(i.x - x) < 2 && Math.abs(i.y - y) < 2) && tries++ < 20) { x = snap(x + def.w + 1); if (x > W - 2) { x = snap(def.w); y = snap(y + def.h + 2) } }
    const item = { id: newId(), type, x, y, w: def.w, h: def.h, rotation: 0, label, seats: def.seats }
    change(list => [...list, item]); setSelectedId(item.id)
  }

  const removeSelected = () => { if (!selected) return; change(list => list.filter(i => i.id !== selected.id)); setSelectedId(null) }
  const duplicate = () => {
    if (!selected) return
    const n = items.filter(i => isTable(i.type)).length + 1
    const copy = { ...selected, id: newId(), x: snap(selected.x + selected.w + 1), label: isTable(selected.type) && /^Table \d+$/.test(selected.label) ? `Table ${n}` : selected.label }
    change(list => [...list, copy]); setSelectedId(copy.id)
  }

  // Pointer position in plan feet, whatever the zoom.
  const toPlan = (e) => {
    const svg = svgRef.current
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY
    const p = pt.matrixTransform(svg.getScreenCTM().inverse())
    return { x: p.x, y: p.y }
  }
  const startDrag = (e, it) => {
    e.stopPropagation()
    setSelectedId(it.id)
    const p = toPlan(e)
    drag.current = { id: it.id, dx: p.x - it.x, dy: p.y - it.y }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onMove = (e) => {
    if (!drag.current) return
    const p = toPlan(e)
    const { id, dx, dy } = drag.current
    update(id, { x: snap(p.x - dx), y: snap(p.y - dy) })
  }
  const endDrag = () => { drag.current = null }

  // Delete removes the selected element; arrows nudge it (Shift for 5 ft).
  useEffect(() => {
    const onKey = (e) => {
      if (!selected || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return
      const step = e.shiftKey ? 5 : 0.5
      const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSelected() }
      else if (moves[e.key]) { e.preventDefault(); update(selected.id, { x: snap(selected.x + moves[e.key][0]), y: snap(selected.y + moves[e.key][1]) }) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const save = async () => {
    setSaving(true)
    try {
      const { data } = await api.put(`/api/floorplans/${plan.id}`, { ...meta, items })
      setItems(data.items); setDirty(false)
      if (data.unseated) { toast(`${data.unseated} guest${data.unseated === 1 ? ' was' : 's were'} unseated because their table was removed.`); loadGuests() }
      else toast.success('Floor plan saved')
      onSaved?.(data)
      return true
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not save the plan')
      return false
    } finally { setSaving(false) }
  }

  // Seating goes straight to the server, which only knows saved tables — so
  // unsaved changes are saved first.
  const seat = async (guestId, tableId) => {
    if (dirty && !(await save())) return
    try {
      const { data } = await api.put(`/api/floorplans/${plan.id}/seats`, { assignments: [{ guest_id: Number(guestId), table: tableId }] })
      const byId = Object.fromEntries(data.map(g => [g.id, g]))
      setGuests(list => list.map(g => (byId[g.id] ? { ...g, ...byId[g.id] } : g)))
    } catch (err) { toast.error(err.response?.data?.error || 'Could not change the seating') }
  }

  const print = async () => {
    if (dirty && !(await save())) return
    try { await openPrintable(api, `/api/floorplans/${plan.id}/print`) } catch (err) { toast.error(err.message || 'Could not open the plan') }
  }

  const close = () => { if (!dirty || confirm('Close without saving your changes to this plan?')) onClose() }

  if (!types) return <div className="card p-6 text-sm text-slate-400">Loading the editor…</div>

  const fs = Math.max(0.9, Math.min(W, H) / 45)
  const grid = []
  const step = W > 150 ? 10 : 5
  for (let x = 0; x <= W; x += step) grid.push(<line key={`x${x}`} x1={x} y1={0} x2={x} y2={H} />)
  for (let y = 0; y <= H; y += step) grid.push(<line key={`y${y}`} x1={0} y1={y} x2={W} y2={y} />)

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50">
        <label htmlFor="fp-name" className="sr-only">Plan name</label>
        <input id="fp-name" name="fp-name" className="input-field w-56 font-medium" value={meta.name} onChange={e => { setMeta(m => ({ ...m, name: e.target.value })); setDirty(true) }} />
        <span className="text-xs text-slate-500">{dirty ? 'Unsaved changes' : 'All changes saved'}</span>
        <div className="flex-1" />
        <button className="btn-primary" onClick={save} disabled={saving || !dirty}>{saving ? 'Saving…' : 'Save'}</button>
        <button className="btn-secondary" onClick={print}><PrinterIcon className="w-4 h-4" /> Print</button>
        <button className="btn-ghost" onClick={close} aria-label="Close the editor"><XMarkIcon className="w-5 h-5" /></button>
      </div>

      <div className="flex flex-col xl:flex-row">
        {/* Palette */}
        <div className="xl:w-44 p-3 border-b xl:border-b-0 xl:border-r border-slate-100 space-y-3">
          {GROUPS.map(([name, keys]) => (
            <div key={name}>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">{name}</div>
              <div className="flex flex-wrap xl:flex-col gap-1">
                {keys.filter(k => types[k]).map(k => (
                  <button key={k} type="button" onClick={() => add(k)} className="text-left text-xs px-2 py-1.5 rounded-md bg-white border border-slate-200 hover:border-rose-300 hover:bg-rose-50 text-slate-700">
                    + {types[k].label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Canvas */}
        <div className="flex-1 min-w-0 p-3 bg-slate-100/60">
          <svg ref={svgRef} viewBox={`-1 -1 ${W + 2} ${H + 2}`} className="w-full h-auto bg-white rounded-lg shadow-inner select-none"
            style={{ touchAction: 'none', maxHeight: '70vh' }} role="application" aria-label={`Floor plan ${meta.name}, ${W} by ${H} feet`}
            onPointerMove={onMove} onPointerUp={endDrag} onPointerLeave={endDrag} onPointerDown={() => setSelectedId(null)}>
            <rect x={0} y={0} width={W} height={H} fill="#fff" stroke="#94a3b8" strokeWidth={0.2} />
            <g stroke="#e5e7eb" strokeWidth={0.08}>{grid}</g>
            {[...items].sort((a, b) => layer(a.type) - layer(b.type)).map(it => {
              const def = types[it.type] || {}
              const sel = it.id === selectedId
              const stroke = sel ? '#e11d48' : (def.table ? '#334155' : '#64748b')
              const sw = sel ? 0.35 : 0.18
              const hw = it.w / 2, hh = it.h / 2
              const seated = seatedAt[it.id]?.length || 0
              const over = def.table && seated > it.seats
              let body
              if (def.shape === 'ellipse') body = <ellipse rx={hw} ry={hh} fill={FILL[it.type] || (def.table ? '#fff' : '#f1f5f9')} stroke={stroke} strokeWidth={sw} />
              else if (def.shape === 'outline') body = <rect x={-hw} y={-hh} width={it.w} height={it.h} fill="rgba(148,163,184,0.06)" stroke={stroke} strokeWidth={sw} strokeDasharray="0.8 0.5" />
              else if (def.shape === 'rows') body = (
                <g><rect x={-hw} y={-hh} width={it.w} height={it.h} fill="rgba(148,163,184,0.06)" stroke={stroke} strokeWidth={sw} strokeDasharray="0.8 0.5" />
                  {Array.from({ length: Math.max(0, Math.floor((it.h - 1) / 2)) }, (_, r) => <line key={r} x1={-hw} x2={hw} y1={-hh + 1 + r * 2} y2={-hh + 1 + r * 2} stroke="#94a3b8" strokeWidth={0.12} />)}</g>)
              else if (def.shape === 'text') body = <rect x={-hw} y={-hh} width={it.w} height={it.h} fill="transparent" stroke={sel ? stroke : 'none'} strokeWidth={sw} strokeDasharray="0.5 0.4" />
              else body = <rect x={-hw} y={-hh} width={it.w} height={it.h} rx={0.2} fill={FILL[it.type] || (def.table ? '#fff' : '#f1f5f9')} stroke={stroke} strokeWidth={sw} />
              const name = it.label || (def.table ? '' : def.label)
              const sub = def.table ? `${seated}/${it.seats}` : (it.type === 'chairs' ? `${it.seats} chairs` : '')
              return (
                <g key={it.id} style={{ cursor: 'move' }} onPointerDown={e => startDrag(e, it)}>
                  <g transform={`translate(${it.x} ${it.y}) rotate(${it.rotation || 0})`}>{body}</g>
                  <g transform={`translate(${it.x} ${it.y})`} pointerEvents="none">
                    {name && <text y={sub ? -fs * 0.2 : fs * 0.35} fontSize={fs} textAnchor="middle" fontWeight="600" fill="#0f172a">{name}</text>}
                    {sub && <text y={fs} fontSize={fs * 0.8} textAnchor="middle" fill={over ? '#dc2626' : '#475569'}>{sub}</text>}
                  </g>
                </g>
              )
            })}
          </svg>
          <p className="text-xs text-slate-500 mt-2">Drag to move. Select an element to change it; Delete removes it and the arrow keys nudge it (hold Shift for 5 ft). Grid squares are {step} ft.</p>
        </div>

        {/* Properties and seating */}
        <div className="xl:w-80 p-4 border-t xl:border-t-0 xl:border-l border-slate-100 space-y-4">
          {selected ? (
            <>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-900">{types[selected.type]?.label}</h3>
                <button className="text-xs text-slate-500 hover:text-slate-800" onClick={() => setSelectedId(null)}>Done</button>
              </div>
              <Field label="Label"><input id="fp-label" className="input-field" value={selected.label} onChange={e => update(selected.id, { label: e.target.value })} /></Field>
              {(isTable(selected.type) || selected.type === 'chairs') && (
                <Field label={selected.type === 'chairs' ? 'Chairs' : 'Seats'}><input id="fp-seats" type="number" min="0" max="400" className="input-field" value={selected.seats} onChange={e => update(selected.id, { seats: Math.max(0, Number(e.target.value) || 0) })} /></Field>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Width (ft)"><input id="fp-w" type="number" step="0.5" min="0.5" className="input-field" value={selected.w} onChange={e => update(selected.id, { w: Math.max(0.5, Number(e.target.value) || 0.5) })} /></Field>
                <Field label="Length (ft)"><input id="fp-h" type="number" step="0.5" min="0.5" className="input-field" value={selected.h} onChange={e => update(selected.id, { h: Math.max(0.5, Number(e.target.value) || 0.5) })} /></Field>
              </div>
              <div className="flex items-end gap-2">
                <Field label="Rotation (°)"><input id="fp-rot" type="number" step="15" className="input-field" value={selected.rotation || 0} onChange={e => update(selected.id, { rotation: ((Number(e.target.value) || 0) % 360 + 360) % 360 })} /></Field>
                <button className="btn-secondary px-3" onClick={() => update(selected.id, { rotation: ((selected.rotation || 0) + 15) % 360 })} aria-label="Rotate 15 degrees"><ArrowPathIcon className="w-4 h-4" /></button>
              </div>
              <div className="flex gap-2">
                <button className="btn-secondary flex-1 justify-center" onClick={duplicate}><DocumentDuplicateIcon className="w-4 h-4" /> Duplicate</button>
                <button className="btn-secondary flex-1 justify-center text-red-600" onClick={removeSelected}><TrashIcon className="w-4 h-4" /> Delete</button>
              </div>
              {isTable(selected.type) && coupleId && (
                <div className="pt-3 border-t border-slate-100">
                  <div className="text-sm font-medium text-slate-800 mb-2">Seated here ({seatedAt[selected.id]?.length || 0}/{selected.seats})</div>
                  <ul className="space-y-1 mb-2">
                    {(seatedAt[selected.id] || []).map(g => (
                      <li key={g.id} className="flex items-center justify-between text-sm">
                        <span>{g.first_name} {g.last_name}{g.meal_preference ? <span className="text-xs text-slate-400"> · {g.meal_preference}</span> : null}</span>
                        <button className="text-xs text-slate-400 hover:text-red-600" onClick={() => seat(g.id, null)} aria-label={`Unseat ${g.first_name} ${g.last_name}`}>Remove</button>
                      </li>
                    ))}
                  </ul>
                  {unseated.length > 0 ? (
                    <select id="fp-seat-guest" name="fp-seat-guest" aria-label="Seat a guest at this table" className="input-field" value="" onChange={e => e.target.value && seat(e.target.value, selected.id)}>
                      <option value="">+ Seat a guest…</option>
                      {unseated.map(g => <option key={g.id} value={g.id}>{g.first_name} {g.last_name}{g.party ? ` (${g.party})` : ''}{g.seat_plan_id ? ' · seated on another plan' : ''}</option>)}
                    </select>
                  ) : <p className="text-xs text-slate-400">{guests.length ? 'Everyone attending is seated.' : 'Add guests on the Guests tab to seat them.'}</p>}
                </div>
              )}
            </>
          ) : (
            <>
              <h3 className="font-semibold text-slate-900">Plan</h3>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Width (ft)"><input id="fp-pw" type="number" min="10" max="1000" className="input-field" value={meta.width_ft} onChange={e => { setMeta(m => ({ ...m, width_ft: e.target.value })); setDirty(true) }} /></Field>
                <Field label="Length (ft)"><input id="fp-ph" type="number" min="10" max="1000" className="input-field" value={meta.height_ft} onChange={e => { setMeta(m => ({ ...m, height_ft: e.target.value })); setDirty(true) }} /></Field>
              </div>
              <Field label="Setup notes"><textarea id="fp-notes" rows={3} className="input-field resize-y" value={meta.notes} onChange={e => { setMeta(m => ({ ...m, notes: e.target.value })); setDirty(true) }} placeholder="Linens, centrepieces, anything the setup crew needs" /></Field>
              <div className="text-sm text-slate-600">
                {tables.length} table{tables.length === 1 ? '' : 's'} · {tables.reduce((s, t) => s + (t.seats || 0), 0)} seats
              </div>
              {coupleId && (
                <div className="pt-3 border-t border-slate-100">
                  <div className="text-sm font-medium text-slate-800 mb-2">Not seated yet ({unseated.length})</div>
                  {unseated.length === 0 ? <p className="text-xs text-slate-400">{guests.length ? 'Everyone attending is seated.' : 'No guests on the list yet.'}</p> : (
                    <ul className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                      {unseated.map(g => (
                        <li key={g.id} className="flex items-center gap-2 text-sm">
                          <span className="flex-1 min-w-0 truncate">{g.first_name} {g.last_name}</span>
                          {tables.length > 0 && (
                            <select id={`fp-table-${g.id}`} name={`fp-table-${g.id}`} aria-label={`Table for ${g.first_name} ${g.last_name}`} className="text-xs border border-slate-200 rounded-md px-1.5 py-1 max-w-[8rem]" value="" onChange={e => e.target.value && seat(g.id, e.target.value)}>
                              <option value="">Seat at…</option>
                              {tables.map(t => <option key={t.id} value={t.id}>{t.label || 'Unnamed'} ({seatedAt[t.id]?.length || 0}/{t.seats})</option>)}
                            </select>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  const id = children?.props?.id
  return (
    <div className="space-y-1 flex-1">
      <label htmlFor={id} className="block text-xs font-medium text-slate-600">{label}</label>
      {children}
    </div>
  )
}
