const pool = require('../../config/db');
const Booking = require('../models/Booking');
const Vehicle = require('../models/Vehicle');
const Chauffeur = require('../models/Chauffeur');
const {
  generateRef,
  calcBookingQuote,
  normalizeAddOns,
  scoreVehicleFit
} = require('../utils/helpers');
const { sendBookingConfirmation, sendBookingCancellation, sendBookingAssigned } = require('../utils/email');
const { notifyWhatsapp } = require('../utils/whatsapp');
const { t, normalizeLocale } = require('../utils/i18n');
const { loadMergedSettings } = require('../utils/settings');
const mockDb = require('../utils/mockDb');

const USE_MOCK_DB = process.env.USE_MOCK_DB === 'true';

function msg(req, key, params) { return t(req.locale, key, params); }
function getRequestIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || null;
}
function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function canTransitionStatus(fromStatus, toStatus) {
  const flow = {
    pending: ['confirmed', 'rejected', 'cancelled'],
    confirmed: ['chauffeur_assigned', 'cancelled', 'rejected'],
    chauffeur_assigned: ['in_progress', 'cancelled'],
    in_progress: ['completed'],
    completed: [],
    cancelled: [],
    rejected: []
  };
  return (flow[fromStatus] || []).includes(toStatus);
}

function serializeCsv(rows) {
  const header = [
    'booking_ref', 'service_type', 'first_name', 'last_name', 'email', 'country_code',
    'phone', 'pickup_location', 'dropoff_location', 'departure_date', 'departure_time',
    'final_price', 'status', 'chauffeur_name', 'language_code', 'created_at'
  ];
  const escaped = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const lines = [header.join(',')];
  rows.forEach((row) => lines.push(header.map((key) => escaped(row[key])).join(',')));
  return lines.join('\n');
}

async function findVehicle(vehicleId, includeInactive = false) {
  if (USE_MOCK_DB) return mockDb.getVehicleById(vehicleId);
  const activeFilter = includeInactive ? '' : 'AND is_active = true';
  const result = await pool.query(
    `SELECT * FROM vehicles WHERE id = $1 ${activeFilter} LIMIT 1`,
    [Number(vehicleId)]
  );
  return result.rows[0] || null;
}

function buildRecommendationReason(vehicle, criteria) {
  const reasons = [];
  if (Number(vehicle.capacity || 0) >= Number(criteria.passengers || 0)) reasons.push('Capacity fits passenger count');
  if (criteria.add_ons?.pet_friendly && ['suv', 'van'].includes(vehicle.category)) reasons.push('Comfortable for pet-friendly trips');
  if ((criteria.luggage || 0) >= 3 && ['suv', 'van'].includes(vehicle.category)) reasons.push('Better luggage capacity');
  if (criteria.service_type === 'hourly' && vehicle.category === 'business') reasons.push('Optimized for executive hourly rides');
  if (reasons.length === 0) reasons.push('Balanced comfort and price');
  return reasons.join(' \u2022 ');
}

async function validatePromoCode({ code, amount, req }) {
  if (!code) return { promo: null, error: null, status: 200 };

  if (USE_MOCK_DB) {
    const promo = mockDb.getPromoByCode(code);
    if (!promo) return { promo: null, error: msg(req, 'errors.promoNotFound'), status: 404 };
    const hasUsesLeft = promo.max_uses === null || promo.used_count < promo.max_uses;
    const notExpired = !promo.expires_at || new Date(promo.expires_at) >= new Date();
    const minAmountSatisfied = toNumber(amount, 0) >= toNumber(promo.min_amount, 0);

    if (!hasUsesLeft) return { promo: null, error: 'Promo usage limit reached', status: 400 };
    if (!notExpired) return { promo: null, error: 'Promo code expired', status: 400 };
    if (!minAmountSatisfied) return { promo: null, error: `Minimum amount ${promo.min_amount} required to apply this promo`, status: 400 };

    return { promo, error: null, status: 200 };
  }

  const result = await pool.query(
    `SELECT * FROM promo_codes WHERE code = UPPER($1) AND is_active = true LIMIT 1`, [code]
  );
  const promo = result.rows[0];
  if (!promo) return { promo: null, error: msg(req, 'errors.promoNotFound'), status: 404 };
  const hasUsesLeft = promo.max_uses === null || promo.used_count < promo.max_uses;
  const notExpired = !promo.expires_at || new Date(promo.expires_at) >= new Date();
  const minAmountSatisfied = toNumber(amount, 0) >= toNumber(promo.min_amount, 0);

  if (!hasUsesLeft) return { promo: null, error: 'Promo usage limit reached', status: 400 };
  if (!notExpired) return { promo: null, error: 'Promo code expired', status: 400 };
  if (!minAmountSatisfied) return { promo: null, error: `Minimum amount ${promo.min_amount} required to apply this promo`, status: 400 };

  return { promo, error: null, status: 200 };
}

