const pool = require('../../config/db');

const DEFAULT_SETTINGS = {
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
  primary_color: '#ffd27d',
  secondary_color: '#0d1622',
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
  enhance_journey_enabled: true,
  enhance_journey_text: 'Enhance Your Journey',
  addons_enabled: true,
  addons_title: 'Enhance Your Journey',
  // Fixed area-to-area pricing rules. Admin can edit via admin settings.
  // Each rule: { origin: 'bahrain', destination: 'dammam airport', price: 45, active: true, note: 'BHD' }
  fixed_area_prices: [],
  seo_indexable: true
};

function parseBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(v)) return true;
    if (['0', 'false', 'no', 'off'].includes(v)) return false;
  }
  return fallback;
}

function normalizeSettings(raw = {}) {
  const settings = {
    ...DEFAULT_SETTINGS,
    ...raw,
    social_links: {
      ...DEFAULT_SETTINGS.social_links,
      ...(raw.social_links || {})
    }
  };

  settings.maintenance_mode = parseBoolean(settings.maintenance_mode, false);
  settings.booking_enabled = parseBoolean(settings.booking_enabled, true);
  settings.enhance_journey_enabled = parseBoolean(settings.enhance_journey_enabled, true);
  settings.addons_enabled = parseBoolean(settings.addons_enabled, true);
  settings.seo_indexable = parseBoolean(settings.seo_indexable, true);

  return settings;
}

async function loadMergedSettings() {
  try {
    const result = await pool.query('SELECT value FROM app_settings WHERE key = $1 LIMIT 1', ['app']);
    const current = result.rows[0]?.value || {};
    return normalizeSettings(current);
  } catch (dbError) {
    console.warn('Database query failed, using default settings:', dbError.message);
    return DEFAULT_SETTINGS;
  }
}

module.exports = {
  DEFAULT_SETTINGS,
  normalizeSettings,
  loadMergedSettings
};