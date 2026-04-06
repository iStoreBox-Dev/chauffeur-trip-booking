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

    const operatorEmail = process.env.OPERATOR_EMAIL || 'operator@example.com';
    const operatorPassword = process.env.OPERATOR_PASSWORD || process.env.ADMIN_PASSWORD;
    const operatorHash = await bcrypt.hash(operatorPassword, 12);

    await client.query(
      `INSERT INTO users (email, password, full_name, role, is_active)
       VALUES (LOWER($1), $2, 'Operations Manager', 'operator', true)
       ON CONFLICT (email) DO NOTHING`,
      [operatorEmail, operatorHash]
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

    const chauffeurs = [
      ['Hassan Al Khalifa', '+97333112211', 'hassan@luxeride.example', ['en', 'ar'], 'Airport specialist'],
      ['Omar Al Ansari', '+97333445566', 'omar@luxeride.example', ['en', 'ar'], 'VIP business routes'],
      ['David Mitchell', '+97333998877', 'david@luxeride.example', ['en'], 'Executive city transfers']
    ];

    for (const chauffeur of chauffeurs) {
      await client.query(
        `INSERT INTO chauffeurs (full_name, phone, email, languages, notes, is_active)
         VALUES ($1, $2, $3, $4::jsonb, $5, true)
         ON CONFLICT (phone) DO NOTHING`,
        [chauffeur[0], chauffeur[1], chauffeur[2], JSON.stringify(chauffeur[3]), chauffeur[4]]
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

    const defaultSettings = {
      app_name: 'LUXERIDE',
      app_tagline: 'Premium Chauffeur Booking',
      hero_title: 'Move Through Bahrain in Quiet Luxury',
      hero_subtitle: 'Airport transfers, executive travel, and hourly hire with premium comfort.',
      seo_title: 'LUXERIDE | Premium Chauffeur Booking',
      seo_description: 'Book premium chauffeur rides with transparent pricing and elegant service in Bahrain.',
      seo_keywords: 'chauffeur,bahrain,airport transfer,executive ride,private driver',
      support_email: 'booking@example.com',
      support_phone: '+973 0000 0000',
      whatsapp_number: '',
      currency_code: 'BHD',
      primary_color: '#d6b16f',
      secondary_color: '#0e1a26',
      maintenance_mode: false,
      booking_enabled: true,
      default_language: 'en',
      supported_languages: ['en', 'ar'],
      default_theme: 'dark',
      add_on_prices: {
        child_seat: 2.5,
        extra_luggage: 1.2,
        pet_friendly: 3.0
      },
      social_links: {
        instagram: '',
        x: '',
        facebook: '',
        linkedin: ''
      },
      seo_indexable: true
    };

    await client.query(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES ('app', $1::jsonb, NOW())
       ON CONFLICT (key) DO NOTHING`,
      [JSON.stringify(defaultSettings)]
    );

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