async function calculateQuote(req, payload = req.body) {
  const serviceType = payload.service_type;
  if (!['trip', 'hourly'].includes(serviceType)) return { error: msg(req, 'errors.invalidServiceType'), status: 400 };
  const vehicle = await findVehicle(payload.vehicle_id, false);
  if (!vehicle) return { error: msg(req, 'errors.invalidVehicle'), status: 400 };
  const normalizedAddOns = normalizeAddOns(payload.add_ons || {});
  // Allow admin-defined fixed area pricing to override vehicle base price when applicable
  let fixedRule = null;
  try {
    const settings = await loadMergedSettings();
    const pickupRaw = String(payload.pickup_location || '').toLowerCase();
    const dropoffRaw = String(payload.dropoff_location || '').toLowerCase();

    // Helper: find zone by substring patterns
    const zones = Array.isArray(settings.zones) ? settings.zones : [];
    const findZoneForText = (text) => {
      if (!text) return null;
      for (const z of zones) {
        if (!z) continue;
        const patterns = Array.isArray(z.patterns) ? z.patterns : (typeof z.patterns === 'string' ? z.patterns.split(',').map((s) => s.trim()) : []);
        for (const p of patterns) {
          if (!p) continue;
          const pat = String(p).toLowerCase();
          if (pat === '*' || pat === 'any' || pat === 'anywhere') return z;
          if (text.includes(pat)) return z;
        }
      }
      return null;
    };

    // Try zone-based pricing first (multi-area)
    const zonePrices = Array.isArray(settings.zone_prices) ? settings.zone_prices.filter((r) => r && r.active !== false) : [];
    if (serviceType === 'trip' && zones.length && zonePrices.length && pickupRaw && dropoffRaw) {
      const pZone = findZoneForText(pickupRaw);
      const dZone = findZoneForText(dropoffRaw);
      if (pZone && dZone) {
        // Find candidate zone-price rules
        let candidates = zonePrices.filter((r) => {
          if (!r) return false;
          const origin = String(r.origin_zone || '').toLowerCase();
          const dest = String(r.destination_zone || '').toLowerCase();
          return (origin && dest) && ((origin === String(pZone.id).toLowerCase() && dest === String(dZone.id).toLowerCase()) || (origin === String(dZone.id).toLowerCase() && dest === String(pZone.id).toLowerCase()));
        });
        if (candidates.length > 0) {
          candidates.sort((a, b) => Number((b.priority || 0)) - Number((a.priority || 0)));
          fixedRule = candidates[0];
        }
      }
    }

    // If no zone-based rule matched, fall back to legacy fixed area rules
    if (!fixedRule) {
      const rules = Array.isArray(settings.fixed_area_prices)
        ? settings.fixed_area_prices.filter((r) => {
          if (!r) return false;
          if (r.active === false) return false;
          if (r.price != null && !Number.isNaN(Number(r.price))) return true;
          if (r.prices && typeof r.prices === 'object' && Object.keys(r.prices).length > 0) return true;
          return false;
        })
        : [];

      const matchesPattern = (text, pattern) => {
        if (!pattern) return false;
        // support arrays of patterns
        if (Array.isArray(pattern)) {
          return pattern.some((pat) => matchesPattern(text, pat));
        }
        const p = String(pattern).trim().toLowerCase();
        if (!p) return false;
        if (p === '*' || p === 'any' || p === 'anywhere') return true;
        return text.includes(p);
      };

      if (serviceType === 'trip' && rules.length && pickupRaw && dropoffRaw) {
        let candidates = rules.filter((r) => matchesPattern(pickupRaw, r.origin) && matchesPattern(dropoffRaw, r.destination));
        if (candidates.length === 0) {
          candidates = rules.filter((r) => matchesPattern(pickupRaw, r.destination) && matchesPattern(dropoffRaw, r.origin));
        }
        if (candidates.length > 0) {
          candidates.sort((a, b) => {
            const aOrigin = Array.isArray(a.origin) ? a.origin.join(',') : String(a.origin || '');
            const aDest = Array.isArray(a.destination) ? a.destination.join(',') : String(a.destination || '');
            const bOrigin = Array.isArray(b.origin) ? b.origin.join(',') : String(b.origin || '');
            const bDest = Array.isArray(b.destination) ? b.destination.join(',') : String(b.destination || '');
            const aLen = (aOrigin.length + aDest.length);
            const bLen = (bOrigin.length + bDest.length);
            if (bLen !== aLen) return bLen - aLen;
            const aPr = Number(a.priority || 0);
            const bPr = Number(b.priority || 0);
            return bPr - aPr;
          });
          fixedRule = candidates[0];
        }
      }
    }
  } catch (e) {
    console.warn('Fixed pricing check failed:', e.message);
  }

  // Default to vehicle's base price, then apply fixed rule overrides in priority:
  // 1) vehicle-specific price (rule.vehicle_prices[vehicle.id])
  // 2) category-specific price (rule.prices[vehicle.category])
  // 3) rule-level price (rule.price)
  let effectiveBasePrice = Number(vehicle.base_price || 0);
  if (fixedRule) {
    try {
      // vehicle-specific override
      if (fixedRule.vehicle_prices && typeof fixedRule.vehicle_prices === 'object') {
        const vidKey = String(vehicle.id);
        const vp = fixedRule.vehicle_prices[vidKey] ?? fixedRule.vehicle_prices[vehicle.id];
        if (vp != null && !Number.isNaN(Number(vp))) {
          effectiveBasePrice = Number(vp);
        }
      }

      // category-specific override
      const cat = String(vehicle.category || '').toLowerCase();
      if (fixedRule.prices && typeof fixedRule.prices === 'object') {
        const p = fixedRule.prices[cat];
        if (p != null && !Number.isNaN(Number(p))) {
          effectiveBasePrice = Number(p);
        }
      }

      // rule-level fallback
      if ((fixedRule.price != null && !Number.isNaN(Number(fixedRule.price)))) {
        // if a specific override wasn't applied above, use rule.price
        if (!fixedRule.vehicle_prices && !(fixedRule.prices && fixedRule.prices[cat] != null)) {
          effectiveBasePrice = Number(fixedRule.price);
        }
      }
    } catch (e) {
      // swallow and keep vehicle base price
    }
  }

  const baseQuote = calcBookingQuote({ serviceType, vehicleBasePrice: effectiveBasePrice, hourlyDuration: payload.hourly_duration, transferType: payload.transfer_type, distanceKm: payload.distance_km, addOns: normalizedAddOns, promo: null });
  const promoCheck = await validatePromoCode({ code: payload.promo_code, amount: baseQuote.subtotal_price, req });
  const finalQuote = calcBookingQuote({ serviceType, vehicleBasePrice: effectiveBasePrice, hourlyDuration: payload.hourly_duration, transferType: payload.transfer_type, distanceKm: payload.distance_km, addOns: normalizedAddOns, promo: promoCheck.promo });
  return { status: 200, vehicle, promo: promoCheck.promo, promoError: promoCheck.error, promoStatus: promoCheck.status, quote: finalQuote, fixed_price_rule: fixedRule || null };
}

