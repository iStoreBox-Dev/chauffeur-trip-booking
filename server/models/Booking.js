const pool = require('../../config/db');

class Booking {
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
        special_requests, promo_code, base_price, discount_amount,
        final_price, distance_km, status, ip_address, source
      ) VALUES (
        $1,$2,$3,
        $4,$5,$6,
        $7,$8,$9,
        $10,$11,$12,$13,
        $14,$15,$16,$17,
        $18,$19,
        $20,$21,$22,$23,$24,
        $25,$26,$27,$28,
        $29,$30,$31,$32,$33
      ) RETURNING *
    `;

    const values = [
      payload.booking_ref,
      payload.service_type,
      payload.transfer_type,
      payload.pickup_location,
      payload.pickup_lat,
      payload.pickup_lng,
      payload.dropoff_location,
      payload.dropoff_lat,
      payload.dropoff_lng,
      payload.departure_date,
      payload.departure_time,
      payload.return_date,
      payload.return_time,
      payload.hourly_duration,
      payload.passengers,
      payload.luggage,
      payload.flight_number,
      payload.vehicle_id,
      payload.vehicle_snapshot,
      payload.first_name,
      payload.last_name,
      payload.email,
      payload.country_code,
      payload.phone,
      payload.special_requests,
      payload.promo_code,
      payload.base_price,
      payload.discount_amount,
      payload.final_price,
      payload.distance_km,
      payload.status || 'pending',
      payload.ip_address,
      payload.source || 'web'
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async findById(id) {
    const result = await pool.query('SELECT * FROM bookings WHERE id = $1', [id]);
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
      where.push(`status = $${values.length}`);
    }

    if (filters.search) {
      values.push(`%${filters.search}%`);
      where.push(`(
        booking_ref ILIKE $${values.length}
        OR first_name ILIKE $${values.length}
        OR last_name ILIKE $${values.length}
        OR email ILIKE $${values.length}
      )`);
    }

    if (filters.date_from) {
      values.push(filters.date_from);
      where.push(`departure_date >= $${values.length}`);
    }

    if (filters.date_to) {
      values.push(filters.date_to);
      where.push(`departure_date <= $${values.length}`);
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
      SELECT *
      FROM bookings
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM bookings
      ${whereClause}
    `;

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
      `UPDATE bookings SET status = $1 WHERE id = $2 RETURNING *`,
      [status, id]
    );
    return result.rows[0];
  }

  static async updatePartial(id, fields) {
    const allowed = [
      'pickup_location', 'dropoff_location', 'departure_date', 'departure_time',
      'return_date', 'return_time', 'hourly_duration', 'passengers', 'luggage',
      'flight_number', 'first_name', 'last_name', 'email', 'country_code', 'phone',
      'special_requests', 'status'
    ];

    const keys = Object.keys(fields).filter((key) => allowed.includes(key));
    if (keys.length === 0) {
      return this.findById(id);
    }

    const values = keys.map((key) => fields[key]);
    const sets = keys.map((key, index) => `${key} = $${index + 1}`).join(', ');
    values.push(id);

    const query = `UPDATE bookings SET ${sets} WHERE id = $${values.length} RETURNING *`;
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
        COALESCE(SUM(final_price), 0) AS total_revenue
      FROM bookings
    `;

    const result = await pool.query(query);
    return result.rows[0];
  }

  static async allForExport() {
    const result = await pool.query(
      `SELECT booking_ref, service_type, first_name, last_name, email,
              country_code, phone, pickup_location, dropoff_location,
              departure_date, departure_time, final_price, status, created_at
       FROM bookings
       ORDER BY created_at DESC`
    );

    return result.rows;
  }
}

module.exports = Booking;
