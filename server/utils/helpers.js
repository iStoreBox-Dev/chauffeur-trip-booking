const crypto = require('crypto');

function sanitizeValue(value) {
  if (typeof value !== 'string') {
    return value;
  }

  return value
    .replace(/[<>`"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizePayload(payload) {
  if (Array.isArray(payload)) {
    return payload.map((item) => sanitizePayload(item));
  }

  if (payload && typeof payload === 'object') {
    return Object.keys(payload).reduce((acc, key) => {
      acc[key] = sanitizePayload(payload[key]);
      return acc;
    }, {});
  }

  return sanitizeValue(payload);
}

function generateRef() {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `CH-${datePart}-${randomPart}`;
}

function formatBHD(value) {
  const amount = Number(value) || 0;
  return `BHD ${amount.toFixed(3)}`;
}

function calcPrice({ serviceType, vehicleBasePrice, hourlyDuration, transferType, distanceKm }) {
  const base = Number(vehicleBasePrice) || 0;
  const distanceFactor = Number(distanceKm) > 0 ? Number(distanceKm) * 0.15 : 0;

  if (serviceType === 'hourly') {
    const hours = Math.max(1, Number(hourlyDuration) || 1);
    return Number((base * hours).toFixed(3));
  }

  const transferMultiplier = transferType === 'roundtrip' ? 1.9 : 1;
  return Number(((base + distanceFactor) * transferMultiplier).toFixed(3));
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');

  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

module.exports = {
  sanitizePayload,
  sanitizeValue,
  generateRef,
  formatBHD,
  calcPrice,
  safeEqual
};