async function quoteBooking(req, res) {
  try {
    const result = await calculateQuote(req);
    if (result.error) return res.status(result.status).json({ error: result.error });
    let vehicles;
    if (USE_MOCK_DB) { vehicles = mockDb.getAllVehicles(); } else { vehicles = await Vehicle.getActive(); }
    const criteria = { service_type: req.body.service_type, passengers: toNumber(req.body.passengers, 1), luggage: toNumber(req.body.luggage, 0), add_ons: normalizeAddOns(req.body.add_ons || {}) };
    const recommendations = vehicles.map((vehicle) => ({ id: vehicle.id, name: vehicle.name, model: vehicle.model, category: vehicle.category, capacity: vehicle.capacity, base_price: Number(vehicle.base_price), score: scoreVehicleFit(vehicle, { passengers: criteria.passengers, luggage: criteria.luggage, addOns: criteria.add_ons, serviceType: criteria.service_type }), reason: buildRecommendationReason(vehicle, criteria) })).sort((a, b) => b.score - a.score).slice(0, 3);
    return res.json({
      quote: result.quote,
      promo: result.promo ? { code: result.promo.code, discount_type: result.promo.discount_type, discount_value: Number(result.promo.discount_value) } : null,
      promo_error: result.promoError || null,
      recommendations,
      fixed_price_rule: result.fixed_price_rule || null
    });
  } catch (error) {
    console.error('Quote failed:', error.message);
    return res.status(500).json({ error: msg(req, 'errors.quoteFailed') });
  }
}

