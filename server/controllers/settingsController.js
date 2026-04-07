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
  seo_indexable: true
};

function sanitizePublic(settings) {
  return {
    app_name: settings.app_name,
    app_tagline: settings.app_tagline,
    hero_title: settings.hero_title,
    hero_subtitle: settings.hero_subtitle,
    seo_title: settings.seo_title,
    seo_description: settings.seo_description,
    seo_keywords: settings.seo_keywords,
    support_email: settings.support_email,
    support_phone: settings.support_phone,
    whatsapp_number: settings.whatsapp_number,
    currency_code: settings.currency_code,
    primary_color: settings.primary_color,
    secondary_color: settings.secondary_color,
    maintenance_mode: settings.maintenance_mode,
    booking_enabled: settings.booking_enabled,
    default_language: settings.default_language,
    supported_languages: settings.supported_languages,
    default_theme: settings.default_theme,
    add_on_prices: settings.add_on_prices,
    social_links: settings.social_links,
    seo_indexable: settings.seo_indexable
  };
}

async function loadMergedSettings() {
  try {
    const result = await pool.query('SELECT value FROM app_settings WHERE key = $1 LIMIT 1', ['app']);
    const current = result.rows[0]?.value || {};
    return {
      ...DEFAULT_SETTINGS,
      ...current,
      social_links: {
        ...DEFAULT_SETTINGS.social_links,
        ...(current.social_links || {})
      }
    };
  } catch (dbError) {
    // Database not available or not initialized, return defaults
    console.warn('Database query failed, using default settings:', dbError.message);
    return DEFAULT_SETTINGS;
  }
}

async function getPublicSettings(_req, res) {
  try {
    const settings = await loadMergedSettings();
    return res.json({ settings: sanitizePublic(settings) });
  } catch (error) {
    console.error('Get public settings failed:', error.message);
    return res.status(500).json({ error: 'Unable to load app settings right now.' });
  }
}

async function getPublicContactSettings(_req, res) {
  try {
    const settings = await loadMergedSettings();
    return res.json({
      settings: {
        app_name: settings.app_name,
        support_phone: settings.support_phone,
        support_email: settings.support_email,
        whatsapp_number: settings.whatsapp_number
      }
    });
  } catch (error) {
    console.error('Get public contact settings failed:', error.message);
    return res.status(500).json({ error: 'Unable to load app settings right now.' });
  }
}

async function getAdminSettings(_req, res) {
  try {
    const settings = await loadMergedSettings();
    return res.json({ settings });
  } catch (error) {
    console.error('Get admin settings failed:', error.message);
    return res.status(500).json({ error: 'Unable to load settings right now.' });
  }
}

async function updateAdminSettings(req, res) {
  try {
    const incoming = typeof req.body === 'object' && req.body ? req.body : {};
    const current = await loadMergedSettings();

    const merged = {
      ...current,
      ...incoming,
      social_links: {
        ...current.social_links,
        ...(incoming.social_links || {})
      }
    };

    await pool.query(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES ('app', $1::jsonb, NOW())
       ON CONFLICT (key)
       DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [JSON.stringify(merged)]
    );

    return res.json({ settings: merged });
  } catch (error) {
    console.error('Update settings failed:', error.message);
    return res.status(500).json({ error: 'Unable to update settings right now.' });
  }
}

module.exports = {
  getPublicSettings,
  getPublicContactSettings,
  getAdminSettings,
  updateAdminSettings
};
