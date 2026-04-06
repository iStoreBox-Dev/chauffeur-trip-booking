const pool = require('../../config/db');

class Chauffeur {
  static async getAll() {
    const result = await pool.query(
      `SELECT id, full_name, phone, email, languages, notes, is_active, created_at
       FROM chauffeurs
       ORDER BY is_active DESC, full_name ASC`
    );
    return result.rows;
  }

  static async getActive() {
    const result = await pool.query(
      `SELECT id, full_name, phone, email, languages, notes, is_active, created_at
       FROM chauffeurs
       WHERE is_active = true
       ORDER BY full_name ASC`
    );
    return result.rows;
  }

  static async findById(id) {
    const result = await pool.query(
      `SELECT id, full_name, phone, email, languages, notes, is_active, created_at
       FROM chauffeurs
       WHERE id = $1
       LIMIT 1`,
      [id]
    );
    return result.rows[0];
  }

  static async create(payload) {
    const result = await pool.query(
      `INSERT INTO chauffeurs (full_name, phone, email, languages, notes, is_active)
       VALUES ($1, $2, $3, $4::jsonb, $5, true)
       RETURNING id, full_name, phone, email, languages, notes, is_active, created_at`,
      [
        payload.full_name,
        payload.phone,
        payload.email || null,
        JSON.stringify(payload.languages || ['en']),
        payload.notes || null
      ]
    );

    return result.rows[0];
  }

  static async toggle(id) {
    const result = await pool.query(
      `UPDATE chauffeurs
       SET is_active = NOT is_active
       WHERE id = $1
       RETURNING id, full_name, phone, email, languages, notes, is_active, created_at`,
      [id]
    );
    return result.rows[0];
  }
}

module.exports = Chauffeur;
