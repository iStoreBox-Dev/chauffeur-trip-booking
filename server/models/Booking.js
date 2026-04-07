const pool = require('../../config/db');

const VALID_STATUSES = ['pending', 'confirmed', 'chauffeur_assigned', 'in_progress', 'completed', 'cancelled', 'rejected'];

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
        language_code, chauffeur_id, payment_provider, payment_status,
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
        $37,$38,$39,$40
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
      payload.payment_provider || null, payload.payment_status || 'pending',
      payload.payment_reference || null, payload.status || 'pending',
      payload.ip_address, payload.source || 'web'
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async findById(id) {
    const result = await pool.query(
      `SELECT b.*, c.full_name AS chauffeur_name, c.phone AS chauffeur_phone
       FROM bookings b
       LEFT JOIN chauffeurs c ON c.id = b.chauffeur_id
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
              b.created_at, b.updated_at,
              c.full_name AS chauffeur_name
       FROM bookings b
       LEFT JOIN chauffeurs c ON c.id = b.chauffeur_id
       WHERE UPPER(b.booking_ref) = UPPER($1)
         AND LOWER(b.email) = LOWER($2)
       LIMIT 1`,
      [ref, email]
    );
    return result.rows[0];
  }

  static async cancelByRefAndEmail(ref, email) {
    const result = await pool.query(
      `UPDATE bookings
       SET status = 'cancelled', updated_at = NOW()
       WHERE UPPER(booking_ref) = UPPER($1)
         AND LOWER(email) = LOWER($2)
         AND status IN ('pending', 'confirmed')
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
      LEFT JOIN chauffeurs c ON c.id = b.chauffeur_id
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
    const result = await pool.query(
      `UPDATE bookings SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, id]
    );
    return result.rows[0];
  }

  static async updatePartial(id, fields) {
    const allowed = [
      'pickup_location', 'dropoff_location', 'departure_date', 'departure_time',
      'return_date', 'return_time', 'hourly_duration', 'passengers', 'luggage',
      'flight_number', 'first_name', 'last_name', 'email', 'country_code', 'phone',
      'special_requests', 'status', 'chauffeur_id', 'add_ons', 'add_ons_price',
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
        COUNT(*) FILTER (WHERE status = 'completed') AS completed_trips
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
       LEFT JOIN chauffeurs c ON c.id = b.chauffeur_id
       ORDER BY b.created_at DESC`
    );
    return result.rows;
  }

  static async updateChauffeur(bookingId, chauffeurId, vehicleId) {
    const setClauses = ['chauffeur_id = $1', 'updated_at = NOW()'];
    const values = [chauffeurId, bookingId];

    if (vehicleId !== undefined) {
      setClauses.push(`vehicle_id = $${values.length + 1}`);
      values.splice(values.length - 1, 0, vehicleId);
    }

    const result = await pool.query(
      `UPDATE bookings SET ${setClauses.join(', ')} WHERE id = $2 RETURNING *`,
      values
    );
    return result.rows[0];
  }
}

module.exports = Booking;
