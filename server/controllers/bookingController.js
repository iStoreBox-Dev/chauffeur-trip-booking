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
const { sendBookingConfirmation } = require('../utils/email');
const { notifyWhatsapp } = require('../utils/whatsapp');
const { t, normalizeLocale } = require('../utils/i18n');
const mockDb = require('../utils/mockDb');

const USE_MOCK_DB = process.env.USE_MOCK_DB === 'true';

function msg(req, key, params) {
  return t(req.locale, key, params);
}

function getRequestIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || null;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function serializeCsv(rows) {
  const header = [
    'booking_ref', 'service_type', 'first_name', 'last_name', 'email', 'country_code',
    'phone', 'pickup_location', 'dropoff_location', 'departure_date', 'departure_time',
    'final_price', 'status', 'chauffeur_name', 'language_code', 'created_at'
  ];

  const escaped = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const lines = [header.join(',')];

  rows.forEach((row) => {
    lines.push(header.map((key) => escaped(row[key])).join(','));
  });

  return lines.join('\n');
}

async function findVehicle(vehicleId, includeInactive = false) {
  // Use mock database if enabled
  if (USE_MOCK_DB) {
    return mockDb.getVehicleById(vehicleId);
  }

  const activeFilter = includeInactive ? '' : 'AND is_active = true';
  const result = await pool.query(
    `SELECT * FROM vehicles WHERE id = $1 ${activeFilter} LIMIT 1`,
    [Number(vehicleId)]
  );
  return result.rows[0] || null;
}

function buildRecommendationReason(vehicle, criteria) {
  const reasons = [];

  if (Number(vehicle.capacity || 0) >= Number(criteria.passengers || 0)) {
    reasons.push('Capacity fits passenger count');
  }

  if (criteria.add_ons?.pet_friendly && ['suv', 'van'].includes(vehicle.category)) {
    reasons.push('Comfortable for pet-friendly trips');
  }

  if ((criteria.luggage || 0) >= 3 && ['suv', 'van'].includes(vehicle.category)) {
    reasons.push('Better luggage capacity');
  }

  if (criteria.service_type === 'hourly' && vehicle.category === 'business') {
    reasons.push('Optimized for executive hourly rides');
  }

  if (reasons.length === 0) {
    reasons.push('Balanced comfort and price');
  }

  return reasons.join(' • ');
}

async function validatePromoCode({ code, amount, req }) {
  if (!code) {
    return { promo: null, error: null, status: 200 };
  }

  // Use mock database if enabled
  if (USE_MOCK_DB) {
    const promo = mockDb.getPromoByCode(code);
    
    if (!promo) {
      return {
        promo: null,
        error: msg(req, 'errors.promoNotFound'),
        status: 404
      };
    }

    const hasUsesLeft = promo.max_uses === null || promo.used_count < promo.max_uses;
    const notExpired = !promo.expires_at || new Date(promo.expires_at) >= new Date();
    const minAmountSatisfied = toNumber(amount, 0) >= toNumber(promo.min_amount, 0);

    if (!hasUsesLeft || !notExpired || !minAmountSatisfied) {
      return {
        promo: null,
        error: msg(req, 'errors.promoInvalid'),
        status: 400
      };
    }

    return {
      promo,
      error: null,
      status: 200
    };
  }

  // Use real PostgreSQL database
  const result = await pool.query(
    `SELECT * FROM promo_codes
     WHERE code = UPPER($1) AND is_active = true
     LIMIT 1`,
    [code]
  );

  const promo = result.rows[0];
  if (!promo) {
    return {
      promo: null,
      error: msg(req, 'errors.promoNotFound'),
      status: 404
    };
  }

  const hasUsesLeft = promo.max_uses === null || promo.used_count < promo.max_uses;
  const notExpired = !promo.expires_at || new Date(promo.expires_at) >= new Date();
  const minAmountSatisfied = toNumber(amount, 0) >= toNumber(promo.min_amount, 0);

  if (!hasUsesLeft || !notExpired || !minAmountSatisfied) {
    return {
      promo: null,
      error: msg(req, 'errors.promoInvalid'),
      status: 400
    };
  }

  return {
    promo,
    error: null,
    status: 200
  };
}

