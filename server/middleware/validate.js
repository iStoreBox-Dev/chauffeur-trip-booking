const { sanitizePayload, normalizeAddOns } = require('../utils/helpers');
const { t } = require('../utils/i18n');

function msg(req, key) {
  return t(req.locale, key);
}

function sanitizeBody(req, _res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizePayload(req.body);
  }
  next();
}

function requireFields(fields = []) {
  return (req, res, next) => {
    const missing = fields.filter((field) => {
      const value = req.body[field];
      return value === undefined || value === null || String(value).trim() === '';
    });

    if (missing.length > 0) {
      return res.status(400).json({
        error: `Please fill all required fields: ${missing.join(', ')}`
      });
    }

    return next();
  };
}

function validateBookingPayload(req, res, next) {
  const { service_type: serviceType, first_name: firstName, last_name: lastName, email, country_code: countryCode, phone } = req.body;

  if (!['trip', 'hourly'].includes(serviceType)) {
    return res.status(400).json({ error: msg(req, 'errors.invalidServiceType') });
  }

  if (!firstName || !lastName || !email || !countryCode || !phone) {
    return res.status(400).json({ error: msg(req, 'errors.contactRequired') });
  }

  const emailRegex = /^\S+@\S+\.\S+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: msg(req, 'errors.invalidEmail') });
  }

  const allowedCountryCodes = ['+973', '+966', '+971', '+974', '+965', '+968'];
  if (!allowedCountryCodes.includes(countryCode)) {
    return res.status(400).json({ error: msg(req, 'errors.invalidCountryCode') });
  }

  const passengers = Number(req.body.passengers || 0);
  if (!Number.isFinite(passengers) || passengers < 1 || passengers > 12) {
    return res.status(400).json({ error: msg(req, 'errors.invalidPassengers') });
  }

  req.body.add_ons = normalizeAddOns(req.body.add_ons || {});
  req.body.language_code = req.body.language_code || req.locale || 'en';

  return next();
}

module.exports = {
  sanitizeBody,
  requireFields,
  validateBookingPayload
};
