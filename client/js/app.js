(function () {
  'use strict';

  const LANG_KEY = 'chauffeur_locale';
  const THEME_KEY = 'chauffeur_theme';

  const state = {
    step: 1,
    serviceType: 'trip',
    transferType: 'oneway',
    selectedVehicle: null,
    vehicles: [],
    recommendations: [],
    locationSelected: {
      pickup: false,
      dropoff: false,
      hourly: false
    },
    geo: {
      pickup: null,
      dropoff: null,
      hourly: null
    },
    settings: null,
    currencyCode: 'BHD',
    appliedPromo: null,
    quote: null,
    quoteBusy: false,
    trackedBooking: null,
    locale: 'en',
    theme: 'dark',
    translations: {
      en: {},
      ar: {}
    }
  };

  const refs = {
    message: document.getElementById('form-message'),
    vehicleGrid: document.getElementById('vehicle-grid'),
    promoMessage: document.getElementById('promo-message'),
    quoteLoading: document.getElementById('quote-loading'),
    recommendationsBox: document.getElementById('recommendations-box'),
    alertContainer: document.getElementById('alert-container')
  };

  function qs(selector, ctx = document) { return ctx.querySelector(selector); }
  function qsa(selector, ctx = document) { return Array.from(ctx.querySelectorAll(selector)); }

  /**
   * ALERT SYSTEM - Comprehensive error & notification handling
   */
  function showAlert(message, type = 'info', title = '') {
    if (!refs.alertContainer) return;
    
    const alertId = `alert-${Date.now()}`;
    const icons = {
      error: '❌',
      success: '✅',
      warning: '⚠️',
      info: 'ℹ️'
    };
    
    const alert = document.createElement('div');
    alert.className = `alert ${type}`;
    alert.id = alertId;
    alert.setAttribute('role', 'alert');
    
    const titleText = title || {
      error: tr('alerts.error'),
      success: tr('alerts.success'),
      warning: tr('alerts.warning'),
      info: tr('alerts.info')
    }[type] || 'Alert';
    
    alert.innerHTML = `
      <span class="alert-icon">${icons[type]}</span>
      <div class="alert-content">
        <div class="alert-title">${escapeHtml(titleText)}</div>
        <div class="alert-message">${escapeHtml(String(message || ''))}</div>
      </div>
      <button class="alert-close" type="button" aria-label="Close alert">×</button>
    `;
    
    refs.alertContainer.appendChild(alert);
    
    const closeBtn = alert.querySelector('.alert-close');
    const removeAlert = () => {
      if (alert.parentNode) {
        alert.style.animation = 'slideOut 0.3s ease-in forwards';
        setTimeout(() => alert.remove(), 300);
      }
    };
    
    closeBtn.addEventListener('click', removeAlert);
    
    // Auto-dismiss after 5 seconds
    if (type !== 'error') {
      setTimeout(removeAlert, 5000);
    }
    
    // Log to console for debugging
    console.log(`[${type.toUpperCase()}]`, titleText, message);
  }

  function showError(message, title) {
    showAlert(message, 'error', title || tr('alerts.error'));
  }

  function showSuccess(message, title) {
    showAlert(message, 'success', title || tr('alerts.success'));
  }

  function showWarning(message, title) {
    showAlert(message, 'warning', title || tr('alerts.warning'));
  }

  function showInfo(message, title) {
    showAlert(message, 'info', title || tr('alerts.info'));
  }

  /**
   * API Error Handler
   */
  async function handleApiError(error, defaultMessage = 'An error occurred') {
    console.error('[API Error]', error);
    
    if (error instanceof TypeError) {
      if (error.message.includes('fetch')) {
        showError(tr('errors.networkError'), tr('alerts.error'));
        return;
      }
    }
    
    if (error.response) {
      try {
        const data = await error.response.json();
        showError(data.error || defaultMessage);
      } catch (e) {
        showError(defaultMessage);
      }
    } else if (error.message) {
      showError(error.message);
    } else {
      showError(defaultMessage);
    }
  }

  /**
   * Comprehensive API Fetch Wrapper with Error Handling
   */
  async function fetchApi(endpoint, options = {}) {
    const { method = 'GET', body = null, silent = false, timeout = 30000 } = options;
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const headers = {
        'Content-Type': 'application/json',
        'X-Lang': state.locale,
        ...options.headers
      };
      
      const fetchOptions = {
        method,
        headers,
        signal: controller.signal
      };
      
      if (body) {
        fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
      }
      
      const response = await fetch(endpoint, fetchOptions);
      clearTimeout(timeoutId);
      
      const data = await response.json().catch(() => ({}));
      
      if (!response.ok) {
        const errorMsg = data.error || `HTTP ${response.status}: ${response.statusText}`;
        
        // Handle specific status codes
        if (response.status === 401) {
          if (!silent) showError('Session expired. Please try logging in again.', tr('alerts.error'));
          return { error: errorMsg, status: response.status };
        } else if (response.status === 403) {
          if (!silent) showError('You do not have permission for this action.', tr('alerts.error'));
          return { error: errorMsg, status: response.status };
        } else if (response.status === 404) {
          if (!silent) showWarning('Resource not found.', tr('alerts.warning'));
          return { error: errorMsg, status: response.status };
        } else if (response.status === 429) {
          if (!silent) showWarning('Too many requests. Please wait before trying again.', tr('alerts.warning'));
          return { error: errorMsg, status: response.status };
        } else if (response.status >= 500) {
          if (!silent) showError(tr('errors.serverError'), tr('alerts.error'));
          return { error: errorMsg, status: response.status };
        } else {
          if (!silent) showError(errorMsg, tr('alerts.error'));
          return { error: errorMsg, status: response.status };
        }
      }
      
      return { success: true, data, status: response.status };
    } catch (error) {
      console.error('[Fetch Error]', error);
      
      if (error.name === 'AbortError') {
        if (!silent) showError('Request timeout. Please check your connection and try again.', tr('alerts.error'));
        return { error: 'Request timeout', status: 0 };
      } else if (error instanceof TypeError) {
        if (!silent) showError(tr('errors.networkError'), tr('alerts.error'));
        return { error: 'Network error', status: 0 };
      } else {
        if (!silent) showError(error.message || tr('errors.serverError'), tr('alerts.error'));
        return { error: error.message, status: 0 };
      }
    }
  }


  function getValueByPath(obj, dottedPath) {
    return String(dottedPath || '')
      .split('.')
      .filter(Boolean)
      .reduce((acc, key) => (acc && Object.prototype.hasOwnProperty.call(acc, key) ? acc[key] : undefined), obj);
  }

  function interpolate(template, params = {}) {
    return String(template).replace(/\{(\w+)\}/g, (_match, key) => {
      return Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : `{${key}}`;
    });
  }

  function tr(key, params) {
    const table = state.translations[state.locale] || {};
    const fallback = state.translations.en || {};
    const value = getValueByPath(table, key) ?? getValueByPath(fallback, key) ?? key;
    return interpolate(value, params);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setMessage(text, type) {
    refs.message.textContent = text || '';
    refs.message.style.color = type === 'error' ? 'var(--err)' : type === 'ok' ? 'var(--ok)' : 'var(--muted)';
  }

  function setPromoMessage(text, type) {
    if (!refs.promoMessage) return;
    refs.promoMessage.textContent = text || '';
    refs.promoMessage.style.color = type === 'error' ? 'var(--err)' : type === 'ok' ? 'var(--ok)' : 'var(--muted)';
  }

  function money(value) {
    return `${state.currencyCode} ${Number(value || 0).toFixed(3)}`;
  }

  function toRgbTuple(hex) {
    if (!hex || typeof hex !== 'string') return null;
    const safe = hex.trim().replace('#', '');
    if (!/^[0-9a-fA-F]{6}$/.test(safe)) return null;
    const r = parseInt(safe.slice(0, 2), 16);
    const g = parseInt(safe.slice(2, 4), 16);
    const b = parseInt(safe.slice(4, 6), 16);
    return `${r}, ${g}, ${b}`;
  }

  function setTheme(theme, persist = true) {
    const finalTheme = theme === 'light' ? 'light' : 'dark';
    state.theme = finalTheme;
    document.documentElement.setAttribute('data-theme', finalTheme);
    const themeBtn = qs('#theme-toggle');
    if (themeBtn) {
      themeBtn.textContent = finalTheme === 'dark' ? tr('theme.switchToLight') : tr('theme.switchToDark');
    }
    if (persist) {
      localStorage.setItem(THEME_KEY, finalTheme);
    }
  }

  function toggleTheme() {
    setTheme(state.theme === 'dark' ? 'light' : 'dark');
  }

  function setLocale(locale, persist = true) {
    const finalLocale = locale === 'ar' ? 'ar' : 'en';
    state.locale = finalLocale;

    document.documentElement.lang = finalLocale;
    document.documentElement.dir = finalLocale === 'ar' ? 'rtl' : 'ltr';

    const langBtn = qs('#lang-toggle');
    if (langBtn) {
      langBtn.textContent = finalLocale === 'en' ? 'AR' : 'EN';
    }

    translatePage();
    renderSummary();
    renderRecommendations();

    if (persist) {
      localStorage.setItem(LANG_KEY, finalLocale);
    }
  }

  function toggleLocale() {
    setLocale(state.locale === 'en' ? 'ar' : 'en');
  }

  function setCurrency(currency) {
    state.currencyCode = currency;
    localStorage.setItem('chauffeur_currency', currency);
    refreshQuote({ silent: true });
    renderSummary();
    renderVehicleGrid();
    renderRecommendations();
  }

  function applySettings(settings) {
    const toBool = (value, fallback = false) => {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        const v = value.trim().toLowerCase();
        if (v === 'true') return true;
        if (v === 'false') return false;
      }
      return fallback;
    };

    state.settings = settings;
    state.currencyCode = settings.currency_code || 'BHD';

    const root = document.documentElement;
    if (settings.primary_color) {
      root.style.setProperty('--accent', settings.primary_color);
      const rgb = toRgbTuple(settings.primary_color);
      if (rgb) root.style.setProperty('--accent-rgb', rgb);
    }
    if (settings.secondary_color) {
      root.style.setProperty('--accent-2', settings.secondary_color);
      const rgb = toRgbTuple(settings.secondary_color);
      if (rgb) root.style.setProperty('--accent-2-rgb', rgb);
    }

    if (settings.default_theme && !localStorage.getItem(THEME_KEY)) {
      setTheme(settings.default_theme, false);
    }

    document.title = settings.seo_title || `${settings.app_name || 'Booking'} | Chauffeur`;

    const metaDescription = qs('meta[name="description"]');
    const metaKeywords = qs('meta[name="keywords"]');
    const metaRobots = qs('meta[name="robots"]');
    if (metaDescription) metaDescription.setAttribute('content', settings.seo_description || '');
    if (metaKeywords) metaKeywords.setAttribute('content', settings.seo_keywords || '');
    if (metaRobots) metaRobots.setAttribute('content', settings.seo_indexable ? 'index,follow' : 'noindex,nofollow');

    const brand = qs('#brand-name');
    if (brand && settings.app_name) {
      brand.textContent = settings.app_name;
    }

    const footerBrand = qs('#footer-brand');
    if (footerBrand && settings.app_name) footerBrand.textContent = settings.app_name;

    const footerContact = qs('#footer-contact');
    if (footerContact) {
      const contactBits = [settings.support_phone, settings.support_email].filter(Boolean);
      footerContact.textContent = contactBits.length ? `Contact: ${contactBits.join(' • ')}` : tr('footer.defaultContact');
    }

    const enhanceEnabled = toBool(settings.enhance_journey_enabled, true);
    const maintenanceMode = toBool(settings.maintenance_mode, false);
    const bookingEnabled = toBool(settings.booking_enabled, true);

    const enhanceEl = qs('#enhance-cta');
    if (enhanceEl) {
      if (enhanceEnabled) {
        enhanceEl.classList.remove('hidden');
        enhanceEl.textContent = settings.enhance_journey_text || 'Enhance Your Journey';
      } else {
        enhanceEl.classList.add('hidden');
      }
    }

    const banner = qs('#system-banner');
    if (banner) {
      if (maintenanceMode) {
        banner.textContent = tr('messages.maintenanceMode');
        banner.classList.remove('hidden');
      } else if (!bookingEnabled) {
        banner.textContent = tr('messages.bookingDisabled');
        banner.classList.remove('hidden');
      } else {
        banner.textContent = '';
        banner.classList.add('hidden');
      }
    }

    const shouldBlockBooking = maintenanceMode || !bookingEnabled;
    const overlay = qs('#maintenance-overlay');
    if (overlay) {
      overlay.classList.toggle('hidden', !shouldBlockBooking);
      overlay.setAttribute('aria-hidden', shouldBlockBooking ? 'false' : 'true');
    }

    const bookingCard = qs('.booking-card');
    if (bookingCard) {
      bookingCard.querySelectorAll('input, select, textarea, button').forEach((el) => {
        if (el.id !== 'maintenance-refresh') {
          el.disabled = shouldBlockBooking;
        }
      });
    }
  }

  async function loadSettings() {
    const result = await fetchApi(`/api/settings?lang=${state.locale}`, { silent: true });
    if (result.success && result.data.settings) {
      applySettings(result.data.settings);
    } else if (!result.success && result.error) {
      console.error('Load settings failed:', result.error);
      showWarning(tr('errors.failedLoadSettings'), tr('alerts.warning'));
    }
  }

  async function loadPublicContactSettings() {
    const result = await fetchApi('/api/settings/public', { silent: true });
    if (!result.success || !result.data.settings) return;

    const whatsApp = result.data.settings.whatsapp_number;
    const fab = qs('#whatsapp-fab');
    if (!fab) return;

    if (!whatsApp) {
      fab.classList.add('hidden');
      return;
    }

    const clean = String(whatsApp).replace(/\D/g, '');
    if (!clean) {
      fab.classList.add('hidden');
      return;
    }

    const bookingRef = state.trackedBooking?.booking_ref || '';
    const text = bookingRef
      ? `Hello, I need support with booking ${bookingRef}.`
      : 'Hello, I need help with booking.';
    fab.href = `https://wa.me/${clean}?text=${encodeURIComponent(text)}`;
    fab.classList.remove('hidden');
  }

  function renderTrackResult(booking) {
    const container = qs('#track-result');
    if (!container) return;

    const statusMap = {
      pending: { label: 'Pending', hint: 'Awaiting confirmation', cls: 'status-pending' },
      confirmed: { label: 'Confirmed', hint: 'Booking confirmed', cls: 'status-confirmed' },
      chauffeur_assigned: { label: 'Driver Assigned', hint: 'Chauffeur assigned', cls: 'status-assigned' },
      in_progress: { label: 'In Progress', hint: 'Trip in progress', cls: 'status-in-progress' },
      completed: { label: 'Completed', hint: 'Trip completed', cls: 'status-completed' },
      cancelled: { label: 'Cancelled', hint: 'Booking cancelled', cls: 'status-cancelled' },
      rejected: { label: 'Rejected', hint: 'Booking rejected', cls: 'status-cancelled' }
    };

    const current = statusMap[booking.status] || { label: booking.status, hint: '', cls: 'status-pending' };
    const timeline = booking.timeline || {};
    const lastUpdate = timeline[`${booking.status}_at`] || timeline.updated_at || booking.updated_at || '';
    const canCancel = ['pending', 'confirmed'].includes(booking.status);

    container.innerHTML = `
      <div class="track-status">
        <div class="status-pill ${current.cls}">${escapeHtml(current.label)}</div>
        <div class="status-hint">${escapeHtml(current.hint)}</div>
        <small class="status-updated">${escapeHtml(lastUpdate || '')}</small>
      </div>
      <div class="track-grid">
        <div><span>${escapeHtml(tr('messages.reference'))}</span><strong>${escapeHtml(booking.booking_ref)}</strong></div>
        <div><span>${escapeHtml(tr('summary.pickup'))}</span><strong>${escapeHtml(booking.pickup_location || '-')}</strong></div>
        <div><span>${escapeHtml(tr('summary.dropoff'))}</span><strong>${escapeHtml(booking.dropoff_location || '-')}</strong></div>
        <div><span>${escapeHtml(tr('summary.departure'))}</span><strong>${escapeHtml(`${booking.departure_date || ''} ${booking.departure_time || ''}`.trim() || '-')}</strong></div>
        <div><span>${escapeHtml(tr('summary.vehicle'))}</span><strong>${escapeHtml(booking.assigned_vehicle_name || booking.vehicle_snapshot?.name || '-')}</strong></div>
        <div><span>${escapeHtml(tr('summary.total'))}</span><strong>${money(booking.final_price || 0)}</strong></div>
      </div>
      ${canCancel ? `<div class="actions"><button id="track-cancel-btn" class="btn">${escapeHtml(tr('tracking.cancel'))}</button></div>` : ''}
    `;

    container.classList.remove('hidden');

    const cancelBtn = qs('#track-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        qs('#cancel-modal').classList.remove('hidden');
      });
    }
  }

  async function lookupBooking(event) {
    event.preventDefault();
    const ref = qs('#track-ref').value.trim();
    const email = qs('#track-email').value.trim();
    if (!ref || !email) return;

    const result = await fetchApi(`/api/bookings/lookup?ref=${encodeURIComponent(ref)}&email=${encodeURIComponent(email)}`);
    if (!result.success) return;
    state.trackedBooking = result.data.booking;
    renderTrackResult(state.trackedBooking);
    loadPublicContactSettings();
  }

  async function cancelTrackedBooking() {
    if (!state.trackedBooking) return;
    const email = qs('#track-email').value.trim();
    const result = await fetchApi(`/api/bookings/${state.trackedBooking.id}/cancel`, {
      method: 'DELETE',
      body: { email }
    });
    qs('#cancel-modal').classList.add('hidden');
    if (!result.success) return;
    showSuccess('Booking cancelled successfully.');
    await lookupBooking({ preventDefault() {} });
  }

  async function loadTranslations() {
    try {
      const enResult = await fetchApi('/js/i18n/en.json', { silent: true });
      const arResult = await fetchApi('/js/i18n/ar.json', { silent: true });

      if (enResult.success && enResult.data) {
        state.translations.en = enResult.data;
      } else {
        state.translations.en = {};
      }

      if (arResult.success && arResult.data) {
        state.translations.ar = arResult.data;
      } else {
        state.translations.ar = {};
      }

      if (!enResult.success || !arResult.success) {
        console.error('Translation load failed - using defaults');
        showWarning(tr('errors.failedLoadTranslations') || 'Could not load translations', tr('alerts.warning'));
      }
    } catch (error) {
      console.error('Load translations failed:', error);
      state.translations.en = {};
      state.translations.ar = {};
      showWarning(tr('errors.failedLoadTranslations') || 'Could not load translations', tr('alerts.warning'));
    }
  }

  function translatePage() {
    qsa('[data-i18n]').forEach((node) => {
      const key = node.getAttribute('data-i18n');
      node.textContent = tr(key);
    });

    qsa('[data-i18n-placeholder]').forEach((node) => {
      const key = node.getAttribute('data-i18n-placeholder');
      node.setAttribute('placeholder', tr(key));
    });

    qsa('option[data-i18n]').forEach((option) => {
      option.textContent = tr(option.getAttribute('data-i18n'));
    });

    const titleNode = qs('title');
    if (titleNode && state.settings?.seo_title) {
      titleNode.textContent = state.settings.seo_title;
    }

    setTheme(state.theme, false);
  }

  function imageForCategory(category) {
    if (category === 'business') return '/assets/vehicles/business.svg';
    if (category === 'suv') return '/assets/vehicles/suv.svg';
    if (category === 'van') return '/assets/vehicles/van.svg';
    return '/assets/vehicles/economy.svg';
  }

  function updateStep(step) {
    state.step = step;
    qsa('.form-step').forEach((el) => el.classList.add('hidden'));
    const activeStep = qs(`#step-${step}`);
    if (activeStep) {
      activeStep.classList.remove('hidden');
      activeStep.classList.add('step-fade-in');
      setTimeout(() => activeStep.classList.remove('step-fade-in'), 260);
    }

    qsa('.step').forEach((el) => {
      const s = Number(el.dataset.step);
      el.classList.toggle('active', s === step);
    });

    if (step === 4) {
      refreshQuote({ silent: true });
      renderSummary();
    }
  }

  function setServiceType(type) {
    state.serviceType = type;
    qsa('.service-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.service === type));
    qs('#trip-panel').classList.toggle('active', type === 'trip');
    qs('#hourly-panel').classList.toggle('active', type === 'hourly');
    refreshQuote({ silent: true });
  }

  function setTransferType(type) {
    state.transferType = type;
    qsa('.return-only').forEach((el) => el.classList.toggle('hidden', type !== 'roundtrip'));
    refreshQuote({ silent: true });
  }

  function currentPassengers() {
    if (state.serviceType === 'hourly') {
      return Number(qs('#hourly-passengers').value || 0);
    }
    return Number(qs('#passengers').value || 0);
  }

  function collectAddOns() {
    const childSeatChecked = qs('#addon-child-seat')?.checked;
    const childSeatCount = Number(qs('#addon-child-seat-count')?.value || 0);
    const extraLuggageChecked = qs('#addon-extra-luggage')?.checked;
    const extraLuggageCount = Number(qs('#addon-extra-luggage-count')?.value || 0);
    const petFriendlyChecked = qs('#addon-pet-friendly')?.checked;

    return {
      child_seat: Boolean(childSeatChecked || childSeatCount > 0),
      child_seat_count: childSeatChecked ? childSeatCount : 0,
      extra_luggage: Boolean(extraLuggageChecked || extraLuggageCount > 0),
      extra_luggage_count: extraLuggageChecked ? extraLuggageCount : 0,
      pet_friendly: Boolean(petFriendlyChecked)
    };
  }

  function collectAddOnNames(addOns) {
    const names = [];
    if (addOns.child_seat && Number(addOns.child_seat_count) > 0) {
      names.push(`${tr('addons.childSeat')} x${addOns.child_seat_count}`);
    }
    if (addOns.extra_luggage && Number(addOns.extra_luggage_count) > 0) {
      names.push(`${tr('addons.extraLuggage')} x${addOns.extra_luggage_count}`);
    }
    if (addOns.pet_friendly) {
      names.push(tr('addons.petFriendly'));
    }
    return names;
  }

  function estimateDistanceKm() {
    if (state.serviceType !== 'trip') return 0;
    const a = state.geo.pickup;
    const b = state.geo.dropoff;
    if (!a || !b) return 0;

    const lat1 = Number(a.lat);
    const lon1 = Number(a.lng);
    const lat2 = Number(b.lat);
    const lon2 = Number(b.lng);
    if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return 0;

    const r = 6371;
    const toRad = (value) => (value * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const p1 = toRad(lat1);
    const p2 = toRad(lat2);

    const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(p1) * Math.cos(p2);
    const distance = 2 * r * Math.asin(Math.sqrt(h));
    return Number(distance.toFixed(2));
  }

  function validateStep(step) {
    if (step === 1) {
      if (state.serviceType === 'trip') {
        const required = ['#pickup-location', '#dropoff-location', '#departure-date', '#departure-time', '#passengers'];
        if (required.some((id) => !qs(id).value.trim())) {
          setMessage(tr('messages.requiredTripFields'), 'error');
          return false;
        }
        if (!state.locationSelected.pickup || !state.locationSelected.dropoff) {
          setMessage(tr('messages.locationSelectTrip'), 'error');
          return false;
        }
        if (state.transferType === 'roundtrip') {
          if (!qs('#return-date').value || !qs('#return-time').value) {
            setMessage(tr('messages.roundTripRequired'), 'error');
            return false;
          }
        }
      } else {
        const required = ['#hourly-pickup', '#hourly-date', '#hourly-time', '#hourly-duration', '#hourly-passengers'];
        if (required.some((id) => !qs(id).value.trim())) {
          setMessage(tr('messages.requiredHourlyFields'), 'error');
          return false;
        }
        if (!state.locationSelected.hourly) {
          setMessage(tr('messages.locationSelectHourly'), 'error');
          return false;
        }
      }
    }

    if (step === 2) {
      if (!state.selectedVehicle) {
        setMessage(tr('messages.selectVehicle'), 'error');
        return false;
      }
      if (currentPassengers() > Number(state.selectedVehicle.capacity || 0)) {
        qs('#vehicle-warning').classList.remove('hidden');
        setMessage(tr('messages.capacityExceeded'), 'error');
        return false;
      }
      qs('#vehicle-warning').classList.add('hidden');
    }

    if (step === 3) {
      const required = ['#first-name', '#last-name', '#email', '#phone'];
      if (required.some((id) => !qs(id).value.trim())) {
        setMessage(tr('messages.requiredDetails'), 'error');
        return false;
      }
      if (!/^\S+@\S+\.\S+$/.test(qs('#email').value.trim())) {
        setMessage(tr('messages.invalidEmail'), 'error');
        return false;
      }
    }

    if (step === 4 && !qs('#terms').checked) {
      setMessage(tr('messages.termsRequired'), 'error');
      return false;
    }

    setMessage('', 'neutral');
    return true;
  }

  function renderVehicleGrid() {
    refs.vehicleGrid.innerHTML = state.vehicles.map((vehicle) => {
      const selected = state.selectedVehicle && state.selectedVehicle.id === vehicle.id;
      const features = Array.isArray(vehicle.features) ? vehicle.features.slice(0, 3).join(' • ') : '';
      return `
        <article class="vehicle-card ${selected ? 'selected' : ''}" data-vehicle-id="${vehicle.id}">
          <div class="vehicle-media"><img src="${imageForCategory(vehicle.category)}" alt="${escapeHtml(vehicle.name)}" loading="lazy" /></div>
          <div class="vehicle-body">
            <div class="vehicle-row">
              <h3 class="vehicle-name">${escapeHtml(vehicle.name)}</h3>
              <span class="badge">${escapeHtml(vehicle.category)}</span>
            </div>
            <p class="vehicle-model">${escapeHtml(vehicle.model)}</p>
            <p class="vehicle-model">${tr('fields.passengers')}: ${vehicle.capacity}${features ? ` • ${escapeHtml(features)}` : ''}</p>
            <p class="price">${money(vehicle.base_price)}</p>
          </div>
        </article>
      `;
    }).join('');

    qsa('.vehicle-card').forEach((card) => {
      card.addEventListener('click', () => {
        const id = Number(card.dataset.vehicleId);
        state.selectedVehicle = state.vehicles.find((v) => v.id === id) || null;
        renderVehicleGrid();
        refreshQuote({ silent: true });
      });
    });
  }

  async function loadVehicles() {
    const result = await fetchApi(`/api/vehicles?lang=${state.locale}`);
    if (result.success && result.data.vehicles) {
      state.vehicles = result.data.vehicles || [];
      if (!state.vehicles.length) {
        showWarning(tr('messages.noVehiclesAvailable') || 'No vehicles available', tr('alerts.warning'));
      }
      renderVehicleGrid();
    } else {
      console.error('Load vehicles failed:', result.error);
      showError(tr('messages.vehicleLoadFailed') || 'Could not load vehicles. Please refresh the page.', tr('alerts.error'));
      refs.vehicleGrid.innerHTML = `<p class="warn">${escapeHtml(tr('messages.vehicleLoadFailed') || 'Failed to load vehicles')}</p>`;
    }
  }

  function fallbackQuote() {
    if (!state.selectedVehicle) {
      return {
        base_price: 0,
        add_ons: collectAddOns(),
        add_ons_price: 0,
        discount_amount: 0,
        final_price: 0,
        subtotal_price: 0,
        distance_km: 0
      };
    }

    const addOns = collectAddOns();
    const basePrice = state.serviceType === 'hourly'
      ? Number(state.selectedVehicle.base_price || 0) * Number(qs('#hourly-duration').value || 1)
      : (state.transferType === 'roundtrip'
        ? Number(state.selectedVehicle.base_price || 0) * 1.9
        : Number(state.selectedVehicle.base_price || 0));

    const addOnPrices = state.settings?.add_on_prices || { child_seat: 2.5, extra_luggage: 1.2, pet_friendly: 3.0 };
    const addOnsPrice =
      (addOns.child_seat ? Number(addOns.child_seat_count || 0) * Number(addOnPrices.child_seat || 0) : 0)
      + (addOns.extra_luggage ? Number(addOns.extra_luggage_count || 0) * Number(addOnPrices.extra_luggage || 0) : 0)
      + (addOns.pet_friendly ? Number(addOnPrices.pet_friendly || 0) : 0);

    const subtotal = Number((basePrice + addOnsPrice).toFixed(3));

    return {
      base_price: Number(basePrice.toFixed(3)),
      add_ons: addOns,
      add_ons_price: Number(addOnsPrice.toFixed(3)),
      discount_amount: 0,
      final_price: subtotal,
      subtotal_price: subtotal,
      distance_km: estimateDistanceKm()
    };
  }

  function buildQuotePayload() {
    if (!state.selectedVehicle) return null;

    const base = {
      lang: state.locale,
      service_type: state.serviceType,
      transfer_type: state.transferType,
      vehicle_id: state.selectedVehicle.id,
      hourly_duration: state.serviceType === 'hourly' ? Number(qs('#hourly-duration').value || 0) : null,
      passengers: currentPassengers(),
      luggage: state.serviceType === 'trip' ? Number(qs('#luggage').value || 0) : 0,
      add_ons: collectAddOns(),
      distance_km: estimateDistanceKm()
    };

    if (state.appliedPromo?.code) {
      base.promo_code = state.appliedPromo.code;
    }

    return base;
  }

  async function refreshQuote({ silent = false } = {}) {
    if (!state.selectedVehicle) {
      state.quote = fallbackQuote();
      renderSummary();
      renderRecommendations();
      return;
    }

    const payload = buildQuotePayload();
    if (!payload) return;

    state.quoteBusy = true;
    if (refs.quoteLoading) refs.quoteLoading.classList.remove('hidden');

    try {
      const result = await fetchApi(`/api/bookings/quote`, {
        method: 'POST',
        body: payload,
        silent
      });

      if (result.success) {
        const data = result.data;
        state.quote = data.quote || fallbackQuote();
        state.recommendations = data.recommendations || [];

        if (data.promo) {
          state.appliedPromo = data.promo;
        } else if (state.appliedPromo?.code && data.promo_error) {
          state.appliedPromo = null;
          if (!silent) showWarning(data.promo_error || tr('messages.promoInvalid'), tr('alerts.warning'));
        }
      } else {
        state.quote = fallbackQuote();
        if (!silent) showError(result.error || tr('messages.quoteFailed'), tr('alerts.error'));
      }

      renderSummary();
      renderRecommendations();
    } catch (error) {
      console.error('Quote failed:', error);
      if (!silent) showError(error.message || tr('messages.quoteFailed'), tr('alerts.error'));
      state.quote = fallbackQuote();
      renderSummary();
    } finally {
      state.quoteBusy = false;
      if (refs.quoteLoading) refs.quoteLoading.classList.add('hidden');
    }
  }

  function renderRecommendations() {
    const box = refs.recommendationsBox;
    if (!box) return;

    if (!state.recommendations.length) {
      box.classList.add('hidden');
      box.innerHTML = '';
      return;
    }

    box.classList.remove('hidden');
    const cards = state.recommendations.map((item) => {
      return `
        <article class="recommendation-item">
          <h4>${escapeHtml(item.name)}</h4>
          <p>${escapeHtml(item.model || '')}</p>
          <p>${escapeHtml(item.reason || '')}</p>
          <strong>${money(item.base_price)}</strong>
        </article>
      `;
    }).join('');

    box.innerHTML = `<h3>${escapeHtml(tr('recommendation.title'))}</h3><div class="recommendation-grid">${cards}</div>`;
  }

  function renderSummary() {
    const rows = [];

    if (state.serviceType === 'trip') {
      rows.push([tr('summary.service'), tr('summary.transfer')]);
      rows.push([tr('summary.type'), state.transferType === 'roundtrip' ? tr('summary.roundTrip') : tr('summary.oneWay')]);
      rows.push([tr('summary.pickup'), qs('#pickup-location').value]);
      rows.push([tr('summary.dropoff'), qs('#dropoff-location').value]);
      rows.push([tr('summary.departure'), `${qs('#departure-date').value} ${qs('#departure-time').value}`.trim()]);
      if (state.transferType === 'roundtrip') {
        rows.push([tr('summary.return'), `${qs('#return-date').value} ${qs('#return-time').value}`.trim()]);
      }
      rows.push([tr('summary.passengers'), qs('#passengers').value]);
    } else {
      rows.push([tr('summary.service'), tr('summary.hourly')]);
      rows.push([tr('summary.pickup'), qs('#hourly-pickup').value]);
      rows.push([tr('summary.start'), `${qs('#hourly-date').value} ${qs('#hourly-time').value}`.trim()]);
      rows.push([tr('summary.duration'), `${qs('#hourly-duration').value || 0} h`]);
      rows.push([tr('summary.passengers'), qs('#hourly-passengers').value]);
    }

    if (state.selectedVehicle) {
      rows.push([tr('summary.vehicle'), `${state.selectedVehicle.name} (${state.selectedVehicle.model})`]);
    }

    rows.push([tr('summary.passengerName'), `${qs('#first-name').value} ${qs('#last-name').value}`.trim()]);
    rows.push([tr('summary.email'), qs('#email').value]);
    rows.push([tr('summary.phone'), `${qs('#country-code').value} ${qs('#phone').value}`.trim()]);

    const quote = state.quote || fallbackQuote();
    const addOnNames = collectAddOnNames(quote.add_ons || collectAddOns());

    if (Number(quote.distance_km || 0) > 0) {
      rows.push([tr('summary.distance'), `${Number(quote.distance_km).toFixed(2)} km`]);
    }
    rows.push([tr('summary.baseFare'), money(quote.base_price)]);
    rows.push([tr('summary.addOns'), addOnNames.length ? addOnNames.join(' • ') : tr('summary.none')]);
    rows.push([tr('summary.discount'), Number(quote.discount_amount || 0) > 0 ? `- ${money(quote.discount_amount)}` : '—']);
    rows.push([tr('summary.total'), money(quote.final_price)]);

    const summaryHtml = rows
      .map(([k, v]) => `<div class="summary-item"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v || '—')}</strong></div>`)
      .join('');

    qs('#summary-box').innerHTML = summaryHtml;
    qs('#price-preview').textContent = money(quote.final_price);
  }

  function bookingPayload() {
    const quote = state.quote || fallbackQuote();
    const common = {
      vehicle_id: state.selectedVehicle.id,
      first_name: qs('#first-name').value.trim(),
      last_name: qs('#last-name').value.trim(),
      email: qs('#email').value.trim(),
      country_code: qs('#country-code').value,
      phone: qs('#phone').value.trim(),
      special_requests: qs('#special-requests').value.trim() || null,
      promo_code: state.appliedPromo?.code || null,
      source: 'web',
      language_code: state.locale,
      add_ons: collectAddOns(),
      distance_km: quote.distance_km || estimateDistanceKm()
    };

    if (state.serviceType === 'hourly') {
      return {
        ...common,
        service_type: 'hourly',
        transfer_type: 'oneway',
        pickup_location: qs('#hourly-pickup').value.trim(),
        dropoff_location: null,
        departure_date: qs('#hourly-date').value,
        departure_time: qs('#hourly-time').value,
        return_date: null,
        return_time: null,
        hourly_duration: Number(qs('#hourly-duration').value),
        passengers: Number(qs('#hourly-passengers').value),
        luggage: 0,
        flight_number: null,
        pickup_lat: state.geo.hourly?.lat || null,
        pickup_lng: state.geo.hourly?.lng || null,
        dropoff_lat: null,
        dropoff_lng: null
      };
    }

    return {
      ...common,
      service_type: 'trip',
      transfer_type: state.transferType,
      pickup_location: qs('#pickup-location').value.trim(),
      dropoff_location: qs('#dropoff-location').value.trim(),
      departure_date: qs('#departure-date').value,
      departure_time: qs('#departure-time').value,
      return_date: qs('#return-date').value || null,
      return_time: qs('#return-time').value || null,
      hourly_duration: null,
      passengers: Number(qs('#passengers').value),
      luggage: Number(qs('#luggage').value || 0),
      flight_number: qs('#flight-number').value.trim() || null,
      pickup_lat: state.geo.pickup?.lat || null,
      pickup_lng: state.geo.pickup?.lng || null,
      dropoff_lat: state.geo.dropoff?.lat || null,
      dropoff_lng: state.geo.dropoff?.lng || null
    };
  }

  async function submitBooking() {
    if (state.settings?.maintenance_mode || state.settings?.booking_enabled === false) {
      showError(tr('messages.bookingUnavailable'), tr('alerts.error'));
      return;
    }

    if (!validateStep(4)) {
      showError(tr('messages.termsRequired') || 'Please agree to terms and conditions', tr('alerts.error'));
      return;
    }

    const submitBtn = qs('#submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = '...';

    try {
      showInfo(tr('messages.processingBooking') || 'Processing your booking...', tr('alerts.info'));
      
      await refreshQuote({ silent: true });

      const result = await fetchApi(`/api/bookings`, {
        method: 'POST',
        body: bookingPayload()
      });

      if (!result.success) {
        throw new Error(result.error || tr('messages.submitFailed'));
      }

      const data = result.data;
      qs('#booking-ref').textContent = data.booking.booking_ref || data.booking.id;
      
      showSuccess(tr('messages.bookingCreated') + ' (Ref: ' + (data.booking.booking_ref || data.booking.id) + ')', tr('alerts.success'));
      updateStep(5);
    } catch (error) {
      console.error('Submit booking failed:', error);
      const errorMsg = error.message || tr('messages.submitFailed') || 'Failed to submit booking';
      showError(errorMsg, tr('alerts.error'));
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = tr('actions.confirmBooking');
    }
  }

  async function applyPromoCode() {
    const input = qs('#promo-code');
    const code = input?.value.trim().toUpperCase();
    if (!code) {
      showWarning(tr('messages.promoCodeFirst') || 'Please enter a promo code', tr('alerts.warning'));
      return;
    }

    if (!state.selectedVehicle) {
      showWarning(tr('messages.promoBeforeTrip') || 'Please select a trip first', tr('alerts.warning'));
      return;
    }

    const btn = qs('#apply-promo-btn');
    btn.disabled = true;
    btn.textContent = '...';

    try {
      state.appliedPromo = { code };
      await refreshQuote({ silent: true });

      if (state.appliedPromo?.code === code && Number(state.quote?.discount_amount || 0) > 0) {
        showSuccess(tr('messages.promoApplied', { code }), tr('alerts.success'));
      } else {
        state.appliedPromo = null;
        showWarning(tr('messages.promoInvalid') || 'Promo code is not valid or expired', tr('alerts.warning'));
      }
    } catch (error) {
      console.error('Apply promo failed:', error);
      showError(error.message || tr('messages.promoInvalid'), tr('alerts.error'));
    } finally {
      btn.disabled = false;
      btn.textContent = tr('actions.apply');
      renderSummary();
    }
  }

  function removePromoCode() {
    state.appliedPromo = null;
    const input = qs('#promo-code');
    if (input) input.value = '';
    setPromoMessage(tr('messages.promoRemoved'), 'neutral');
    refreshQuote({ silent: true });
  }

  function debounce(fn, wait) {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn(...args), wait);
    };
  }

  function bindGeoAutocomplete(inputId, listId, stateKey) {
    const input = qs(`#${inputId}`);
    const list = qs(`#${listId}`);

    const search = debounce(async () => {
      const q = input.value.trim();
      if (q.length < 2) {
        list.classList.remove('show');
        list.innerHTML = '';
        return;
      }

      try {
        const result = await fetchApi(`/api/geo/search?q=${encodeURIComponent(q)}&lang=${state.locale}`, { silent: true });
        
        if (!result.success) {
          list.classList.remove('show');
          return;
        }
        
        const results = result.data.results || [];

        list.innerHTML = results.map((r) => `<li data-lat="${r.lat}" data-lng="${r.lon}" data-name="${escapeHtml(r.display_name)}">${escapeHtml(r.display_name)}</li>`).join('');
        list.classList.toggle('show', results.length > 0);

        qsa('li', list).forEach((li) => {
          li.addEventListener('click', () => {
            input.value = li.dataset.name;
            state.geo[stateKey] = { lat: Number(li.dataset.lat), lng: Number(li.dataset.lng) };
            state.locationSelected[stateKey] = true;
            list.classList.remove('show');
            refreshQuote({ silent: true });
          });
        });
      } catch (error) {
        console.error('Geo search failed:', error);
        list.classList.remove('show');
      }
    }, 300);

    input.addEventListener('input', search);
    input.addEventListener('input', () => {
      state.locationSelected[stateKey] = false;
      state.geo[stateKey] = null;
      refreshQuote({ silent: true });
    });
    input.addEventListener('blur', () => setTimeout(() => list.classList.remove('show'), 120));
  }

  function bindLiveRecalculation() {
    const recalc = debounce(() => {
      if (state.step >= 2) {
        refreshQuote({ silent: true });
      }
    }, 220);

    const selectors = [
      '#passengers', '#luggage', '#departure-date', '#departure-time', '#return-date', '#return-time',
      '#hourly-date', '#hourly-time', '#hourly-duration', '#hourly-passengers', '#addon-child-seat-count',
      '#addon-extra-luggage-count', '#addon-child-seat', '#addon-extra-luggage', '#addon-pet-friendly'
    ];

    selectors.forEach((selector) => {
      const el = qs(selector);
      if (!el) return;
      el.addEventListener('input', recalc);
      el.addEventListener('change', recalc);
    });
  }

  function bindActions() {
    const bindClick = (selector, handler) => {
      const el = qs(selector);
      if (el) el.addEventListener('click', handler);
    };

    qsa('.service-btn').forEach((btn) => btn.addEventListener('click', () => setServiceType(btn.dataset.service)));
    qsa('input[name="transferType"]').forEach((radio) => {
      radio.addEventListener('change', () => setTransferType(radio.value));
    });

    qsa('[data-next]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (validateStep(state.step)) {
          updateStep(Number(btn.dataset.next));
        }
      });
    });

    qsa('[data-prev]').forEach((btn) => {
      btn.addEventListener('click', () => updateStep(Number(btn.dataset.prev)));
    });

    bindClick('#submit-btn', submitBooking);
    bindClick('#apply-promo-btn', applyPromoCode);
    bindClick('#remove-promo-btn', removePromoCode);
    bindClick('#lang-toggle', () => {
      toggleLocale();
      loadSettings();
      refreshQuote({ silent: true });
    });
    bindClick('#theme-toggle', toggleTheme);
    const currencyToggle = qs('#currency-toggle');
    if (currencyToggle) {
      currencyToggle.value = state.currencyCode;
      currencyToggle.addEventListener('change', (e) => setCurrency(e.target.value));
    }
    bindClick('#new-booking-btn', () => window.location.reload());

    const trackForm = qs('#track-form');
    if (trackForm) trackForm.addEventListener('submit', lookupBooking);
    const modalClose = qs('#cancel-modal-close');
    if (modalClose) modalClose.addEventListener('click', () => qs('#cancel-modal').classList.add('hidden'));
    const cancelConfirm = qs('#cancel-confirm-btn');
    if (cancelConfirm) cancelConfirm.addEventListener('click', cancelTrackedBooking);
  }

  function initMinDates() {
    const min = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    ['#departure-date', '#return-date', '#hourly-date'].forEach((id) => {
      const el = qs(id);
      if (el) el.min = min;
    });
  }

  async function init() {
    await loadTranslations();

    const savedLocale = localStorage.getItem(LANG_KEY) || 'en';
    const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    const savedTheme = localStorage.getItem(THEME_KEY) || (prefersLight ? 'light' : 'dark');
    const savedCurrency = localStorage.getItem('chauffeur_currency') || 'BHD';
    
    state.currencyCode = savedCurrency;
    setLocale(savedLocale, false);
    setTheme(savedTheme, false);

    bindActions();
    bindLiveRecalculation();
    bindGeoAutocomplete('pickup-location', 'pickup-suggestions', 'pickup');
    bindGeoAutocomplete('dropoff-location', 'dropoff-suggestions', 'dropoff');
    bindGeoAutocomplete('hourly-pickup', 'hourly-suggestions', 'hourly');
    initMinDates();

    await Promise.all([loadVehicles(), loadSettings(), loadPublicContactSettings()]);

    const year = qs('#footer-year');
    if (year) year.textContent = String(new Date().getFullYear());
    renderSummary();
  }

  init();
})();