async function createBooking(req, res) {
  try {
    const quoteResult = await calculateQuote(req);
    if (quoteResult.error) return res.status(quoteResult.status).json({ error: quoteResult.error });
    const chauffeurId = req.body.chauffeur_id ? Number(req.body.chauffeur_id) : null;
    if (chauffeurId) {
      const chauffeur = await Chauffeur.findById(chauffeurId);
      if (!chauffeur || !chauffeur.is_active) return res.status(400).json({ error: msg(req, 'errors.chauffeurNotFound') });
    }
    const bookingPayload = {
      booking_ref: generateRef(), service_type: req.body.service_type, transfer_type: req.body.transfer_type || 'oneway',
      pickup_location: req.body.pickup_location, pickup_lat: req.body.pickup_lat || null, pickup_lng: req.body.pickup_lng || null,
      dropoff_location: req.body.dropoff_location || null, dropoff_lat: req.body.dropoff_lat || null, dropoff_lng: req.body.dropoff_lng || null,
      departure_date: req.body.departure_date, departure_time: req.body.departure_time,
      return_date: req.body.return_date || null, return_time: req.body.return_time || null,
      hourly_duration: req.body.hourly_duration || null, passengers: Number(req.body.passengers), luggage: Number(req.body.luggage || 0),
      flight_number: req.body.flight_number || null,
      vehicle_id: quoteResult.vehicle.id,
      vehicle_snapshot: { name: quoteResult.vehicle.name, model: quoteResult.vehicle.model, category: quoteResult.vehicle.category, base_price: quoteResult.vehicle.base_price, capacity: quoteResult.vehicle.capacity },
      first_name: req.body.first_name, last_name: req.body.last_name, email: req.body.email,
      country_code: req.body.country_code, phone: req.body.phone,
      special_requests: req.body.special_requests || null,
      add_ons: quoteResult.quote.add_ons, add_ons_price: quoteResult.quote.add_ons_price,
      promo_code: quoteResult.promo?.code || null,
      base_price: quoteResult.quote.base_price, discount_amount: quoteResult.quote.discount_amount,
      final_price: quoteResult.quote.final_price, distance_km: quoteResult.quote.distance_km || null,
      language_code: normalizeLocale(req.body.language_code || req.locale),
      chauffeur_id: chauffeurId,
      payment_provider: req.body.payment_provider || null, payment_status: req.body.payment_status || 'pending',
      payment_reference: req.body.payment_reference || null, status: 'pending',
      ip_address: getRequestIp(req), source: req.body.source || 'web'
    };
    let booking;
    if (USE_MOCK_DB) {
      booking = mockDb.createBooking(bookingPayload);
      if (quoteResult.promo) mockDb.incrementPromoUsage(quoteResult.promo.code);
    } else {
      booking = await Booking.create(bookingPayload);
      if (quoteResult.promo) await pool.query('UPDATE promo_codes SET used_count = used_count + 1 WHERE id = $1', [quoteResult.promo.id]);
      await Booking.addLog({ bookingId: booking.id, userId: null, action: 'created', note: 'Booking submitted from website' });
    }
    sendBookingConfirmation(booking).catch(() => {});
    notifyWhatsapp({ event: 'new_booking', booking_ref: booking.booking_ref, customer: `${booking.first_name} ${booking.last_name}`, final_price: booking.final_price }).catch(() => {});
    return res.status(201).json({ message: msg(req, 'messages.bookingCreated'), booking });
  } catch (error) {
    console.error('Create booking failed:', error.message, error.stack);
    console.error('Booking payload attempted:', JSON.stringify(req.body, null, 2));
    console.error('USE_MOCK_DB mode:', USE_MOCK_DB);
    return res.status(500).json({ error: msg(req, 'errors.createBookingFailed') });
  }
}

async function listBookings(req, res) {
  try {
    const data = await Booking.list(req.query);
    return res.json(data);
  } catch (error) {
    console.error('List bookings failed:', error.message);
    return res.status(500).json({ error: msg(req, 'errors.listBookingsFailed') });
  }
}

async function getBooking(req, res) {
  try {
    const booking = await Booking.findById(Number(req.params.id));
    if (!booking) return res.status(404).json({ error: msg(req, 'errors.bookingNotFound') });
    return res.json({ booking });
  } catch (error) {
    console.error('Get booking failed:', error.message);
    return res.status(500).json({ error: msg(req, 'errors.bookingDetailsFailed') });
  }
}

