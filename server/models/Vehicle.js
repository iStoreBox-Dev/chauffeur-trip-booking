const pool = require('../../config/db');

class Vehicle {
  static async getActive() {
    const query = `
      SELECT id, name, model, category, capacity, base_price, features, is_active
      FROM vehicles
      WHERE is_active = true
      ORDER BY base_price ASC
    `;
    const result = await pool.query(query);
    return result.rows;
  }

  static async getAll() {
    const result = await pool.query(
      `SELECT id, name, model, category, capacity, base_price, features, is_active
       FROM vehicles
       ORDER BY id DESC`
    );
    return result.rows;
  }

  static async create(payload) {
    const query = `
      INSERT INTO vehicles (name, model, category, capacity, base_price, features, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, true)
      RETURNING *
    `;

    const values = [
      payload.name,
      payload.model,
      payload.category,
      payload.capacity,
      payload.base_price,
      JSON.stringify(payload.features || [])
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async update(id, payload) {
    const query = `
      UPDATE vehicles
      SET name = $1,
          model = $2,
          category = $3,
          capacity = $4,
          base_price = $5,
          features = $6,
          is_active = $7
      WHERE id = $8
      RETURNING *
    `;

    const values = [
      payload.name,
      payload.model,
      payload.category,
      payload.capacity,
      payload.base_price,
      JSON.stringify(payload.features || []),
      payload.is_active,
      id
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async remove(id) {
    const result = await pool.query('DELETE FROM vehicles WHERE id = $1 RETURNING id', [id]);
    return result.rows[0];
  }
}

module.exports = Vehicle;
