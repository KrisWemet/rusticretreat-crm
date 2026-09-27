import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { QuestionMarkCircleIcon, XMarkIcon, LightBulbIcon, ArrowRightIcon } from '@heroicons/react/24/outline'
import { recipes } from '../help/guides'
import { findGuide, findBySlug, isRecipe } from '../help/findGuide'

function Steps({ steps }) {
  return (
    <ol className="space-y-1.5 text-sm text-slate-700">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-2.5">
          <span className="flex-none w-5 h-5 mt-px rounded-full bg-rose-50 text-rose-700 text-xs font-semibold flex items-center justify-center">{i + 1}</span>
          <span>{s}</span>
        </li>
      ))}
    </ol>
  )
}

function RelatedLinks({ slugs, onNavigate }) {
  const items = (slugs || []).map(findBySlug).filter(Boolean)
  if (!items.length) return null
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Related</h3>
      <div className="flex flex-wrap gap-2">
        {items.map(it => (
          <Link key={it.slug} to={`/help/${it.slug}`} onClick={onNavigate}
            className="text-xs px-2.5 py-1 rounded-full border border-slate-200 text-slate-600 hover:border-rose-300 hover:text-rose-700">
            {isRecipe(it) ? '📋 ' : ''}{it.title}
          </Link>
        ))}
      </div>
    </div>
  )
}

// A page guide, as shown in both the "?" panel and the Help Center.
export function GuideView({ guide, onNavigate }) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-600">{guide.summary}</p>
      {guide.whatYouCanDo.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">What you can do here</h3>
          <ul className="space-y-1.5 text-sm text-slate-700 list-disc pl-5">
            {guide.whatYouCanDo.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}
      {guide.howTo.map(h => {
        const recipe = h.recipe && findBySlug(h.recipe)
        return (
          <div key={h.title}>
            <h3 className="text-sm font-semibold text-slate-800 mb-2">{h.title}</h3>
            {recipe
              ? <Link to={`/help/${recipe.slug}`} onClick={onNavigate} className="text-sm text-rose-700 hover:underline">Step by step: {recipe.title} →</Link>
              : <Steps steps={h.steps} />}
          </div>
        )
      })}
      {guide.tips.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-100 p-3">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700 mb-2">
            <LightBulbIcon className="w-4 h-4" /> Tips
          </h3>
          <ul className="space-y-1.5 text-sm text-amber-900 list-disc pl-5">
            {guide.tips.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </div>
      )}
      <RelatedLinks slugs={guide.related} onNavigate={onNavigate} />
    </div>
  )
}

// A start-to-finish recipe.
export function RecipeView({ recipe, onNavigate }) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-600">{recipe.summary}</p>
      <Steps steps={recipe.steps} />
      <RelatedLinks slugs={recipe.links} onNavigate={onNavigate} />
    </div>
  )
}

const typing = (el) => el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))

// The "?" button in the header and the slide-in panel with help for the
// current page.
export default function HelpPanel() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const guide = findGuide(location.pathname)

  // Close when the page changes (e.g. after following a link in the panel).
  useEffect(() => { setOpen(false) }, [location.pathname])

  // "?" opens help, unless the user is typing; Escape closes it.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
      else if (e.key === '?' && !e.metaKey && !e.ctrlKey && !typing(document.activeElement)) {
        e.preventDefault(); setOpen(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const close = () => setOpen(false)

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Help for this page" title="Help for this page (press ?)"
        className="flex items-center gap-1.5 p-1.5 sm:px-2.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800">
        <QuestionMarkCircleIcon className="w-6 h-6 sm:w-5 sm:h-5" />
        <span className="hidden sm:inline text-sm">Help</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={guide ? `Help: ${guide.title}` : 'Help'}>
          <div className="absolute inset-0 bg-slate-900/40" onClick={close} aria-hidden="true" />
          <aside className="absolute right-0 top-0 h-full w-full sm:w-[420px] bg-white shadow-xl flex flex-col">
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200">
              <div className="min-w-0">
                <p className="text-xs text-slate-400">Help for this page</p>
                <h2 className="font-semibold text-slate-900 truncate">{guide ? guide.title : 'Getting started'}</h2>
              </div>
              <button onClick={close} aria-label="Close help" className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5">
              {guide ? <GuideView guide={guide} onNavigate={close} /> : (
                <div className="space-y-3">
                  <p className="text-sm text-slate-600">There's no guide for this page. These are good places to start:</p>
                  {recipes.slice(0, 4).map(r => (
                    <Link key={r.slug} to={`/help/${r.slug}`} onClick={close} className="block text-sm text-rose-700 hover:underline">{r.title} →</Link>
                  ))}
                </div>
              )}
            </div>
            <div className="border-t border-slate-200 px-5 py-3">
              <Link to="/help" onClick={close} className="flex items-center gap-1.5 text-sm font-medium text-rose-700 hover:underline">
                Open the full Help Center <ArrowRightIcon className="w-4 h-4" />
              </Link>
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