async function lookupBooking(req, res) {
  try {
    const { ref, email } = req.query;
    if (!ref || !email) return res.status(400).json({ error: 'Booking reference and email are required.' });
    const booking = await Booking.findByRefAndEmail(ref.trim(), email.trim());
    if (!booking) return res.status(404).json({ error: msg(req, 'errors.bookingNotFound') });
    return res.json({ booking });
  } catch (error) {
    console.error('Lookup booking failed:', error.message);
    return res.status(500).json({ error: msg(req, 'errors.bookingDetailsFailed') });
  }
}

async function cancelBooking(req, res) {
  try {
    const { ref, email } = req.body;
    if (!ref || !email) return res.status(400).json({ error: 'Booking reference and email are required.' });
    const cancelled = await Booking.cancelByRefAndEmail(ref.trim(), email.trim());
    if (!cancelled) return res.status(404).json({ error: msg(req, 'errors.bookingNotFound') });
    await Booking.addLog({ bookingId: cancelled.id, userId: null, action: 'cancelled', note: 'Customer requested cancellation via website' });
    sendBookingCancellation(cancelled).catch(() => {});
    return res.json({ message: msg(req, 'messages.bookingCancelled'), booking: { booking_ref: cancelled.booking_ref, status: cancelled.status } });
  } catch (error) {
    console.error('Cancel booking failed:', error.message);
    return res.status(500).json({ error: msg(req, 'errors.cancelBookingFailed') });
  }
}

async function getBookingLogs(req, res) {
  try {
    const logs = await Booking.getLogs(Number(req.params.id));
    return res.json({ logs });
  } catch (error) {
    console.error('Get logs failed:', error.message);
    return res.status(500).json({ error: msg(req, 'errors.bookingLogsFailed') });
  }
}

async function addBookingNote(req, res) {
  try {
    const bookingId = Number(req.params.id);
    const note = String(req.body.note || '').trim();
    if (!note) return res.status(400).json({ error: 'Note text is required.' });
    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ error: msg(req, 'errors.bookingNotFound') });
    const noteEntry = {
      admin_id: req.user.id,
      admin_name: req.user.full_name,
      note,
      created_at: new Date().toISOString()
    };
    const notes = await Booking.addInternalNote(bookingId, noteEntry);
    await Booking.addLog({ bookingId, userId: req.user.id, action: 'note_added', note });
    const logs = await Booking.getLogs(bookingId);
    return res.json({ message: 'Note saved.', logs, notes });
  } catch (error) {
    console.error('Add note failed:', error.message);
    return res.status(500).json({ error: 'Unable to save note right now.' });
  }
}

async function updateBookingStatus(req, res) {
  try {
    const allowed = Booking.VALID_STATUSES;
    const status = req.body.status;
    if (!allowed.includes(status)) return res.status(400).json({ error: msg(req, 'errors.invalidBookingStatus') });
    const current = await Booking.findById(Number(req.params.id));
    if (!current) return res.status(404).json({ error: msg(req, 'errors.bookingNotFound') });
    if (current.status !== status && !canTransitionStatus(current.status, status)) {
      return res.status(400).json({ error: `Invalid status transition from ${current.status} to ${status}.` });
    }
    const updated = await Booking.updateStatus(Number(req.params.id), status);
    if (!updated) return res.status(404).json({ error: msg(req, 'errors.bookingNotFound') });
    await Booking.addLog({ bookingId: updated.id, userId: req.user.id, action: 'status_updated', note: `Status changed to ${status}` });
    if (status === 'confirmed') sendBookingConfirmation(updated).catch(() => {});
    if (status === 'cancelled') sendBookingCancellation(updated).catch(() => {});
    return res.json({ booking: updated });
  } catch (error) {
    console.error('Update status failed:', error.message);
    return res.status(500).json({ error: msg(req, 'errors.updateBookingStatusFailed') });
  }
}

async function updateBooking(req, res) {
  try {
    const payload = { ...req.body };
    if (payload.add_ons) payload.add_ons = normalizeAddOns(payload.add_ons);
    const updated = await Booking.updatePartial(Number(req.params.id), payload);
    if (!updated) return res.status(404).json({ error: msg(req, 'errors.bookingNotFound') });
    await Booking.addLog({ bookingId: updated.id, userId: req.user.id, action: 'updated', note: 'Booking details updated' });
    return res.json({ booking: updated });
  } catch (error) {
    console.error('Update booking failed:', error.message);
    return res.status(500).json({ error: msg(req, 'errors.updateBookingFailed') });
  }
}