async function calculateQuote(req, payload = req.body) {
  const serviceType = payload.service_type;

  if (!['trip', 'hourly'].includes(serviceType)) {
    return {
      error: msg(req, 'errors.invalidServiceType'),
      status: 400
    };
  }

  const vehicle = await findVehicle(payload.vehicle_id, false);

  if (!vehicle) {
    return {
      error: msg(req, 'errors.invalidVehicle'),
      status: 400
    };
  }

  const normalizedAddOns = normalizeAddOns(payload.add_ons || {});

  const baseQuote = calcBookingQuote({
    serviceType,
    vehicleBasePrice: vehicle.base_price,
    hourlyDuration: payload.hourly_duration,
    transferType: payload.transfer_type,
    distanceKm: payload.distance_km,
    addOns: normalizedAddOns,
    promo: null
  });

  const promoCheck = await validatePromoCode({
    code: payload.promo_code,
    amount: baseQuote.subtotal_price,
    req
  });

  const finalQuote = calcBookingQuote({
    serviceType,
    vehicleBasePrice: vehicle.base_price,
    hourlyDuration: payload.hourly_duration,
    transferType: payload.transfer_type,
    distanceKm: payload.distance_km,
    addOns: normalizedAddOns,
    promo: promoCheck.promo
  });

  return {
    status: 200,
    vehicle,
    promo: promoCheck.promo,
    promoError: promoCheck.error,
    promoStatus: promoCheck.status,
    quote: finalQuote
  };
}

