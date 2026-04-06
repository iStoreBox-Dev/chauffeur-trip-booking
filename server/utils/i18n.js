const fs = require('fs');
const path = require('path');

const SUPPORTED_LOCALES = ['en', 'ar'];
const DEFAULT_LOCALE = 'en';

function loadLocale(fileName) {
  try {
    const filePath = path.join(__dirname, '..', 'locales', fileName);
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (_error) {
    return {};
  }
}

const catalog = {
  en: loadLocale('en.json'),
  ar: loadLocale('ar.json')
};

function normalizeLocale(value) {
  if (!value) return DEFAULT_LOCALE;
  const compact = String(value).trim().toLowerCase();
  if (compact.startsWith('ar')) return 'ar';
  return SUPPORTED_LOCALES.includes(compact) ? compact : DEFAULT_LOCALE;
}

function localeFromAcceptLanguage(headerValue) {
  if (!headerValue) return DEFAULT_LOCALE;
  const first = String(headerValue).split(',')[0] || '';
  return normalizeLocale(first);
}

function detectLocale(req) {
  return normalizeLocale(
    req.query?.lang
      || req.body?.lang
      || req.body?.language_code
      || req.headers['x-lang']
      || localeFromAcceptLanguage(req.headers['accept-language'])
  );
}

function getValueByPath(source, dottedPath) {
  return String(dottedPath || '')
    .split('.')
    .filter(Boolean)
    .reduce((acc, part) => (acc && Object.prototype.hasOwnProperty.call(acc, part) ? acc[part] : undefined), source);
}

function interpolate(template, params = {}) {
  return String(template).replace(/\{(\w+)\}/g, (_match, key) => {
    return Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : `{${key}}`;
  });
}

function t(locale, key, params = {}) {
  const safeLocale = normalizeLocale(locale);
  const primary = getValueByPath(catalog[safeLocale], key);
  const fallback = getValueByPath(catalog.en, key);
  const value = primary ?? fallback ?? key;
  return interpolate(value, params);
}

module.exports = {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  normalizeLocale,
  detectLocale,
  t
};