async function assignChauffeur(req, res) {
  try {
    const bookingId = Number(req.params.id);
    const chauffeurId = req.body.chauffeur_id ? Number(req.body.chauffeur_id) : null;
    const vehicleId = req.body.vehicle_id ? Number(req.body.vehicle_id) : null;

    const current = await Booking.findById(bookingId);
    if (!current) return res.status(404).json({ error: msg(req, 'errors.bookingNotFound') });

    if (!chauffeurId) {
      return res.status(400).json({ error: 'chauffeur_id is required for assignment.' });
    }

    if (chauffeurId) {
      const chauffeur = await Chauffeur.findById(chauffeurId);
      if (!chauffeur || !chauffeur.is_active) return res.status(404).json({ error: msg(req, 'errors.chauffeurNotFound') });
      if (!['available', 'off_duty'].includes(chauffeur.status)) {
        return res.status(400).json({ error: 'Only available or off-duty chauffeurs can be assigned.' });
      }
    }
    const updated = await Booking.updateChauffeurAssignment(bookingId, chauffeurId, vehicleId);
    if (!updated) return res.status(404).json({ error: msg(req, 'errors.bookingNotFound') });
    if (chauffeurId) {
      await Chauffeur.update(chauffeurId, { status: 'on_trip' }).catch(() => {});
    }
    const noteText = chauffeurId
      ? `Assigned chauffeur #${chauffeurId}${vehicleId ? ` with vehicle #${vehicleId}` : ''}`
      : 'Chauffeur unassigned';
    await Booking.addLog({ bookingId: updated.id, userId: req.user.id, action: 'chauffeur_assigned', note: noteText });
    sendBookingAssigned(updated).catch(() => {});
    return res.json({ message: msg(req, 'messages.chauffeurAssigned'), booking: updated });
  } catch (error) {
    console.error('Assign chauffeur failed:', error.message);
    return res.status(500).json({ error: msg(req, 'errors.assignChauffeurFailed') });
  }
}

async function deleteBooking(req, res) {
  try {
    const removed = await Booking.remove(Number(req.params.id));
    if (!removed) return res.status(404).json({ error: msg(req, 'errors.bookingNotFound') });
    return res.json({ success: true });
  } catch (error) {
    console.error('Delete booking failed:', error.message);
    return res.status(500).json({ error: msg(req, 'errors.deleteBookingFailed') });
  }
}

async function bookingStats(req, res) {
  try {
    const stats = await Booking.stats();
    return res.json({ stats });
  } catch (error) {
    console.error('Stats failed:', error.message);
    return res.status(500).json({ error: msg(req, 'errors.statsFailed') });
  }
}

async function bookingAnalytics(req, res) {
  try {
    const [daily, revenue] = await Promise.all([
      Booking.dailyBookings(14),
      Booking.dailyRevenue(7)
    ]);
    return res.json({ daily_bookings: daily, daily_revenue: revenue });
  } catch (error) {
    console.error('Analytics failed:', error.message);
    return res.status(500).json({ error: 'Unable to load analytics.' });
  }
}

