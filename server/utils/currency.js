const DEFAULT_BASE = 'BHD';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const cache = {
  base: DEFAULT_BASE,
  rates: {},
  expiresAt: 0
};

async function fetchRates(base = DEFAULT_BASE, symbols = null) {
  const normalizedBase = String((base || DEFAULT_BASE)).toUpperCase();
  if (cache.base === normalizedBase && cache.rates && Date.now() < cache.expiresAt) {
    return cache.rates;
  }

  const url = new URL('https://api.exchangerate.host/latest');
  url.searchParams.set('base', normalizedBase);
  if (symbols) url.searchParams.set('symbols', Array.isArray(symbols) ? symbols.join(',') : String(symbols));

  const res = await fetch(url.toString(), { headers: { 'User-Agent': 'chauffeur-trip-booking/1.0' } });
  if (!res.ok) {
    throw new Error(`Rate provider responded ${res.status}`);
  }

  const data = await res.json();
  if (!data || !data.rates) {
    throw new Error('Invalid response from rate provider');
  }

  cache.base = normalizedBase;
  cache.rates = data.rates;
  cache.expiresAt = Date.now() + CACHE_TTL_MS;
  return cache.rates;
}

async function getRate(from = DEFAULT_BASE, to) {
  if (!to) throw new Error('Target currency required');
  const f = String((from || DEFAULT_BASE)).toUpperCase();
  const t = String(to).toUpperCase();
  if (f === t) return 1;
  const rates = await fetchRates(f, t);
  const rate = rates[t];
  if (typeof rate !== 'number') throw new Error('Rate not available');
  return rate;
}

async function convert(amount = 1, from = DEFAULT_BASE, to) {
  const rate = await getRate(from, to);
  const converted = Number((Number(amount || 0) * rate).toFixed(3));
  return { amount: converted, rate };
}

function clearCache() {
  cache.base = DEFAULT_BASE;
  cache.rates = {};
  cache.expiresAt = 0;
}

module.exports = {
  convert,
  getRate,
  fetchRates,
  clearCache
};
