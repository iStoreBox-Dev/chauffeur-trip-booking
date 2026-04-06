const crypto = require('crypto');

const DEFAULT_ADD_ON_PRICES = Object.freeze({
  child_seat: 2.5,
  extra_luggage: 1.2,
  pet_friendly: 3.0
});

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

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

function calcBaseFare({ serviceType, vehicleBasePrice, hourlyDuration, transferType, distanceKm }) {
  const base = Number(vehicleBasePrice) || 0;
  const distanceFactor = Number(distanceKm) > 0 ? Number(distanceKm) * 0.15 : 0;

  if (serviceType === 'hourly') {
    const hours = Math.max(1, Number(hourlyDuration) || 1);
    return Number((base * hours).toFixed(3));
  }

  const transferMultiplier = transferType === 'roundtrip' ? 1.9 : 1;
  return Number(((base + distanceFactor) * transferMultiplier).toFixed(3));
}

function normalizeAddOns(addOns = {}) {
  const source = addOns && typeof addOns === 'object' ? addOns : {};

  const childSeatCount = clamp(Math.floor(toNumber(source.child_seat_count, 0)), 0, 4);
  const extraLuggageCount = clamp(Math.floor(toNumber(source.extra_luggage_count, 0)), 0, 8);

  const normalized = {
    child_seat: Boolean(source.child_seat) || childSeatCount > 0,
    child_seat_count: childSeatCount,
    extra_luggage: Boolean(source.extra_luggage) || extraLuggageCount > 0,
    extra_luggage_count: extraLuggageCount,
    pet_friendly: Boolean(source.pet_friendly)
  };

  if (!normalized.child_seat) {
    normalized.child_seat_count = 0;
  }

  if (!normalized.extra_luggage) {
    normalized.extra_luggage_count = 0;
  }

  return normalized;
}

function calcAddOnsPrice(addOns = {}, prices = DEFAULT_ADD_ON_PRICES) {
  const normalized = normalizeAddOns(addOns);

  const childSeatCost = normalized.child_seat_count * toNumber(prices.child_seat, DEFAULT_ADD_ON_PRICES.child_seat);
  const extraLuggageCost = normalized.extra_luggage_count * toNumber(prices.extra_luggage, DEFAULT_ADD_ON_PRICES.extra_luggage);
  const petFriendlyCost = normalized.pet_friendly ? toNumber(prices.pet_friendly, DEFAULT_ADD_ON_PRICES.pet_friendly) : 0;

  return Number((childSeatCost + extraLuggageCost + petFriendlyCost).toFixed(3));
}

function calcPromoDiscount(baseAmount, promo) {
  const amount = Math.max(0, toNumber(baseAmount, 0));
  if (!promo || amount === 0) return 0;

  let discount;
  if (promo.discount_type === 'percent') {
    discount = amount * (toNumber(promo.discount_value, 0) / 100);
  } else {
    discount = toNumber(promo.discount_value, 0);
  }

  discount = Math.max(0, discount);
  return Number(Math.min(amount, discount).toFixed(3));
}

function calcBookingQuote({
  serviceType,
  vehicleBasePrice,
  hourlyDuration,
  transferType,
  distanceKm,
  addOns,
  promo
}) {
  const normalizedAddOns = normalizeAddOns(addOns);
  const basePrice = calcBaseFare({
    serviceType,
    vehicleBasePrice,
    hourlyDuration,
    transferType,
    distanceKm
  });
  const addOnsPrice = calcAddOnsPrice(normalizedAddOns);
  const subtotal = Number((basePrice + addOnsPrice).toFixed(3));
  const discountAmount = calcPromoDiscount(subtotal, promo);
  const finalPrice = Number(Math.max(0, subtotal - discountAmount).toFixed(3));

  return {
    base_price: basePrice,
    add_ons: normalizedAddOns,
    add_ons_price: addOnsPrice,
    subtotal_price: subtotal,
    discount_amount: discountAmount,
    final_price: finalPrice,
    distance_km: Number(toNumber(distanceKm, 0).toFixed(2))
  };
}

function calcPrice({ serviceType, vehicleBasePrice, hourlyDuration, transferType, distanceKm }) {
  // Keep existing API behavior: calcPrice returns the base fare only.
  return calcBaseFare({ serviceType, vehicleBasePrice, hourlyDuration, transferType, distanceKm });
}

function scoreVehicleFit(vehicle, criteria = {}) {
  const capacity = Number(vehicle.capacity || 0);
  const passengers = clamp(Math.floor(toNumber(criteria.passengers, 1)), 1, 16);
  const luggage = clamp(Math.floor(toNumber(criteria.luggage, 0)), 0, 16);
  const vehiclePrice = toNumber(vehicle.base_price, 0);

  let score = 0;

  if (capacity >= passengers) {
    score += 30;
    score += Math.max(0, 20 - Math.abs(capacity - passengers) * 3);
  } else {
    score -= 50;
  }

  if (luggage <= 2 && ['economy', 'business'].includes(vehicle.category)) {
    score += 8;
  }

  if (luggage >= 3 && ['suv', 'van'].includes(vehicle.category)) {
    score += 16;
  }

  if (criteria.addOns?.pet_friendly && ['suv', 'van'].includes(vehicle.category)) {
    score += 10;
  }

  if (criteria.serviceType === 'hourly' && vehicle.category === 'business') {
    score += 8;
  }

  // Favor lower prices when fit is similar.
  score += Math.max(0, 12 - vehiclePrice / 8);

  return Number(score.toFixed(2));
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
  DEFAULT_ADD_ON_PRICES,
  normalizeAddOns,
  calcAddOnsPrice,
  calcPromoDiscount,
  calcBookingQuote,
  scoreVehicleFit,
  calcPrice,
  safeEqual
};
