// Mirrors server/services/packagePricing.js: a package's price for a wedding
// starting on `dateISO` is its season price for that year, else its default.
export function packagePriceFor(pkg, dateISO) {
  const year = dateISO ? String(dateISO).slice(0, 4) : null
  const seasons = pkg?.season_prices || {}
  return year && seasons[year] != null ? Number(seasons[year]) : Number(pkg?.price)
}
