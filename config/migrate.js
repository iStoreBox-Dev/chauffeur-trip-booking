require('dotenv').config();

const pool = require('./db');

async function migrate() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'operator')),
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS vehicles (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        model TEXT NOT NULL,
        category TEXT NOT NULL CHECK (category IN ('economy', 'business', 'suv', 'van')),
        capacity INTEGER NOT NULL,
        base_price NUMERIC(10,3) NOT NULL,
        features JSONB NOT NULL DEFAULT '[]'::jsonb,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS promo_codes (
        id SERIAL PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
        discount_value NUMERIC(10,3) NOT NULL,
        max_uses INTEGER,
        used_count INTEGER NOT NULL DEFAULT 0,
        expires_at TIMESTAMP,
        min_amount NUMERIC(10,3) NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS routes (
        id SERIAL PRIMARY KEY,
        from_name TEXT NOT NULL,
        to_name TEXT NOT NULL,
        price_bhd NUMERIC(10,3) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id SERIAL PRIMARY KEY,
        booking_ref TEXT UNIQUE NOT NULL,
        service_type TEXT NOT NULL CHECK (service_type IN ('trip', 'hourly')),
        transfer_type TEXT,
        pickup_location TEXT NOT NULL,
        pickup_lat NUMERIC(10,6),
        pickup_lng NUMERIC(10,6),
        dropoff_location TEXT,
        dropoff_lat NUMERIC(10,6),
        dropoff_lng NUMERIC(10,6),
        departure_date DATE NOT NULL,
        departure_time TIME NOT NULL,
        return_date DATE,
        return_time TIME,
        hourly_duration INTEGER,
        passengers INTEGER NOT NULL,
        luggage INTEGER NOT NULL DEFAULT 0,
        flight_number TEXT,
        vehicle_id INTEGER REFERENCES vehicles(id),
        vehicle_snapshot JSONB NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT NOT NULL,
        country_code TEXT NOT NULL,
        phone TEXT NOT NULL,
        special_requests TEXT,
        promo_code TEXT,
        base_price NUMERIC(10,3) NOT NULL,
        discount_amount NUMERIC(10,3) NOT NULL DEFAULT 0,
        final_price NUMERIC(10,3) NOT NULL,
        distance_km NUMERIC(10,2),
        status TEXT NOT NULL DEFAULT 'pending',
        ip_address TEXT,
        source TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS booking_logs (
        id SERIAL PRIMARY KEY,
        booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id),
        action TEXT NOT NULL,
        note TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await client.query('COMMIT');
    console.log('Migration completed successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
