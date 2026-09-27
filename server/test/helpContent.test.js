// The built-in help (client/src/help) must cover every sidebar page, and its
// cross-links must point at guides that exist.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const helpDir = path.join(__dirname, '..', '..', 'client', 'src', 'help');
const load = (f) => import(pathToFileURL(path.join(helpDir, f)).href);

// Sidebar routes, read from the source (it is JSX, so it can't be imported here).
const sidebar = fs.readFileSync(path.join(__dirname, '..', '..', 'client', 'src', 'components', 'Sidebar.jsx'), 'utf8');
const navRoutes = [...sidebar.matchAll(/\{\s*to:\s*'([^']+)'/g)].map(m => m[1]);

test('every sidebar page and the couple page has a guide', async () => {
  const { findGuide } = await load('findGuide.js');
  assert.ok(navRoutes.length >= 17, `expected the sidebar routes, found ${navRoutes.length}`);
  for (const route of [...navRoutes, '/clients/12']) {
    assert.ok(findGuide(route), `no help guide for ${route}`);
  }
  assert.strictEqual(findGuide('/clients/12').slug, 'client-page');
  assert.strictEqual(findGuide('/clients').slug, 'clients');
  assert.strictEqual(findGuide('/').slug, 'dashboard');
  assert.strictEqual(findGuide('/no-such-page'), null);
});

test('slugs are unique and every link resolves', async () => {
  const { pageGuides, recipes, faq } = await load('guides.js');
  const slugs = [...pageGuides, ...recipes].map(x => x.slug);
  assert.strictEqual(new Set(slugs).size, slugs.length, 'duplicate help slug');
  const known = new Set(slugs);
  for (const g of pageGuides) {
    for (const s of g.related) assert.ok(known.has(s), `${g.slug} links to missing ${s}`);
    for (const h of g.howTo) {
      if (h.recipe) assert.ok(recipes.some(r => r.slug === h.recipe), `${g.slug} points to missing recipe ${h.recipe}`);
      else assert.ok(Array.isArray(h.steps) && h.steps.length, `${g.slug} "${h.title}" has no steps`);
    }
  }
  for (const r of recipes) {
    assert.ok(r.steps.length >= 3, `${r.slug} is too short`);
    for (const s of r.links) assert.ok(known.has(s), `${r.slug} links to missing ${s}`);
  }
  assert.ok(faq.every(f => f.q && f.a));
});

test('search finds the right material', async () => {
  const { searchHelp } = await load('findGuide.js');
  const pay = searchHelp('e-transfer reference');
  assert.ok(pay.recipes.some(r => r.slug === 'payment-recipe'));
  assert.ok(searchHelp('signing link').faq.length > 0);
  assert.ok(searchHelp('archive').pages.some(g => g.slug === 'client-page'));
  assert.deepStrictEqual(searchHelp('   '), { recipes: [], pages: [], faq: [] });
  const none = searchHelp('zzzqqq');
  assert.strictEqual(none.recipes.length + none.pages.length + none.faq.length, 0);
});