async function exportCsv(req, res) {
  try {
    const rows = await Booking.allForExport();
    const csv = serializeCsv(rows);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="bookings-${Date.now()}.csv"`);
    return res.send(csv);
  } catch (error) {
    console.error('CSV export failed:', error.message);
    return res.status(500).json({ error: msg(req, 'errors.csvExportFailed') });
  }
}

async function listVehicles(req, res) {
  try {
    if (USE_MOCK_DB) return res.json({ vehicles: mockDb.getAllVehicles() });
    const vehicles = await Vehicle.getActive();
    return res.json({ vehicles });
  } catch (error) {
    console.error('List vehicles failed:', error.message);
    if (USE_MOCK_DB) return res.json({ vehicles: mockDb.getAllVehicles() });
    return res.status(500).json({ error: msg(req, 'errors.listVehiclesFailed') });
  }
}

async function listAllVehicles(req, res) {
  try {
    if (USE_MOCK_DB) return res.json({ vehicles: mockDb.getAllVehicles() });
    const vehicles = await Vehicle.getAll();
    return res.json({ vehicles });
  } catch (error) {
    console.error('List all vehicles failed:', error.message);
    if (USE_MOCK_DB) return res.json({ vehicles: mockDb.getAllVehicles() });
    return res.status(500).json({ error: msg(req, 'errors.listAllVehiclesFailed') });
  }
}

async function createVehicle(req, res) {
  try {
    const vehicle = await Vehicle.create(req.body);
    return res.status(201).json({ vehicle });
  } catch (error) {
    console.error('Create vehicle failed:', error.message);
    return res.status(500).json({ error: msg(req, 'errors.createVehicleFailed') });
  }
}

async function updateVehicle(req, res) {
  try {
    const vehicle = await Vehicle.update(Number(req.params.id), req.body);
    if (!vehicle) return res.status(404).json({ error: msg(req, 'errors.invalidVehicle') });
    return res.json({ vehicle });
  } catch (error) {
    console.error('Update vehicle failed:', error.message);
    return res.status(500).json({ error: msg(req, 'errors.updateVehicleFailed') });
  }
}

async function deleteVehicle(req, res) {
  try {
    const removed = await Vehicle.remove(Number(req.params.id));
    if (!removed) return res.status(404).json({ error: msg(req, 'errors.invalidVehicle') });
    return res.json({ success: true });
  } catch (error) {
    console.error('Delete vehicle failed:', error.message);
    return res.status(500).json({ error: msg(req, 'errors.deleteVehicleFailed') });
  }
}

async function validatePromo(req, res) {
  try {
    const { code, amount } = req.body;
    if (!code) return res.status(400).json({ error: msg(req, 'errors.promoRequired') });
    const promoCheck = await validatePromoCode({ code, amount, req });
    if (!promoCheck.promo) return res.status(promoCheck.status).json({ valid: false, error: promoCheck.error });
    return res.json({ valid: true, message: msg(req, 'messages.promoApplied'), promo: { id: promoCheck.promo.id, code: promoCheck.promo.code, discount_type: promoCheck.promo.discount_type, discount_value: Number(promoCheck.promo.discount_value) } });
  } catch (error) {
    console.error('Validate promo failed:', error.message);
    return res.status(500).json({ error: msg(req, 'errors.promoValidateFailed') });
  }
}

async function listPromos(req, res) {
  try {
    const result = await pool.query('SELECT * FROM promo_codes ORDER BY id DESC');
    return res.json({ promos: result.rows });
  } catch (error) {
    console.error('List promo failed:', error.message);
    return res.status(500).json({ error: msg(req, 'errors.listPromoFailed') });
  }
}

async function createPromo(req, res) {
  try {
    const result = await pool.query(
      `INSERT INTO promo_codes (code, discount_type, discount_value, max_uses, used_count, expires_at, min_amount, is_active)
       VALUES (UPPER($1), $2, $3, $4, 0, $5, $6, true) RETURNING *`,
      [req.body.code, req.body.discount_type, req.body.discount_value, req.body.max_uses || null, req.body.expires_at || null, req.body.min_amount || 0]
    );
    return res.status(201).json({ promo: result.rows[0] });
  } catch (error) {
    console.error('Create promo failed:', error.message);
    return res.status(500).json({ error: msg(req, 'errors.createPromoFailed') });
  }
}

async function togglePromo(req, res) {
  try {
    const result = await pool.query(`UPDATE promo_codes SET is_active = NOT is_active WHERE id = $1 RETURNING *`, [Number(req.params.id)]);
    if (result.rowCount === 0) return res.status(404).json({ error: msg(req, 'errors.promoNotFound') });
    return res.json({ promo: result.rows[0] });
  } catch (error) {
    console.error('Toggle promo failed:', error.message);
    return res.status(500).json({ error: msg(req, 'errors.togglePromoFailed') });
  }
}

async function geoSearch(req, res) {
  try {
    const q = req.query.q;
    if (!q || String(q).trim().length < 2) return res.status(400).json({ error: msg(req, 'errors.geoQueryShort') });
    const lang = normalizeLocale(req.query?.lang || req.headers['x-lang'] || req.locale || 'en');
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', q);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '15');
    // Hint Nominatim to return localized names
    url.searchParams.set('accept-language', lang);
    const response = await fetch(url, { headers: { 'User-Agent': 'chauffeur-trip-booking/1.0', 'Accept-Language': lang } });
    if (!response.ok) return res.status(502).json({ error: msg(req, 'errors.geoUnavailable') });
    const data = await response.json();
    return res.json({ results: data.map((item) => ({ display_name: item.display_name, lat: item.lat, lon: item.lon })) });
  } catch (error) {
    console.error('Geo search failed:', error.message);
    return res.status(500).json({ error: msg(req, 'errors.geoFailed') });
  }
}

async function listChauffeurs(req, res) {
  try {
    const chauffeurs = await Chauffeur.getAll({
      search: req.query.search ? String(req.query.search).trim() : '',
      assignableOnly: req.query.assignable === 'true'
    });
    return res.json({ chauffeurs });
  } catch (error) {
    console.error('List chauffeurs failed:', error.message);
    return res.status(500).json({ error: msg(req, 'errors.listChauffeursFailed') });
  }
}

async function createChauffeur(req, res) {
  try {
    if (!req.body.full_name || !req.body.phone) return res.status(400).json({ error: msg(req, 'errors.contactRequired') });
    if (req.body.status && !Chauffeur.VALID_STATUSES.includes(req.body.status)) {
      return res.status(400).json({ error: 'Invalid chauffeur status.' });
    }
    const languages = Array.isArray(req.body.languages)
      ? req.body.languages.map((item) => normalizeLocale(item))
      : [normalizeLocale(req.body.language_code || req.locale)];
    const chauffeur = await Chauffeur.create({
      full_name: req.body.full_name, phone: req.body.phone, email: req.body.email || null,
      national_id: req.body.national_id || null, license_number: req.body.license_number || null,
      license_expiry: req.body.license_expiry || null, status: req.body.status || 'available',
      assigned_vehicle_id: req.body.assigned_vehicle_id ? Number(req.body.assigned_vehicle_id) : null,
      languages, notes: req.body.notes || null
    });
    return res.status(201).json({ chauffeur });
  } catch (error) {
    console.error('Create chauffeur failed:', error.message);
    return res.status(500).json({ error: msg(req, 'errors.createChauffeurFailed') });
  }
}

async function updateChauffeur(req, res) {
  try {
    if (req.body.status && !Chauffeur.VALID_STATUSES.includes(req.body.status)) {
      return res.status(400).json({ error: 'Invalid chauffeur status.' });
    }
    const payload = { ...req.body };
    if (Object.prototype.hasOwnProperty.call(payload, 'assigned_vehicle_id')) {
      payload.assigned_vehicle_id = payload.assigned_vehicle_id ? Number(payload.assigned_vehicle_id) : null;
    }
    const chauffeur = await Chauffeur.update(Number(req.params.id), payload);
    if (!chauffeur) return res.status(404).json({ error: msg(req, 'errors.chauffeurNotFound') });
    return res.json({ chauffeur });
  } catch (error) {
    console.error('Update chauffeur failed:', error.message);
    return res.status(500).json({ error: msg(req, 'errors.updateChauffeurFailed') });
  }
}

async function cancelBookingById(req, res) {
  try {
    const bookingId = Number(req.params.id);
    const email = String(req.body?.email || req.query?.email || '').trim();
    if (!bookingId || !email) return res.status(400).json({ error: 'Booking id and email are required.' });

    const cancelled = await Booking.cancelByIdAndEmail(bookingId, email);
    if (!cancelled) {
      return res.status(400).json({ error: 'Unable to cancel booking. It may be too close to pickup or already processed.' });
    }

    await Booking.addLog({ bookingId: cancelled.id, userId: null, action: 'cancelled', note: 'Customer requested cancellation via lookup' });
    sendBookingCancellation(cancelled).catch(() => {});
    return res.json({ message: msg(req, 'messages.bookingCancelled'), booking: { id: cancelled.id, booking_ref: cancelled.booking_ref, status: cancelled.status } });
  } catch (error) {
    console.error('Cancel booking by id failed:', error.message);
    return res.status(500).json({ error: msg(req, 'errors.cancelBookingFailed') });
  }
}

async function deleteChauffeur(req, res) {
  try {
    const removed = await Chauffeur.remove(Number(req.params.id));
    if (!removed) return res.status(404).json({ error: msg(req, 'errors.chauffeurNotFound') });
    return res.json({ success: true });
  } catch (error) {
    console.error('Delete chauffeur failed:', error.message);
    return res.status(500).json({ error: msg(req, 'errors.deleteChauffeurFailed') });
  }
}

async function toggleChauffeur(req, res) {
  try {
    const chauffeur = await Chauffeur.toggle(Number(req.params.id));
    if (!chauffeur) return res.status(404).json({ error: msg(req, 'errors.chauffeurNotFound') });
    return res.json({ chauffeur });
  } catch (error) {
    console.error('Toggle chauffeur failed:', error.message);
    return res.status(500).json({ error: msg(req, 'errors.toggleChauffeurFailed') });
  }
}

module.exports = {
  quoteBooking, createBooking, listBookings, getBooking, lookupBooking, cancelBooking,
  getBookingLogs, addBookingNote, updateBookingStatus, updateBooking, assignChauffeur,
  deleteBooking, bookingStats, bookingAnalytics, exportCsv,
  listVehicles, listAllVehicles, createVehicle, updateVehicle, deleteVehicle,
  validatePromo, listPromos, createPromo, togglePromo,
  geoSearch,
  listChauffeurs, createChauffeur, updateChauffeur, deleteChauffeur, toggleChauffeur,
  cancelBookingById
};
