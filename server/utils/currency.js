const DEFAULT_BASE = 'BHD';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const cache = {
  base: DEFAULT_BASE,
  rates: {},
  expiresAt: 0
};

function timeout(ms) {
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), ms);
  return { signal: ac.signal, clear: () => clearTimeout(id) };
}

async function tryConvertHost(amount = 1, from = DEFAULT_BASE, to) {
  const url = new URL('https://api.exchangerate.host/convert');
  url.searchParams.set('from', String(from || DEFAULT_BASE).toUpperCase());
  url.searchParams.set('to', String(to).toUpperCase());
  url.searchParams.set('amount', String(amount));

  const t = timeout(8000);
  try {
    const res = await fetch(url.toString(), { headers: { 'User-Agent': 'chauffeur-trip-booking/1.0' }, signal: t.signal });
    t.clear();
    if (!res.ok) throw new Error(`exchangerate.host responded ${res.status}`);
    const data = await res.json();
    if (data && (data.result != null || (data.info && data.info.rate != null))) {
      const rate = data.info?.rate ?? (data.result ? Number(data.result) / Number(amount || 1) : null);
      const converted = data.result != null ? Number(Number(data.result).toFixed(3)) : Number((Number(amount || 0) * rate).toFixed(3));
      return { amount: converted, rate };
    }
    throw new Error('Invalid response from exchangerate.host');
  } catch (err) {
    try { t.clear(); } catch (_) {}
    throw err;
  }
}

async function tryFrankfurter(amount = 1, from = DEFAULT_BASE, to) {
  // Frankfurter supports latest rates: /latest?from=USD&to=EUR
  const url = new URL('https://api.frankfurter.app/latest');
  url.searchParams.set('from', String(from || DEFAULT_BASE).toUpperCase());
  url.searchParams.set('to', String(to).toUpperCase());

  const t = timeout(8000);
  try {
    const res = await fetch(url.toString(), { headers: { 'User-Agent': 'chauffeur-trip-booking/1.0' }, signal: t.signal });
    t.clear();
    if (!res.ok) throw new Error(`frankfurter responded ${res.status}`);
    const data = await res.json();
    if (data && data.rates && typeof data.rates === 'object' && data.rates[String(to).toUpperCase()] != null) {
      const rate = Number(data.rates[String(to).toUpperCase()]);
      const converted = Number((Number(amount || 0) * rate).toFixed(3));
      return { amount: converted, rate };
    }
    throw new Error('Invalid response from frankfurter');
  } catch (err) {
    try { t.clear(); } catch (_) {}
    throw err;
  }
}

async function convert(amount = 1, from = DEFAULT_BASE, to) {
  if (!to) throw new Error('Target currency required');
  const f = String((from || DEFAULT_BASE)).toUpperCase();
  const t = String(to).toUpperCase();
  if (f === t) return { amount: Number((Number(amount || 0)).toFixed(3)), rate: 1 };

  // Primary: exchangerate.host convert endpoint
  try {
    return await tryConvertHost(amount, f, t);
  } catch (err) {
    // fallback: frankfurter
    try {
      return await tryFrankfurter(amount, f, t);
    } catch (err2) {
      // all failed
      const e = new Error(`All rate providers failed: ${err.message}; ${err2.message}`);
      throw e;
    }
  }
}

function clearCache() {
  cache.base = DEFAULT_BASE;
  cache.rates = {};
  cache.expiresAt = 0;
}

module.exports = {
  convert,
  clearCache
};
