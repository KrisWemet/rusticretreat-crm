import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { format, parseISO } from 'date-fns'
import toast from 'react-hot-toast'

const STAGES = [
  { key: 'inquiry',  label: 'Inquiry',  accent: 'border-t-slate-300',  dot: 'bg-slate-400' },
  { key: 'tour',     label: 'Tour',     accent: 'border-t-amber-300',  dot: 'bg-amber-400' },
  { key: 'proposal', label: 'Proposal', accent: 'border-t-blue-300',   dot: 'bg-blue-400' },
  { key: 'booked',   label: 'Booked',   accent: 'border-t-emerald-300', dot: 'bg-emerald-500' },
  { key: 'lost',     label: 'Lost',     accent: 'border-t-rose-200',   dot: 'bg-rose-300' },
]

function fmtDate(v) {
  if (!v) return null
  try { return format(parseISO(v), 'MMM d, yyyy') } catch { return v }
}

export default function Pipeline() {
  const { getAdminAxios } = useAuth()
  const [couples, setCouples] = useState([])
  const [loading, setLoading] = useState(true)
  const [dragId, setDragId] = useState(null)
  const [dragOver, setDragOver] = useState(null)

  const api = getAdminAxios()

  function load() {
    api.get('/api/couples')
      .then(r => setCouples(r.data))
      .catch(() => toast.error('Failed to load pipeline'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const stageOf = (c) => c.pipeline_stage || 'inquiry'

  async function moveTo(coupleId, stage) {
    const couple = couples.find(c => c.id === coupleId)
    if (!couple || stageOf(couple) === stage) return
    // Optimistic update
    setCouples(cs => cs.map(c => c.id === coupleId ? { ...c, pipeline_stage: stage } : c))
    try {
      await api.patch(`/api/couples/${coupleId}/stage`, { pipeline_stage: stage })
    } catch {
      toast.error('Could not move card')
      load()
    }
  }

  function onDrop(e, stage) {
    e.preventDefault()
    setDragOver(null)
    if (dragId != null) moveTo(dragId, stage)
    setDragId(null)
  }

  const valueOf = (list) => list.reduce((s, c) => s + (c.budget_total || 0), 0)

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="page-title">Sales Pipeline</h1>
        <p className="page-subtitle">Drag couples between stages as they move toward booking</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-7 w-7 border-2 border-rose-200 border-t-rose-500" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-3">
          {STAGES.map(stage => {
            const list = couples.filter(c => stageOf(c) === stage.key)
            const value = valueOf(list)
            return (
              <div
                key={stage.key}
                onDragOver={e => { e.preventDefault(); setDragOver(stage.key) }}
                onDragLeave={() => setDragOver(o => o === stage.key ? null : o)}
                onDrop={e => onDrop(e, stage.key)}
                className={`rounded-xl bg-slate-50 border-t-4 ${stage.accent} ${dragOver === stage.key ? 'ring-2 ring-rose-300 bg-rose-50/40' : ''} transition-colors`}
              >
                <div className="px-3 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${stage.dot}`} />
                    <span className="text-sm font-semibold text-slate-700">{stage.label}</span>
                    <span className="text-xs text-slate-400">{list.length}</span>
                  </div>
                  {value > 0 && <span className="text-xs text-slate-400">${value.toLocaleString()}</span>}
                </div>
                <div className="px-2 pb-3 space-y-2 min-h-[120px]">
                  {list.map(c => (
                    <div
                      key={c.id}
                      draggable
                      onDragStart={() => setDragId(c.id)}
                      onDragEnd={() => { setDragId(null); setDragOver(null) }}
                      className={`bg-white rounded-lg border border-slate-100 p-3 shadow-sm cursor-grab active:cursor-grabbing ${dragId === c.id ? 'opacity-50' : ''}`}
                    >
                      <Link to={`/clients/${c.id}`} className="font-medium text-sm text-slate-800 hover:text-rose-600">
                        {c.partner1_name} & {c.partner2_name}
                      </Link>
                      {c.venue_package && <div className="text-xs text-slate-500 mt-1">{c.venue_package}</div>}
                      {c.wedding_date && <div className="text-xs text-slate-400 mt-0.5">{fmtDate(c.wedding_date)}</div>}
                      {c.budget_total > 0 && (
                        <div className="text-xs font-medium text-emerald-600 mt-1">${c.budget_total.toLocaleString()}</div>
                      )}
                      {c.referral_source && (
                        <div className="text-[10px] text-slate-400 mt-1.5 inline-block bg-slate-50 px-1.5 py-0.5 rounded">{c.referral_source}</div>
                      )}
                    </div>
                  ))}
                  {list.length === 0 && (
                    <div className="text-center text-xs text-slate-300 py-6">Drop here</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
