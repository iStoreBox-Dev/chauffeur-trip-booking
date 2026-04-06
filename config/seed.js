require('dotenv').config();

const bcrypt = require('bcryptjs');
const pool = require('./db');

async function seed() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminEmail || !adminPassword) {
      throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required to seed admin user.');
    }

    const adminHash = await bcrypt.hash(adminPassword, 12);

    await client.query(
      `INSERT INTO users (email, password, full_name, role, is_active)
       VALUES (LOWER($1), $2, 'System Admin', 'admin', true)
       ON CONFLICT (email) DO NOTHING`,
      [adminEmail, adminHash]
    );

    const vehicles = [
      ['Silver Class', 'Toyota Camry or similar', 'economy', 3, 18.000, ['AC', 'Wi-Fi', 'Bottled Water']],
      ['Executive Class', 'Mercedes E-Class or similar', 'business', 3, 30.000, ['AC', 'Wi-Fi', 'Leather Seats']],
      ['Luxury SUV', 'GMC Yukon or similar', 'suv', 6, 42.000, ['AC', 'Wi-Fi', '6 Seats']],
      ['Group Van', 'Mercedes V-Class or similar', 'van', 7, 48.000, ['AC', 'Wi-Fi', 'Luggage Space']]
    ];

    for (const vehicle of vehicles) {
      await client.query(
        `INSERT INTO vehicles (name, model, category, capacity, base_price, features, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, true)
         ON CONFLICT DO NOTHING`,
        [vehicle[0], vehicle[1], vehicle[2], vehicle[3], vehicle[4], JSON.stringify(vehicle[5])]
      );
    }

    const promos = [
      ['WELCOME10', 'percent', 10, 500, '2030-12-31', 20],
      ['VIP5', 'fixed', 5, 1000, '2030-12-31', 30],
      ['NIGHT15', 'percent', 15, 100, '2030-12-31', 40]
    ];

    for (const promo of promos) {
      await client.query(
        `INSERT INTO promo_codes (code, discount_type, discount_value, max_uses, used_count, expires_at, min_amount, is_active)
         VALUES ($1, $2, $3, $4, 0, $5, $6, true)
         ON CONFLICT (code) DO NOTHING`,
        [promo[0], promo[1], promo[2], promo[3], promo[4], promo[5]]
      );
    }

    await client.query('COMMIT');
    console.log('Seed completed successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
