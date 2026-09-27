import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../contexts/AuthContext'

// Find a couple from any page, by either partner's name, email or phone.
export default function CoupleSearch() {
  const { getAdminAxios } = useAuth()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const box = useRef(null)

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setResults([]); return }
    const t = setTimeout(() => {
      getAdminAxios().get('/api/couples', { params: { search: term } })
        .then(r => { setResults(r.data.slice(0, 8)); setActive(0); setOpen(true) })
        .catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  useEffect(() => {
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const go = (c) => {
    if (!c) return
    setOpen(false); setQ('')
    navigate(`/clients/${c.id}`)
  }

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); go(results[active]) }
    else if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div ref={box} className="relative w-full max-w-sm">
      <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <input
        type="search"
        value={q}
        onChange={e => setQ(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        onKeyDown={onKey}
        placeholder="Find a couple…"
        aria-label="Find a couple by name, email or phone"
        className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 py-1.5 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-200"
      />
      {open && q.trim().length >= 2 && (
        <ul className="absolute right-0 left-0 mt-1 z-40 max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg py-1">
          {results.length === 0 && <li className="px-3 py-2 text-sm text-slate-400">No couples match “{q.trim()}”</li>}
          {results.map((c, i) => (
            <li key={c.id}>
              <button
                onMouseDown={e => e.preventDefault()}
                onClick={() => go(c)}
                onMouseEnter={() => setActive(i)}
                className={`w-full text-left px-3 py-2 text-sm ${i === active ? 'bg-rose-50' : ''}`}
              >
                <span className="font-medium text-slate-800">{c.partner1_name} &amp; {c.partner2_name}</span>
                <span className="block text-xs text-slate-400 truncate">
                  {[c.email, c.phone, c.status].filter(Boolean).join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