async function quoteBooking(req, res) {
  try {
    const result = await calculateQuote(req);
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    let vehicles;
    if (USE_MOCK_DB) {
      vehicles = mockDb.getAllVehicles();
    } else {
      vehicles = await Vehicle.getActive();
    }
    const criteria = {
      service_type: req.body.service_type,
      passengers: toNumber(req.body.passengers, 1),
      luggage: toNumber(req.body.luggage, 0),
      add_ons: normalizeAddOns(req.body.add_ons || {})
    };

    const recommendations = vehicles
      .map((vehicle) => ({
        id: vehicle.id,
        name: vehicle.name,
        model: vehicle.model,
        category: vehicle.category,
        capacity: vehicle.capacity,
        base_price: Number(vehicle.base_price),
        score: scoreVehicleFit(vehicle, {
          passengers: criteria.passengers,
          luggage: criteria.luggage,
          addOns: criteria.add_ons,
          serviceType: criteria.service_type
        }),
        reason: buildRecommendationReason(vehicle, criteria)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    return res.json({
      quote: result.quote,
      promo: result.promo
        ? {
            code: result.promo.code,
            discount_type: result.promo.discount_type,
            discount_value: Number(result.promo.discount_value)
          }
        : null,
      promo_error: result.promoError || null,
      recommendations
    });
  } catch (error) {
    console.error('Quote failed:', error.message);
    return res.status(500).json({ error: msg(req, 'errors.quoteFailed') });
  }
}

async function createBooking(req, res) {
  try {
    const quoteResult = await calculateQuote(req);
    if (quoteResult.error) {
      return res.status(quoteResult.status).json({ error: quoteResult.error });
    }

    const chauffeurId = req.body.chauffeur_id ? Number(req.body.chauffeur_id) : null;
    if (chauffeurId) {
      const chauffeur = await Chauffeur.findById(chauffeurId);
      if (!chauffeur || !chauffeur.is_active) {
        return res.status(400).json({ error: msg(req, 'errors.chauffeurNotFound') });
      }
    }

    const bookingPayload = {
      booking_ref: generateRef(),
      service_type: req.body.service_type,
      transfer_type: req.body.transfer_type || 'oneway',
      pickup_location: req.body.pickup_location,
      pickup_lat: req.body.pickup_lat || null,
      pickup_lng: req.body.pickup_lng || null,
      dropoff_location: req.body.dropoff_location || null,
      dropoff_lat: req.body.dropoff_lat || null,
      dropoff_lng: req.body.dropoff_lng || null,
      departure_date: req.body.departure_date,
      departure_time: req.body.departure_time,
      return_date: req.body.return_date || null,
      return_time: req.body.return_time || null,
      hourly_duration: req.body.hourly_duration || null,
      passengers: Number(req.body.passengers),
      luggage: Number(req.body.luggage || 0),
      flight_number: req.body.flight_number || null,
      vehicle_id: quoteResult.vehicle.id,
      vehicle_snapshot: {
        name: quoteResult.vehicle.name,
        model: quoteResult.vehicle.model,
        category: quoteResult.vehicle.category,
        base_price: quoteResult.vehicle.base_price,
        capacity: quoteResult.vehicle.capacity
      },
      first_name: req.body.first_name,
      last_name: req.body.last_name,
      email: req.body.email,
      country_code: req.body.country_code,
      phone: req.body.phone,
      special_requests: req.body.special_requests || null,
      add_ons: quoteResult.quote.add_ons,
      add_ons_price: quoteResult.quote.add_ons_price,
      promo_code: quoteResult.promo?.code || null,
      base_price: quoteResult.quote.base_price,
      discount_amount: quoteResult.quote.discount_amount,
      final_price: quoteResult.quote.final_price,
      distance_km: quoteResult.quote.distance_km || null,
      language_code: normalizeLocale(req.body.language_code || req.locale),
      chauffeur_id: chauffeurId,
      payment_provider: req.body.payment_provider || null,
      payment_status: req.body.payment_status || 'pending',
      payment_reference: req.body.payment_reference || null,
      status: 'pending',
      ip_address: getRequestIp(req),
      source: req.body.source || 'web'
    };

    let booking;
    if (USE_MOCK_DB) {
      booking = mockDb.createBooking(bookingPayload);
      if (quoteResult.promo) {
        mockDb.incrementPromoUsage(quoteResult.promo.code);
      }
    } else {
      booking = await Booking.create(bookingPayload);
      if (quoteResult.promo) {
        await pool.query(
          'UPDATE promo_codes SET used_count = used_count + 1 WHERE id = $1',
          [quoteResult.promo.id]
        );
      }
      await Booking.addLog({
        bookingId: booking.id,
        userId: null,
        action: 'created',
        note: 'Booking submitted from website'
      });
    }

    sendBookingConfirmation(booking).catch(() => {});
    notifyWhatsapp({
      event: 'new_booking',
      booking_ref: booking.booking_ref,
      customer: `${booking.first_name} ${booking.last_name}`,
      final_price: booking.final_price
    }).catch(() => {});

    return res.status(201).json({
      message: msg(req, 'messages.bookingCreated'),
      booking
    });
  } catch (error) {
    console.error('Create booking failed:', error.message);
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
    if (!booking) {
      return res.status(404).json({ error: msg(req, 'errors.bookingNotFound') });
    }

    return res.json({ booking });
  } catch (error) {
    console.error('Get booking failed:', error.message);
    return res.status(500).json({ error: msg(req, 'errors.bookingDetailsFailed') });
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

async function updateBookingStatus(req, res) {
  try {
    const allowed = ['pending', 'confirmed', 'completed', 'cancelled', 'rejected'];
    const status = req.body.status;

    if (!allowed.includes(status)) {
      return res.status(400).json({ error: msg(req, 'errors.invalidBookingStatus') });
    }

    const updated = await Booking.updateStatus(Number(req.params.id), status);
    if (!updated) {
      return res.status(404).json({ error: msg(req, 'errors.bookingNotFound') });
    }

    await Booking.addLog({
      bookingId: updated.id,
      userId: req.user.id,
      action: 'status_updated',
      note: `Status changed to ${status}`
    });

    return res.json({ booking: updated });
  } catch (error) {
    console.error('Update status failed:', error.message);
    return res.status(500).json({ error: msg(req, 'errors.updateBookingStatusFailed') });
  }
}

async function updateBooking(req, res) {
  try {
    const payload = { ...req.body };
    if (payload.add_ons) {
      payload.add_ons = normalizeAddOns(payload.add_ons);
    }

    const updated = await Booking.updatePartial(Number(req.params.id), payload);
    if (!updated) {
      return res.status(404).json({ error: msg(req, 'errors.bookingNotFound') });
    }

    await Booking.addLog({
      bookingId: updated.id,
      userId: req.user.id,
      action: 'updated',
      note: 'Booking details updated'
    });

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

    if (chauffeurId) {
      const chauffeur = await Chauffeur.findById(chauffeurId);
      if (!chauffeur || !chauffeur.is_active) {
        return res.status(404).json({ error: msg(req, 'errors.chauffeurNotFound') });
      }
    }

    const updated = await Booking.updateChauffeur(bookingId, chauffeurId);
    if (!updated) {
      return res.status(404).json({ error: msg(req, 'errors.bookingNotFound') });
    }

    await Booking.addLog({
      bookingId: updated.id,
      userId: req.user.id,
      action: 'chauffeur_assigned',
      note: chauffeurId ? `Assigned chauffeur #${chauffeurId}` : 'Chauffeur unassigned'
    });

    return res.json({
      message: msg(req, 'messages.chauffeurAssigned'),
      booking: updated
    });
  } catch (error) {
    console.error('Assign chauffeur failed:', error.message);
    return res.status(500).json({ error: msg(req, 'errors.assignChauffeurFailed') });
  }
}

async function deleteBooking(req, res) {
  try {
    const removed = await Booking.remove(Number(req.params.id));
    if (!removed) {
      return res.status(404).json({ error: msg(req, 'errors.bookingNotFound') });
    }

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
    if (USE_MOCK_DB) {
      const vehicles = mockDb.getAllVehicles();
      return res.json({ vehicles });
    }
    const vehicles = await Vehicle.getActive();
    return res.json({ vehicles });
  } catch (error) {
    console.error('List vehicles failed:', error.message);
    if (USE_MOCK_DB) {
      return res.json({ vehicles: mockDb.getAllVehicles() });
    }
    return res.status(500).json({ error: msg(req, 'errors.listVehiclesFailed') });
  }
}

async function listAllVehicles(req, res) {
  try {
    if (USE_MOCK_DB) {
      const vehicles = mockDb.getAllVehicles();
      return res.json({ vehicles });
    }
    const vehicles = await Vehicle.getAll();
    return res.json({ vehicles });
  } catch (error) {
    console.error('List all vehicles failed:', error.message);
    if (USE_MOCK_DB) {
      return res.json({ vehicles: mockDb.getAllVehicles() });
    }
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
    if (!vehicle) {
      return res.status(404).json({ error: msg(req, 'errors.invalidVehicle') });
    }

    return res.json({ vehicle });
  } catch (error) {
    console.error('Update vehicle failed:', error.message);
    return res.status(500).json({ error: msg(req, 'errors.updateVehicleFailed') });
  }
}

async function deleteVehicle(req, res) {
  try {
    const removed = await Vehicle.remove(Number(req.params.id));
    if (!removed) {
      return res.status(404).json({ error: msg(req, 'errors.invalidVehicle') });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('Delete vehicle failed:', error.message);
    return res.status(500).json({ error: msg(req, 'errors.deleteVehicleFailed') });
  }
}

async function validatePromo(req, res) {
  try {
    const { code, amount } = req.body;

    if (!code) {
      return res.status(400).json({ error: msg(req, 'errors.promoRequired') });
    }

    const promoCheck = await validatePromoCode({ code, amount, req });

    if (!promoCheck.promo) {
      return res.status(promoCheck.status).json({ valid: false, error: promoCheck.error });
    }

    return res.json({
      valid: true,
      message: msg(req, 'messages.promoApplied'),
      promo: {
        id: promoCheck.promo.id,
        code: promoCheck.promo.code,
        discount_type: promoCheck.promo.discount_type,
        discount_value: Number(promoCheck.promo.discount_value)
      }
    });
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
       VALUES (UPPER($1), $2, $3, $4, 0, $5, $6, true)
       RETURNING *`,
      [
        req.body.code,
        req.body.discount_type,
        req.body.discount_value,
        req.body.max_uses || null,
        req.body.expires_at || null,
        req.body.min_amount || 0
      ]
    );

    return res.status(201).json({ promo: result.rows[0] });
  } catch (error) {
    console.error('Create promo failed:', error.message);
    return res.status(500).json({ error: msg(req, 'errors.createPromoFailed') });
  }
}

async function togglePromo(req, res) {
  try {
    const result = await pool.query(
      `UPDATE promo_codes
       SET is_active = NOT is_active
       WHERE id = $1
       RETURNING *`,
      [Number(req.params.id)]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: msg(req, 'errors.promoNotFound') });
    }

    return res.json({ promo: result.rows[0] });
  } catch (error) {
    console.error('Toggle promo failed:', error.message);
    return res.status(500).json({ error: msg(req, 'errors.togglePromoFailed') });
  }
}

async function geoSearch(req, res) {
  try {
    const q = req.query.q;
    const lang = req.query.lang || req.locale || 'en';

    if (!q || String(q).trim().length < 2) {
      return res.status(400).json({ error: msg(req, 'errors.geoQueryShort') });
    }

    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', q);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '15');

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'chauffeur-trip-booking/1.0',
        'Accept-Language': lang === 'ar' ? 'ar' : 'en'
      }
    });

    if (!response.ok) {
      return res.status(502).json({ error: msg(req, 'errors.geoUnavailable') });
    }

    const data = await response.json();
    const items = data.map((item) => ({
      display_name: item.display_name,
      lat: item.lat,
      lon: item.lon
    }));

    return res.json({ results: items });
  } catch (error) {
    console.error('Geo search failed:', error.message);
    return res.status(500).json({ error: msg(req, 'errors.geoFailed') });
  }
}

async function listChauffeurs(req, res) {
  try {
    const chauffeurs = await Chauffeur.getAll();
    return res.json({ chauffeurs });
  } catch (error) {
    console.error('List chauffeurs failed:', error.message);
    return res.status(500).json({ error: msg(req, 'errors.listChauffeursFailed') });
  }
}

async function createChauffeur(req, res) {
  try {
    if (!req.body.full_name || !req.body.phone) {
      return res.status(400).json({ error: msg(req, 'errors.contactRequired') });
    }

    const languages = Array.isArray(req.body.languages)
      ? req.body.languages.map((item) => normalizeLocale(item))
      : [normalizeLocale(req.body.language_code || req.locale)];

    const chauffeur = await Chauffeur.create({
      full_name: req.body.full_name,
      phone: req.body.phone,
      email: req.body.email || null,
      languages,
      notes: req.body.notes || null
    });

    return res.status(201).json({ chauffeur });
  } catch (error) {
    console.error('Create chauffeur failed:', error.message);
    return res.status(500).json({ error: msg(req, 'errors.createChauffeurFailed') });
  }
}

async function toggleChauffeur(req, res) {
  try {
    const chauffeur = await Chauffeur.toggle(Number(req.params.id));
    if (!chauffeur) {
      return res.status(404).json({ error: msg(req, 'errors.chauffeurNotFound') });
    }

    return res.json({ chauffeur });
  } catch (error) {
    console.error('Toggle chauffeur failed:', error.message);
    return res.status(500).json({ error: msg(req, 'errors.toggleChauffeurFailed') });
  }
}

module.exports = {
  quoteBooking,
  createBooking,
  listBookings,
  getBooking,
  getBookingLogs,
  updateBookingStatus,
  updateBooking,
  assignChauffeur,
  deleteBooking,
  bookingStats,
  exportCsv,
  listVehicles,
  listAllVehicles,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  validatePromo,
  listPromos,
  createPromo,
  togglePromo,
  geoSearch,
  listChauffeurs,
  createChauffeur,
  toggleChauffeur
};
