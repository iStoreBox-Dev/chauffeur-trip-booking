const { sanitizePayload } = require('../utils/helpers');

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
    return res.status(400).json({ error: 'Invalid service type selected.' });
  }

  if (!firstName || !lastName || !email || !countryCode || !phone) {
    return res.status(400).json({ error: 'Please complete your contact details.' });
  }

  const emailRegex = /^\S+@\S+\.\S+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Please provide a valid email address.' });
  }

  const allowedCountryCodes = ['+973', '+966', '+971', '+974', '+965', '+968'];
  if (!allowedCountryCodes.includes(countryCode)) {
    return res.status(400).json({ error: 'Please select a valid GCC country code.' });
  }

  return next();
}

module.exports = {
  sanitizeBody,
  requireFields,
  validateBookingPayload
};
