// Lookups over the help content. Kept free of React so the server test can
// import it directly.
import { pageGuides, recipes, faq } from './guides.js'

// Does a route pattern like '/clients/:id' match this pathname?
function matches(pattern, pathname) {
  const want = pattern.split('/').filter(Boolean)
  const got = pathname.split('/').filter(Boolean)
  if (want.length !== got.length) return false
  return want.every((seg, i) => seg.startsWith(':') || seg === got[i])
}

// The guide for the page at this pathname, or null.
export function findGuide(pathname) {
  const clean = (pathname || '/').replace(/\/+$/, '') || '/'
  if (clean === '/') return pageGuides.find(g => g.slug === 'dashboard')
  if (clean.startsWith('/help')) return pageGuides.find(g => g.slug === 'help')
  return pageGuides.find(g => matches(g.path, clean)) || null
}

// A guide or recipe by slug.
export function findBySlug(slug) {
  return pageGuides.find(g => g.slug === slug) || recipes.find(r => r.slug === slug) || null
}

export function isRecipe(item) {
  return !!item && recipes.includes(item)
}

function guideText(g) {
  return [g.title, g.summary, ...g.whatYouCanDo, ...g.tips,
    ...g.howTo.flatMap(h => [h.title, ...(h.steps || [])])].join(' ')
}

// Case-insensitive search; every word must appear. Returns matches grouped
// by kind, best (title) matches first.
export function searchHelp(query) {
  const words = (query || '').toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return { recipes: [], pages: [], faq: [] }
  const hit = (text) => { const t = text.toLowerCase(); return words.every(w => t.includes(w)) }
  const titleFirst = (a, b) => Number(hit(b.title || b.q)) - Number(hit(a.title || a.q))
  return {
    recipes: recipes.filter(r => hit([r.title, r.summary, ...r.steps].join(' '))).sort(titleFirst),
    pages: pageGuides.filter(g => hit(guideText(g))).sort(titleFirst),
    faq: faq.filter(f => hit(`${f.q} ${f.a}`)),
  }
}
