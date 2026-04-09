const { convert } = require('../utils/currency');

async function convertEndpoint(req, res) {
  const amount = Number(req.query.amount ?? req.body?.amount ?? 1);
  const from = String(req.query.from ?? req.body?.from ?? 'BHD').toUpperCase();
  const to = String(req.query.to ?? req.body?.to ?? '').toUpperCase();

  if (!to) return res.status(400).json({ error: 'Target currency (to) is required' });

  try {
    const converted = await convert(amount, from, to);
    return res.json({ converted, from, to });
  } catch (err) {
    console.error('Currency convert failed:', err && err.stack ? err.stack : err.message);
    // Allow a debug query param to return provider error for troubleshooting
    if (req.query?.debug === '1' || process.env.NODE_ENV === 'development') {
      return res.status(502).json({ error: 'Currency conversion unavailable', details: err.message });
    }
    return res.status(502).json({ error: 'Currency conversion unavailable' });
  }
}

module.exports = {
  convert: convertEndpoint
};
