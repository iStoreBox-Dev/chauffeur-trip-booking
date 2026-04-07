const pool = require('../../config/db');

const VALID_STATUSES = ['pending', 'confirmed', 'chauffeur_assigned', 'in_progress', 'completed', 'cancelled', 'rejected'];
const STATUS_TIMESTAMP_MAP = {
  confirmed: 'confirmed_at',
  chauffeur_assigned: 'chauffeur_assigned_at',
  in_progress: 'in_progress_at',
  completed: 'completed_at',
  cancelled: 'cancelled_at',
  rejected: 'rejected_at'
};

class Booking {
  static get VALID_STATUSES() { return VALID_STATUSES; }

  static async create(payload) {
    const query = `
      INSERT INTO bookings (
        booking_ref, service_type, transfer_type,
        pickup_location, pickup_lat, pickup_lng,
        dropoff_location, dropoff_lat, dropoff_lng,
        departure_date, departure_time, return_date, return_time,
        hourly_duration, passengers, luggage, flight_number,
        vehicle_id, vehicle_snapshot,
        first_name, last_name, email, country_code, phone,
        special_requests, add_ons, add_ons_price, promo_code,
        base_price, discount_amount, final_price, distance_km,
        language_code, chauffeur_id, assigned_chauffeur_id, assigned_vehicle_id,
        assigned_at, payment_provider, payment_status,
        payment_reference, status, ip_address, source
      ) VALUES (
        $1,$2,$3,
        $4,$5,$6,
        $7,$8,$9,
        $10,$11,$12,$13,
        $14,$15,$16,$17,
        $18,$19,
        $20,$21,$22,$23,$24,
        $25,$26,$27,$28,
        $29,$30,$31,$32,
        $33,$34,$35,$36,
        $37,$38,$39,$40,
        $41,$42,$43
      ) RETURNING *
    `;

    const values = [
      payload.booking_ref, payload.service_type, payload.transfer_type,
      payload.pickup_location, payload.pickup_lat, payload.pickup_lng,
      payload.dropoff_location, payload.dropoff_lat, payload.dropoff_lng,
      payload.departure_date, payload.departure_time, payload.return_date, payload.return_time,
      payload.hourly_duration, payload.passengers, payload.luggage, payload.flight_number,
      payload.vehicle_id, payload.vehicle_snapshot,
      payload.first_name, payload.last_name, payload.email, payload.country_code, payload.phone,
      payload.special_requests, JSON.stringify(payload.add_ons || {}), payload.add_ons_price, payload.promo_code,
      payload.base_price, payload.discount_amount, payload.final_price, payload.distance_km,
      payload.language_code || 'en', payload.chauffeur_id || null,
      payload.chauffeur_id || null, payload.vehicle_id || null,
      payload.chauffeur_id ? new Date() : null,
      payload.payment_provider || null, payload.payment_status || 'pending',
      payload.payment_reference || null, payload.status || 'pending',
      payload.ip_address, payload.source || 'web'
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async findById(id) {
    const result = await pool.query(
      `SELECT b.*, c.full_name AS chauffeur_name, c.phone AS chauffeur_phone,
              ac.full_name AS assigned_chauffeur_name,
              v.name AS assigned_vehicle_name, v.model AS assigned_vehicle_model
       FROM bookings b
       LEFT JOIN chauffeurs c ON c.id = b.chauffeur_id
       LEFT JOIN chauffeurs ac ON ac.id = b.assigned_chauffeur_id
       LEFT JOIN vehicles v ON v.id = b.assigned_vehicle_id
       WHERE b.id = $1`,
      [id]
    );
    return result.rows[0];
  }

  static async findByRefAndEmail(ref, email) {
    const result = await pool.query(
      `SELECT b.id, b.booking_ref, b.service_type, b.transfer_type,
              b.pickup_location, b.dropoff_location, b.departure_date, b.departure_time,
              b.passengers, b.flight_number, b.status, b.final_price, b.vehicle_snapshot,
              b.created_at, b.updated_at, b.assigned_at,
              b.confirmed_at, b.chauffeur_assigned_at, b.in_progress_at, b.completed_at,
              b.cancelled_at, b.rejected_at,
              c.full_name AS chauffeur_name,
              v.name AS assigned_vehicle_name
       FROM bookings b
       LEFT JOIN chauffeurs c ON c.id = b.assigned_chauffeur_id
       LEFT JOIN vehicles v ON v.id = b.assigned_vehicle_id
       WHERE UPPER(b.booking_ref) = UPPER($1)
         AND LOWER(b.email) = LOWER($2)
       LIMIT 1`,
      [ref, email]
    );
    const booking = result.rows[0];
    if (!booking) return null;

    return {
      id: booking.id,
      booking_ref: booking.booking_ref,
      service_type: booking.service_type,
      transfer_type: booking.transfer_type,
      pickup_location: booking.pickup_location,
      dropoff_location: booking.dropoff_location,
      departure_date: booking.departure_date,
      departure_time: booking.departure_time,
      status: booking.status,
      final_price: booking.final_price,
      vehicle_snapshot: booking.vehicle_snapshot,
      assigned_vehicle_name: booking.assigned_vehicle_name,
      chauffeur_name: booking.chauffeur_name,
      assigned_at: booking.assigned_at,
      timeline: {
        created_at: booking.created_at,
        confirmed_at: booking.confirmed_at,
        chauffeur_assigned_at: booking.chauffeur_assigned_at,
        in_progress_at: booking.in_progress_at,
        completed_at: booking.completed_at,
        cancelled_at: booking.cancelled_at,
        rejected_at: booking.rejected_at
      }
    };
  }

  static async cancelByIdAndEmail(id, email) {
    const result = await pool.query(
      `UPDATE bookings
       SET status = 'cancelled',
           cancelled_at = NOW(),
           cancelled_by = 'customer',
           updated_at = NOW()
       WHERE id = $1
         AND LOWER(email) = LOWER($2)
         AND status IN ('pending', 'confirmed')
         AND (departure_date::timestamp + departure_time) > NOW() + INTERVAL '2 hours'
       RETURNING *`,
      [id, email]
    );
    return result.rows[0];
  }

  static async cancelByRefAndEmail(ref, email) {
    const result = await pool.query(
      `UPDATE bookings
       SET status = 'cancelled',
           cancelled_at = NOW(),
           cancelled_by = 'customer',
           updated_at = NOW()
       WHERE UPPER(booking_ref) = UPPER($1)
         AND LOWER(email) = LOWER($2)
         AND status IN ('pending', 'confirmed')
         AND (departure_date::timestamp + departure_time) > NOW() + INTERVAL '2 hours'
       RETURNING *`,
      [ref, email]
    );
    return result.rows[0];
  }

  static async getLogs(bookingId) {
    const result = await pool.query(
      `SELECT bl.id, bl.booking_id, bl.user_id, u.full_name, bl.action, bl.note, bl.created_at
       FROM booking_logs bl
       LEFT JOIN users u ON u.id = bl.user_id
       WHERE bl.booking_id = $1
       ORDER BY bl.created_at DESC`,
      [bookingId]
    );
    return result.rows;
  }

  static async addLog({ bookingId, userId, action, note }) {
    await pool.query(
      `INSERT INTO booking_logs (booking_id, user_id, action, note)
       VALUES ($1, $2, $3, $4)`,
      [bookingId, userId || null, action, note || null]
    );
  }

  static async list(filters) {
    const values = [];
    const where = [];

    if (filters.status) {
      values.push(filters.status);
      where.push(`b.status = $${values.length}`);
    }

    if (filters.search) {
      values.push(`%${filters.search}%`);
      where.push(`(
        b.booking_ref ILIKE $${values.length}
        OR b.first_name ILIKE $${values.length}
        OR b.last_name ILIKE $${values.length}
        OR b.email ILIKE $${values.length}
      )`);
    }

    if (filters.date_from) {
      values.push(filters.date_from);
      where.push(`b.departure_date >= $${values.length}`);
    }

    if (filters.date_to) {
      values.push(filters.date_to);
      where.push(`b.departure_date <= $${values.length}`);
    }

    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(filters.limit) || 20));
    const offset = (page - 1) * limit;

    values.push(limit);
    const limitIdx = values.length;
    values.push(offset);
    const offsetIdx = values.length;

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const dataQuery = `
      SELECT b.*, c.full_name AS chauffeur_name, c.phone AS chauffeur_phone
      FROM bookings b
      LEFT JOIN chauffeurs c ON c.id = b.assigned_chauffeur_id
      ${whereClause}
      ORDER BY b.created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    const countQuery = `SELECT COUNT(*) AS total FROM bookings b ${whereClause}`;

    const [dataResult, countResult] = await Promise.all([
      pool.query(dataQuery, values),
      pool.query(countQuery, values.slice(0, values.length - 2))
    ]);

    return {
      bookings: dataResult.rows,
      total: Number(countResult.rows[0].total),
      page,
      limit
    };
  }

  static async updateStatus(id, status) {
    const timestampColumn = STATUS_TIMESTAMP_MAP[status];
    const query = timestampColumn
      ? `UPDATE bookings SET status = $1, ${timestampColumn} = NOW(), updated_at = NOW() WHERE id = $2 RETURNING *`
      : `UPDATE bookings SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`;
    const result = await pool.query(query, [status, id]);
    return result.rows[0];
  }

  static async updatePartial(id, fields) {
    const allowed = [
      'pickup_location', 'dropoff_location', 'departure_date', 'departure_time',
      'return_date', 'return_time', 'hourly_duration', 'passengers', 'luggage',
      'flight_number', 'first_name', 'last_name', 'email', 'country_code', 'phone',
      'special_requests', 'status', 'chauffeur_id', 'assigned_chauffeur_id', 'assigned_vehicle_id',
      'assigned_at', 'internal_notes',
      'add_ons', 'add_ons_price',
      'language_code', 'payment_provider', 'payment_status', 'payment_reference',
      'vehicle_id'
    ];

    const keys = Object.keys(fields).filter((key) => allowed.includes(key));
    if (keys.length === 0) return this.findById(id);

    const values = keys.map((key) => (key === 'add_ons' ? JSON.stringify(fields[key] || {}) : fields[key]));
    const sets = keys
      .map((key, index) => (key === 'add_ons' ? `${key} = $${index + 1}::jsonb` : `${key} = $${index + 1}`))
      .join(', ');
    values.push(id);

    const query = `UPDATE bookings SET ${sets}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`;
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async remove(id) {
    const result = await pool.query('DELETE FROM bookings WHERE id = $1 RETURNING id', [id]);
    return result.rows[0];
  }

  static async stats() {
    const query = `
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'pending') AS pending,
        COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed,
        COUNT(*) FILTER (WHERE DATE(created_at) = CURRENT_DATE) AS today,
        COALESCE(SUM(final_price), 0) AS total_revenue,
        COALESCE(SUM(final_price) FILTER (WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())), 0) AS month_revenue,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed_trips,
        COALESCE(AVG(final_price), 0) AS average_booking_value
      FROM bookings
    `;
    const result = await pool.query(query);
    return result.rows[0];
  }

  static async dailyBookings(days = 14) {
    const result = await pool.query(
      `SELECT DATE(created_at) AS day, COUNT(*) AS count
       FROM bookings
       WHERE created_at >= NOW() - INTERVAL '${days} days'
       GROUP BY DATE(created_at)
       ORDER BY day ASC`
    );
    return result.rows;
  }

  static async dailyRevenue(days = 7) {
    const result = await pool.query(
      `SELECT DATE(created_at) AS day, COALESCE(SUM(final_price), 0) AS revenue
       FROM bookings
       WHERE status = 'completed' AND created_at >= NOW() - INTERVAL '${days} days'
       GROUP BY DATE(created_at)
       ORDER BY day ASC`
    );
    return result.rows;
  }

  static async allForExport() {
    const result = await pool.query(
      `SELECT b.booking_ref, b.service_type, b.first_name, b.last_name, b.email,
              b.country_code, b.phone, b.pickup_location, b.dropoff_location,
              b.departure_date, b.departure_time, b.final_price, b.status,
              c.full_name AS chauffeur_name, b.language_code, b.created_at
       FROM bookings b
       LEFT JOIN chauffeurs c ON c.id = b.assigned_chauffeur_id
       ORDER BY b.created_at DESC`
    );
    return result.rows;
  }

  static async updateChauffeurAssignment(bookingId, chauffeurId, vehicleId) {
    const result = await pool.query(
      `UPDATE bookings
       SET chauffeur_id = $1,
           assigned_chauffeur_id = $1,
           assigned_vehicle_id = COALESCE($2, assigned_vehicle_id, vehicle_id),
           assigned_at = NOW(),
           chauffeur_assigned_at = COALESCE(chauffeur_assigned_at, NOW()),
           status = CASE WHEN status IN ('pending', 'confirmed') THEN 'chauffeur_assigned' ELSE status END,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [chauffeurId || null, vehicleId || null, bookingId]
    );
    return result.rows[0];
  }

  static async addInternalNote(bookingId, noteEntry) {
    const result = await pool.query(
      `UPDATE bookings
       SET internal_notes = COALESCE(internal_notes, '[]'::jsonb) || $1::jsonb,
           updated_at = NOW()
       WHERE id = $2
       RETURNING internal_notes`,
      [JSON.stringify([noteEntry]), bookingId]
    );
    return result.rows[0]?.internal_notes || [];
  }
}

module.exports = Booking;
