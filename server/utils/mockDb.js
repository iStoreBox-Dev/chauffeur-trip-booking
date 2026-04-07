/**
 * Mock Database Layer
 * Provides in-memory data when PostgreSQL is unavailable
 * Used for development/testing WITHOUT needing to run migrate + seed
 */

const MOCK_PROMO_CODES = [
  {
    id: 1,
    code: 'WELCOME10',
    discount_type: 'percent',
    discount_value: 10,
    max_uses: 500,
    used_count: 0,
    expires_at: '2030-12-31',
    min_amount: 20,
    is_active: true
  },
  {
    id: 2,
    code: 'VIP5',
    discount_type: 'fixed',
    discount_value: 5,
    max_uses: 1000,
    used_count: 0,
    expires_at: '2030-12-31',
    min_amount: 30,
    is_active: true
  },
  {
    id: 3,
    code: 'NIGHT15',
    discount_type: 'percent',
    discount_value: 15,
    max_uses: 100,
    used_count: 0,
    expires_at: '2030-12-31',
    min_amount: 40,
    is_active: true
  }
];

const MOCK_VEHICLES = [
  {
    id: 1,
    name: 'Standard Sedan',
    model: 'Toyota Camry',
    capacity: 4,
    luggage: 3,
    base_price: 50,
    hourly_rate: 65,
    image_url: '/assets/vehicles/sedan.jpg',
    is_active: true
  },
  {
    id: 2,
    name: 'Premium SUV',
    model: 'Mercedes GLK',
    capacity: 5,
    luggage: 5,
    base_price: 75,
    hourly_rate: 95,
    image_url: '/assets/vehicles/suv.jpg',
    is_active: true
  },
  {
    id: 3,
    name: 'Luxury Sedan',
    model: 'BMW 7 Series',
    capacity: 4,
    luggage: 4,
    base_price: 100,
    hourly_rate: 125,
    image_url: '/assets/vehicles/luxury.jpg',
    is_active: true
  },
  {
    id: 4,
    name: 'Van',
    model: 'Mercedes Sprinter',
    capacity: 6,
    luggage: 8,
    base_price: 85,
    hourly_rate: 110,
    image_url: '/assets/vehicles/van.jpg',
    is_active: true
  }
];

const MOCK_SETTINGS = {
  default_language: 'en',
  supported_languages: JSON.stringify(['en', 'ar']),
  default_theme: 'dark',
  add_on_prices: JSON.stringify({ child_seat: 2.5, extra_luggage: 1.2, pet_friendly: 3.0 })
};

/**
 * Get promo code by code value
 */
function getPromoByCode(code) {
  return MOCK_PROMO_CODES.find(p => p.code === code.toUpperCase());
}

/**
 * Get all active promo codes
 */
function getAllPromos() {
  return MOCK_PROMO_CODES.filter(p => p.is_active);
}

/**
 * Check if promo code exists and is valid
 */
function isPromoValid(code, amount = 0) {
  const promo = getPromoByCode(code);
  if (!promo || !promo.is_active) return false;

  const hasUsesLeft = promo.max_uses === null || promo.used_count < promo.max_uses;
  const notExpired = !promo.expires_at || new Date(promo.expires_at) >= new Date();
  const minAmountSatisfied = amount >= (promo.min_amount || 0);

  return hasUsesLeft && notExpired && minAmountSatisfied;
}

/**
 * Increment promo usage
 */
function incrementPromoUsage(code) {
  const promo = getPromoByCode(code);
  if (promo) {
    promo.used_count = (promo.used_count || 0) + 1;
  }
  return promo;
}

/**
 * Get vehicle by ID
 */
function getVehicleById(id) {
  return MOCK_VEHICLES.find(v => v.id === parseInt(id));
}

/**
 * Get all active vehicles
 */
function getAllVehicles() {
  return MOCK_VEHICLES.filter(v => v.is_active);
}

/**
 * Get app settings
 */
function getSettings() {
  return MOCK_SETTINGS;
}

module.exports = {
  getPromoByCode,
  getAllPromos,
  isPromoValid,
  incrementPromoUsage,
  getVehicleById,
  getAllVehicles,
  getSettings,
  MOCK_PROMO_CODES,
  MOCK_VEHICLES,
  MOCK_SETTINGS
};
