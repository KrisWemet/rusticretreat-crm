import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { MagnifyingGlassIcon, ArrowLeftIcon, ArrowRightIcon, QuestionMarkCircleIcon } from '@heroicons/react/24/outline'
import { pageGuides, recipes, faq } from '../../help/guides'
import { findBySlug, isRecipe, searchHelp } from '../../help/findGuide'
import { navItems } from '../../components/Sidebar'
import { GuideView, RecipeView } from '../../components/HelpPanel'
import NotFound from '../NotFound'

const iconFor = (path) => navItems.find(n => n.to === path)?.icon || QuestionMarkCircleIcon

function RecipeCard({ r }) {
  return (
    <Link to={`/help/${r.slug}`} className="card card-hover p-4 block">
      <p className="font-medium text-slate-900">{r.title}</p>
      <p className="text-sm text-slate-500 mt-1">{r.summary}</p>
    </Link>
  )
}

function GuideCard({ g }) {
  const Icon = iconFor(g.path)
  return (
    <Link to={`/help/${g.slug}`} className="card card-hover p-4 flex gap-3">
      <Icon className="w-5 h-5 flex-none text-rose-600 mt-0.5" />
      <div className="min-w-0">
        <p className="font-medium text-slate-900">{g.title}</p>
        <p className="text-sm text-slate-500 mt-0.5">{g.summary}</p>
      </div>
    </Link>
  )
}

function Faq({ items }) {
  return (
    <div className="card divide-y divide-slate-100">
      {items.map(f => (
        <details key={f.q} className="group px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-800 list-none flex justify-between gap-3">
            {f.q}<span className="text-slate-400 group-open:rotate-90 transition-transform">›</span>
          </summary>
          <p className="text-sm text-slate-600 mt-2">{f.a}</p>
        </details>
      ))}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-slate-800 mb-3">{title}</h2>
      {children}
    </section>
  )
}

// One guide or recipe, at /help/:slug.
function Article({ slug }) {
  const item = findBySlug(slug)
  if (!item || item.slug === 'help') return <NotFound />
  const recipe = isRecipe(item)
  const hasPage = !recipe && !item.path.includes(':')
  return (
    <div className="p-4 sm:p-6 max-w-3xl space-y-5">
      <Link to="/help" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeftIcon className="w-4 h-4" /> Help & Guides
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-rose-600">{recipe ? 'Step by step' : 'Page guide'}</p>
          <h1 className="page-title mt-0.5">{item.title}</h1>
        </div>
        {hasPage && (
          <Link to={item.path} className="btn-secondary">Go to this page <ArrowRightIcon className="w-4 h-4" /></Link>
        )}
      </div>
      <div className="card p-5">
        {recipe ? <RecipeView recipe={item} /> : <GuideView guide={item} />}
      </div>
    </div>
  )
}

export default function Help() {
  const { slug } = useParams()
  const [query, setQuery] = useState('')
  if (slug) return <Article slug={slug} />

  const results = query.trim() ? searchHelp(query) : null
  const found = results && results.recipes.length + results.pages.length + results.faq.length

  return (
    <div className="p-4 sm:p-6 max-w-5xl space-y-8">
      <div>
        <h1 className="page-title">Help & Guides</h1>
        <p className="page-subtitle">How each page works, and how to run the venue with the CRM. Tip: press <kbd className="px-1.5 py-0.5 rounded border border-slate-200 bg-white text-xs">?</kbd> on any page for help with that page.</p>
      </div>

      <div className="relative max-w-xl">
        <MagnifyingGlassIcon className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input type="search" value={query} onChange={e => setQuery(e.target.value)} aria-label="Search help"
          placeholder="Search help — e.g. deposit, signing link, archive…" className="input-field pl-10" />
      </div>

      {results ? (
        found ? (
          <div className="space-y-8">
            {results.recipes.length > 0 && <Section title="Step by step"><div className="grid gap-3 sm:grid-cols-2">{results.recipes.map(r => <RecipeCard key={r.slug} r={r} />)}</div></Section>}
            {results.pages.length > 0 && <Section title="Page guides"><div className="grid gap-3 sm:grid-cols-2">{results.pages.map(g => <GuideCard key={g.slug} g={g} />)}</div></Section>}
            {results.faq.length > 0 && <Section title="Questions"><Faq items={results.faq} /></Section>}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Nothing matches "{query}". Try a simpler word, like "payment" or "contract".</p>
        )
      ) : (
        <>
          <Section title="Start here: step by step">
            <div className="grid gap-3 sm:grid-cols-2">{recipes.map(r => <RecipeCard key={r.slug} r={r} />)}</div>
          </Section>
          <Section title="Every page">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {pageGuides.filter(g => g.slug !== 'help').map(g => <GuideCard key={g.slug} g={g} />)}
            </div>
          </Section>
          <Section title="Common questions"><Faq items={faq} /></Section>
        </>
      )}
    </div>
  )
}
