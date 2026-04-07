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
      CREATE TABLE IF NOT EXISTS chauffeurs (
        id SERIAL PRIMARY KEY,
        full_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT,
        national_id TEXT,
        license_number TEXT,
        license_expiry DATE,
        status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'on_trip', 'off_duty', 'inactive')),
        assigned_vehicle_id INTEGER REFERENCES vehicles(id),
        languages JSONB NOT NULL DEFAULT '["en"]'::jsonb,
        notes TEXT,
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
        add_ons JSONB NOT NULL DEFAULT '{}'::jsonb,
        add_ons_price NUMERIC(10,3) NOT NULL DEFAULT 0,
        promo_code TEXT,
        base_price NUMERIC(10,3) NOT NULL,
        discount_amount NUMERIC(10,3) NOT NULL DEFAULT 0,
        final_price NUMERIC(10,3) NOT NULL,
        distance_km NUMERIC(10,2),
        language_code TEXT NOT NULL DEFAULT 'en',
        chauffeur_id INTEGER REFERENCES chauffeurs(id),
        assigned_chauffeur_id INTEGER REFERENCES chauffeurs(id),
        assigned_vehicle_id INTEGER REFERENCES vehicles(id),
        assigned_at TIMESTAMP,
        confirmed_at TIMESTAMP,
        chauffeur_assigned_at TIMESTAMP,
        in_progress_at TIMESTAMP,
        completed_at TIMESTAMP,
        cancelled_at TIMESTAMP,
        rejected_at TIMESTAMP,
        cancelled_by TEXT,
        internal_notes JSONB NOT NULL DEFAULT '[]'::jsonb,
        payment_provider TEXT,
        payment_status TEXT NOT NULL DEFAULT 'pending',
        payment_reference TEXT,
        customer_rating INTEGER CHECK (customer_rating BETWEEN 1 AND 5),
        chauffeur_rating INTEGER CHECK (chauffeur_rating BETWEEN 1 AND 5),
        feedback_text TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'chauffeur_assigned', 'in_progress', 'completed', 'cancelled', 'rejected')),
        ip_address TEXT,
        source TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
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

    await client.query(`
      CREATE TABLE IF NOT EXISTS payment_transactions (
        id SERIAL PRIMARY KEY,
        booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        external_id TEXT,
        amount NUMERIC(10,3) NOT NULL,
        currency_code TEXT NOT NULL DEFAULT 'BHD',
        status TEXT NOT NULL DEFAULT 'initiated',
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS notification_events (
        id SERIAL PRIMARY KEY,
        booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
        channel TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp')),
        recipient TEXT NOT NULL,
        event_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS booking_calendar_sync (
        id SERIAL PRIMARY KEY,
        booking_id INTEGER NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
        provider TEXT NOT NULL DEFAULT 'google_calendar',
        external_event_id TEXT,
        sync_status TEXT NOT NULL DEFAULT 'pending',
        last_error TEXT,
        synced_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await client.query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS add_ons JSONB NOT NULL DEFAULT '{}'::jsonb");
    await client.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS add_ons_price NUMERIC(10,3) NOT NULL DEFAULT 0');
    await client.query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS language_code TEXT NOT NULL DEFAULT 'en'");
    await client.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS chauffeur_id INTEGER REFERENCES chauffeurs(id)');
    await client.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_provider TEXT');
    await client.query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending'");
    await client.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_reference TEXT');
    await client.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS customer_rating INTEGER CHECK (customer_rating BETWEEN 1 AND 5)');
    await client.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS chauffeur_rating INTEGER CHECK (chauffeur_rating BETWEEN 1 AND 5)');
    await client.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS feedback_text TEXT');
    await client.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW()');
    await client.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS assigned_chauffeur_id INTEGER REFERENCES chauffeurs(id)');
    await client.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS assigned_vehicle_id INTEGER REFERENCES vehicles(id)');
    await client.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP');
    await client.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP');
    await client.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS chauffeur_assigned_at TIMESTAMP');
    await client.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS in_progress_at TIMESTAMP');
    await client.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP');
    await client.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP');
    await client.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP');
    await client.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_by TEXT');
    await client.query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS internal_notes JSONB NOT NULL DEFAULT '[]'::jsonb");

    await client.query('ALTER TABLE chauffeurs ADD COLUMN IF NOT EXISTS national_id TEXT');
    await client.query('ALTER TABLE chauffeurs ADD COLUMN IF NOT EXISTS license_number TEXT');
    await client.query('ALTER TABLE chauffeurs ADD COLUMN IF NOT EXISTS license_expiry DATE');
    await client.query("ALTER TABLE chauffeurs ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'available'");
    await client.query('ALTER TABLE chauffeurs ADD COLUMN IF NOT EXISTS assigned_vehicle_id INTEGER REFERENCES vehicles(id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_users_email ON users (email)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_promos_code ON promo_codes (code)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_chauffeurs_active ON chauffeurs (is_active)');
    await client.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_chauffeurs_phone_unique ON chauffeurs (phone)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings (status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_bookings_created_at ON bookings (created_at DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_bookings_ref ON bookings (booking_ref)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_bookings_vehicle ON bookings (vehicle_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_bookings_chauffeur ON bookings (chauffeur_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_bookings_assigned_chauffeur ON bookings (assigned_chauffeur_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_bookings_assigned_vehicle ON bookings (assigned_vehicle_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_bookings_departure_date ON bookings (departure_date)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_booking_logs_booking_id ON booking_logs (booking_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_payment_transactions_booking_id ON payment_transactions (booking_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_notification_events_booking_id ON notification_events (booking_id)');

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
