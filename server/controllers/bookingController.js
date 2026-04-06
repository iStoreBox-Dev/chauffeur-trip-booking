const pool = require('../../config/db');
const Booking = require('../models/Booking');
const Vehicle = require('../models/Vehicle');
const { generateRef, calcPrice } = require('../utils/helpers');
const { sendBookingConfirmation } = require('../utils/email');
const { notifyWhatsapp } = require('../utils/whatsapp');

function getRequestIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || null;
}

function serializeCsv(rows) {
  const header = [
    'booking_ref', 'service_type', 'first_name', 'last_name', 'email', 'country_code',
    'phone', 'pickup_location', 'dropoff_location', 'departure_date', 'departure_time',
    'final_price', 'status', 'created_at'
  ];

  const escaped = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const lines = [header.join(',')];

  rows.forEach((row) => {
    lines.push(header.map((key) => escaped(row[key])).join(','));
  });

  return lines.join('\n');
}

async function createBooking(req, res) {
  try {
    const vehicleId = Number(req.body.vehicle_id);
    const vehicleList = await pool.query('SELECT * FROM vehicles WHERE id = $1 AND is_active = true', [vehicleId]);
    const vehicle = vehicleList.rows[0];

    if (!vehicle) {
      return res.status(400).json({ error: 'Please select a valid vehicle.' });
    }

    let discountAmount = 0;
    if (req.body.promo_code) {
      const promoResult = await pool.query(
        `SELECT * FROM promo_codes
         WHERE code = UPPER($1) AND is_active = true
         LIMIT 1`,
        [req.body.promo_code]
      );
      const promo = promoResult.rows[0];

      if (promo) {
        const baseEstimate = calcPrice({
          serviceType: req.body.service_type,
          vehicleBasePrice: vehicle.base_price,
          hourlyDuration: req.body.hourly_duration,
          transferType: req.body.transfer_type,
          distanceKm: req.body.distance_km
        });

        const minAmountSatisfied = Number(baseEstimate) >= Number(promo.min_amount || 0);
        const hasUsesLeft = promo.max_uses === null || promo.used_count < promo.max_uses;
        const notExpired = !promo.expires_at || new Date(promo.expires_at) >= new Date();

        if (minAmountSatisfied && hasUsesLeft && notExpired) {
          discountAmount = promo.discount_type === 'percent'
            ? Number((baseEstimate * (Number(promo.discount_value) / 100)).toFixed(3))
            : Number(promo.discount_value);

          await pool.query(
            'UPDATE promo_codes SET used_count = used_count + 1 WHERE id = $1',
            [promo.id]
          );
        }
      }
    }

    const basePrice = calcPrice({
      serviceType: req.body.service_type,
      vehicleBasePrice: vehicle.base_price,
      hourlyDuration: req.body.hourly_duration,
      transferType: req.body.transfer_type,
      distanceKm: req.body.distance_km
    });

    const booking = await Booking.create({
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
      vehicle_id: vehicle.id,
      vehicle_snapshot: {
        name: vehicle.name,
        model: vehicle.model,
        category: vehicle.category,
        base_price: vehicle.base_price,
        capacity: vehicle.capacity
      },
      first_name: req.body.first_name,
      last_name: req.body.last_name,
      email: req.body.email,
      country_code: req.body.country_code,
      phone: req.body.phone,
      special_requests: req.body.special_requests || null,
      promo_code: req.body.promo_code || null,
      base_price: basePrice,
      discount_amount: discountAmount,
      final_price: Number(Math.max(0, basePrice - discountAmount).toFixed(3)),
      distance_km: req.body.distance_km || null,
      status: 'pending',
      ip_address: getRequestIp(req),
      source: req.body.source || 'web'
    });

    await Booking.addLog({
      bookingId: booking.id,
      userId: null,
      action: 'created',
      note: 'Booking submitted from website'
    });

    sendBookingConfirmation(booking).catch(() => {});
    notifyWhatsapp({
      event: 'new_booking',
      booking_ref: booking.booking_ref,
      customer: `${booking.first_name} ${booking.last_name}`,
      final_price: booking.final_price
    }).catch(() => {});

    return res.status(201).json({ booking });
  } catch (error) {
    console.error('Create booking failed:', error.message);
    return res.status(500).json({ error: 'We could not submit your booking right now. Please try again.' });
  }
}

async function listBookings(req, res) {
  try {
    const data = await Booking.list(req.query);
    return res.json(data);
  } catch (error) {
    console.error('List bookings failed:', error.message);
    return res.status(500).json({ error: 'Unable to load bookings at the moment.' });
  }
}

async function getBooking(req, res) {
  try {
    const booking = await Booking.findById(Number(req.params.id));
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    return res.json({ booking });
  } catch (error) {
    console.error('Get booking failed:', error.message);
    return res.status(500).json({ error: 'Unable to load booking details.' });
  }
}

async function getBookingLogs(req, res) {
  try {
    const logs = await Booking.getLogs(Number(req.params.id));
    return res.json({ logs });
  } catch (error) {
    console.error('Get logs failed:', error.message);
    return res.status(500).json({ error: 'Unable to load booking logs.' });
  }
}

