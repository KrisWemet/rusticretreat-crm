// Package prices change by wedding year (the 2028 3-Day is $7,500, the 2027 one
// $6,500). A package keeps its default `price` and an optional `season_prices`
// JSON object mapping a year to the price for weddings in that year, e.g.
// {"2028": 7500}. Prices are before GST, like `price`.

function parseSeasonPrices(raw) {
  if (!raw) return {};
  let obj = raw;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw); } catch { return {}; }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
  const out = {};
  for (const [year, price] of Object.entries(obj)) {
    if (/^\d{4}$/.test(year) && Number.isFinite(Number(price)) && Number(price) >= 0) out[year] = Number(price);
  }
  return out;
}

// Validate staff input. Returns the JSON string to store, or throws a message.
function normaliseSeasonPrices(input) {
  if (input == null || input === '') return null;
  const obj = typeof input === 'string' ? JSON.parse(input) : input;
  if (typeof obj !== 'object' || Array.isArray(obj)) throw new Error('season_prices must map a year to a price');
  const out = {};
  for (const [year, price] of Object.entries(obj)) {
    const y = Number(year);
    if (!/^\d{4}$/.test(year) || y < 2020 || y > 2100) throw new Error(`"${year}" is not a valid year`);
    const p = Number(price);
    if (price === '' || !Number.isFinite(p) || p < 0) throw new Error(`The ${year} price must be a positive number`);
    out[year] = Math.round(p * 100) / 100;
  }
  return Object.keys(out).length ? JSON.stringify(out) : null;
}

// Price for a wedding starting on `dateISO`; the default price when that year
// has no season price or the date is unknown.
function priceFor(pkg, dateISO) {
  const year = dateISO ? String(dateISO).slice(0, 4) : null;
  const seasons = parseSeasonPrices(pkg.season_prices);
  return year && seasons[year] != null ? seasons[year] : pkg.price;
}

// Row as the API returns it: season_prices parsed into an object.
function present(pkg) {
  return pkg ? { ...pkg, season_prices: parseSeasonPrices(pkg.season_prices) } : pkg;
}

module.exports = { parseSeasonPrices, normaliseSeasonPrices, priceFor, present };
