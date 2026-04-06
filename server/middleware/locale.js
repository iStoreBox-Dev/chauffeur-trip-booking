const { detectLocale } = require('../utils/i18n');

function attachLocale(req, _res, next) {
  req.locale = detectLocale(req);
  next();
}

module.exports = {
  attachLocale
};
