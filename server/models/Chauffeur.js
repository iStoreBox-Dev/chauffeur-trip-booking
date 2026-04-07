const pool = require('../../config/db');

const VALID_STATUSES = ['available', 'on_trip', 'off_duty', 'inactive'];

class Chauffeur {
  static get VALID_STATUSES() { return VALID_STATUSES; }

  static async getAll() {
    const result = await pool.query(
      `SELECT ch.id, ch.full_name, ch.phone, ch.email, ch.national_id,
              ch.license_number, ch.license_expiry, ch.status,
              ch.vehicle_id, ch.languages, ch.notes, ch.is_active, ch.created_at,
              v.name AS vehicle_name
       FROM chauffeurs ch
       LEFT JOIN vehicles v ON v.id = ch.vehicle_id
       ORDER BY ch.is_active DESC, ch.full_name ASC`
    );
    return result.rows;
  }

  static async getActive() {
    const result = await pool.query(
      `SELECT ch.id, ch.full_name, ch.phone, ch.email, ch.status, ch.vehicle_id, ch.is_active
       FROM chauffeurs ch
       WHERE ch.is_active = true AND ch.status = 'available'
       ORDER BY ch.full_name ASC`
    );
    return result.rows;
  }

  static async findById(id) {
    const result = await pool.query(
      `SELECT ch.id, ch.full_name, ch.phone, ch.email, ch.national_id,
              ch.license_number, ch.license_expiry, ch.status,
              ch.vehicle_id, ch.languages, ch.notes, ch.is_active, ch.created_at,
              v.name AS vehicle_name
       FROM chauffeurs ch
       LEFT JOIN vehicles v ON v.id = ch.vehicle_id
       WHERE ch.id = $1 LIMIT 1`,
      [id]
    );
    return result.rows[0];
  }

  static async create(payload) {
    const result = await pool.query(
      `INSERT INTO chauffeurs
         (full_name, phone, email, national_id, license_number, license_expiry,
          status, vehicle_id, languages, notes, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, true)
       RETURNING id, full_name, phone, email, national_id, license_number,
                 license_expiry, status, vehicle_id, languages, notes, is_active, created_at`,
      [
        payload.full_name,
        payload.phone,
        payload.email || null,
        payload.national_id || null,
        payload.license_number || null,
        payload.license_expiry || null,
        payload.status || 'available',
        payload.vehicle_id || null,
        JSON.stringify(payload.languages || ['en']),
        payload.notes || null
      ]
    );
    return result.rows[0];
  }

  static async update(id, payload) {
    const allowed = [
      'full_name', 'phone', 'email', 'national_id', 'license_number',
      'license_expiry', 'status', 'vehicle_id', 'notes'
    ];
    const keys = Object.keys(payload).filter((k) => allowed.includes(k));
    if (keys.length === 0) return this.findById(id);

    const values = keys.map((k) => payload[k]);
    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    values.push(id);

    const result = await pool.query(
      `UPDATE chauffeurs SET ${sets} WHERE id = $${values.length} RETURNING *`,
      values
    );
    return result.rows[0];
  }

  static async toggle(id) {
    const result = await pool.query(
      `UPDATE chauffeurs SET is_active = NOT is_active WHERE id = $1
       RETURNING id, full_name, phone, email, status, is_active, created_at`,
      [id]
    );
    return result.rows[0];
  }

  static async remove(id) {
    const result = await pool.query(
      'DELETE FROM chauffeurs WHERE id = $1 RETURNING id',
      [id]
    );
    return result.rows[0];
  }
}

module.exports = Chauffeur;