async function updateBookingStatus(req, res) {
  try {
    const allowed = ['pending', 'confirmed', 'completed', 'cancelled', 'rejected'];
    const status = req.body.status;

    if (!allowed.includes(status)) {
      return res.status(400).json({ error: 'Invalid booking status.' });
    }

    const updated = await Booking.updateStatus(Number(req.params.id), status);
    if (!updated) {
      return res.status(404).json({ error: 'Booking not found.' });
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
    return res.status(500).json({ error: 'Unable to update booking status.' });
  }
}

async function updateBooking(req, res) {
  try {
    const updated = await Booking.updatePartial(Number(req.params.id), req.body);
    if (!updated) {
      return res.status(404).json({ error: 'Booking not found.' });
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
    return res.status(500).json({ error: 'Unable to update booking right now.' });
  }
}

async function deleteBooking(req, res) {
  try {
    const removed = await Booking.remove(Number(req.params.id));
    if (!removed) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('Delete booking failed:', error.message);
    return res.status(500).json({ error: 'Unable to delete booking right now.' });
  }
}

async function bookingStats(_req, res) {
  try {
    const stats = await Booking.stats();
    return res.json({ stats });
  } catch (error) {
    console.error('Stats failed:', error.message);
    return res.status(500).json({ error: 'Unable to load dashboard stats.' });
  }
}

async function exportCsv(_req, res) {
  try {
    const rows = await Booking.allForExport();
    const csv = serializeCsv(rows);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="bookings-${Date.now()}.csv"`);
    return res.send(csv);
  } catch (error) {
    console.error('CSV export failed:', error.message);
    return res.status(500).json({ error: 'Unable to export CSV right now.' });
  }
}

async function listVehicles(_req, res) {
  try {
    const vehicles = await Vehicle.getActive();
    return res.json({ vehicles });
  } catch (error) {
    console.error('List vehicles failed:', error.message);
    return res.status(500).json({ error: 'Unable to load vehicle options.' });
  }
}

async function createVehicle(req, res) {
  try {
    const vehicle = await Vehicle.create(req.body);
    return res.status(201).json({ vehicle });
  } catch (error) {
    console.error('Create vehicle failed:', error.message);
    return res.status(500).json({ error: 'Unable to create vehicle.' });
  }
}

async function updateVehicle(req, res) {
  try {
    const vehicle = await Vehicle.update(Number(req.params.id), req.body);
    if (!vehicle) {
      return res.status(404).json({ error: 'Vehicle not found.' });
    }

    return res.json({ vehicle });
  } catch (error) {
    console.error('Update vehicle failed:', error.message);
    return res.status(500).json({ error: 'Unable to update vehicle.' });
  }
}

async function deleteVehicle(req, res) {
  try {
    const removed = await Vehicle.remove(Number(req.params.id));
    if (!removed) {
      return res.status(404).json({ error: 'Vehicle not found.' });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('Delete vehicle failed:', error.message);
    return res.status(500).json({ error: 'Unable to delete vehicle.' });
  }
}

async function validatePromo(req, res) {
  try {
    const { code, amount } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Promo code is required.' });
    }

    const result = await pool.query(
      `SELECT * FROM promo_codes
       WHERE code = UPPER($1) AND is_active = true
       LIMIT 1`,
      [code]
    );

    const promo = result.rows[0];
    if (!promo) {
      return res.status(404).json({ valid: false, error: 'Promo code not found.' });
    }

    const hasUsesLeft = promo.max_uses === null || promo.used_count < promo.max_uses;
    const notExpired = !promo.expires_at || new Date(promo.expires_at) >= new Date();
    const minAmountSatisfied = Number(amount || 0) >= Number(promo.min_amount || 0);

    if (!hasUsesLeft || !notExpired || !minAmountSatisfied) {
      return res.status(400).json({ valid: false, error: 'Promo code is not valid for this booking.' });
    }

    return res.json({
      valid: true,
      promo: {
        id: promo.id,
        code: promo.code,
        discount_type: promo.discount_type,
        discount_value: Number(promo.discount_value)
      }
    });
  } catch (error) {
    console.error('Validate promo failed:', error.message);
    return res.status(500).json({ error: 'Unable to validate promo code.' });
  }
}

async function listPromos(_req, res) {
  try {
    const result = await pool.query('SELECT * FROM promo_codes ORDER BY id DESC');
    return res.json({ promos: result.rows });
  } catch (error) {
    console.error('List promo failed:', error.message);
    return res.status(500).json({ error: 'Unable to load promo codes.' });
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
    return res.status(500).json({ error: 'Unable to create promo code.' });
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
      return res.status(404).json({ error: 'Promo code not found.' });
    }

    return res.json({ promo: result.rows[0] });
  } catch (error) {
    console.error('Toggle promo failed:', error.message);
    return res.status(500).json({ error: 'Unable to update promo code.' });
  }
}

async function geoSearch(req, res) {
  try {
    const q = req.query.q;

    if (!q || String(q).trim().length < 2) {
      return res.status(400).json({ error: 'Please enter at least 2 characters.' });
    }

    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', q);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '7');

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'chauffeur-trip-booking/1.0'
      }
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'Location search service is unavailable.' });
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
    return res.status(500).json({ error: 'Unable to search locations at the moment.' });
  }
}

module.exports = {
  createBooking,
  listBookings,
  getBooking,
  getBookingLogs,
  updateBookingStatus,
  updateBooking,
  deleteBooking,
  bookingStats,
  exportCsv,
  listVehicles,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  validatePromo,
  listPromos,
  createPromo,
  togglePromo,
  geoSearch
};
