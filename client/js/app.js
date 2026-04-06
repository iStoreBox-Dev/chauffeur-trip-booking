(function () {
  'use strict';

  const state = {
    step: 1,
    serviceType: 'trip',
    transferType: 'oneway',
    selectedVehicle: null,
    vehicles: [],
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
    currencyCode: 'BHD'
  };

  const refs = {
    message: document.getElementById('form-message'),
    vehicleGrid: document.getElementById('vehicle-grid')
  };

  function qs(selector, ctx = document) { return ctx.querySelector(selector); }
  function qsa(selector, ctx = document) { return Array.from(ctx.querySelectorAll(selector)); }

  function setMessage(text, type) {
    refs.message.textContent = text || '';
    refs.message.style.color = type === 'error' ? 'var(--err)' : type === 'ok' ? 'var(--ok)' : 'var(--muted)';
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

  function applySettings(settings) {
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

    const introTagline = qs('#intro-tagline');
    const introTitle = qs('#intro-title');
    const introSubtitle = qs('#intro-subtitle');
    if (introTagline) introTagline.textContent = settings.app_tagline || 'Luxury Chauffeur Services';
    if (introTitle) introTitle.textContent = settings.hero_title || 'Book Your Chauffeur in 4 Simple Steps';
    if (introSubtitle) introSubtitle.textContent = settings.hero_subtitle || 'Fast booking, accurate routes, and premium comfort with transparent pricing.';

    const banner = qs('#system-banner');
    if (banner) {
      if (settings.maintenance_mode) {
        banner.textContent = 'The service is currently in maintenance mode. Please try again shortly.';
        banner.classList.remove('hidden');
      } else if (!settings.booking_enabled) {
        banner.textContent = 'Booking is temporarily disabled. Please contact support.';
        banner.classList.remove('hidden');
      } else {
        banner.textContent = '';
        banner.classList.add('hidden');
      }
    }
  }

  async function loadSettings() {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (res.ok && data.settings) {
        applySettings(data.settings);
      }
    } catch (_error) {
      // Keep defaults when settings API is unavailable.
    }
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
    qs(`#step-${step}`).classList.remove('hidden');

    qsa('.step').forEach((el) => {
      const s = Number(el.dataset.step);
      el.classList.toggle('active', s === step);
    });

    if (step === 4) {
      renderSummary();
    }
  }

  function setServiceType(type) {
    state.serviceType = type;
    qsa('.service-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.service === type));
    qs('#trip-panel').classList.toggle('active', type === 'trip');
    qs('#hourly-panel').classList.toggle('active', type === 'hourly');
  }

  function setTransferType(type) {
    state.transferType = type;
    qsa('.return-only').forEach((el) => el.classList.toggle('hidden', type !== 'roundtrip'));
  }

  function currentPassengers() {
    if (state.serviceType === 'hourly') {
      return Number(qs('#hourly-passengers').value || 0);
    }
    return Number(qs('#passengers').value || 0);
  }

  function validateStep(step) {
    if (step === 1) {
      if (state.serviceType === 'trip') {
        const required = ['#pickup-location', '#dropoff-location', '#departure-date', '#departure-time', '#passengers'];
        if (required.some((id) => !qs(id).value.trim())) {
          setMessage('Please complete all required trip fields.', 'error');
          return false;
        }
        if (!state.locationSelected.pickup || !state.locationSelected.dropoff) {
          setMessage('Please select pickup and dropoff from the location suggestions.', 'error');
          return false;
        }
        if (state.transferType === 'roundtrip') {
          if (!qs('#return-date').value || !qs('#return-time').value) {
            setMessage('Please add return date and time for round trip.', 'error');
            return false;
          }
        }
      } else {
        const required = ['#hourly-pickup', '#hourly-date', '#hourly-time', '#hourly-duration', '#hourly-passengers'];
        if (required.some((id) => !qs(id).value.trim())) {
          setMessage('Please complete all required hourly fields.', 'error');
          return false;
        }
        if (!state.locationSelected.hourly) {
          setMessage('Please select the pickup location from suggestions.', 'error');
          return false;
        }
      }
    }

    if (step === 2) {
      if (!state.selectedVehicle) {
        setMessage('Please select a vehicle to continue.', 'error');
        return false;
      }
      if (currentPassengers() > Number(state.selectedVehicle.capacity || 0)) {
        qs('#vehicle-warning').classList.remove('hidden');
        setMessage('Passenger count is too high for selected vehicle.', 'error');
        return false;
      }
      qs('#vehicle-warning').classList.add('hidden');
    }

    if (step === 3) {
      const required = ['#first-name', '#last-name', '#email', '#phone'];
      if (required.some((id) => !qs(id).value.trim())) {
        setMessage('Please complete your personal details.', 'error');
        return false;
      }
      if (!/^\S+@\S+\.\S+$/.test(qs('#email').value.trim())) {
        setMessage('Please provide a valid email address.', 'error');
        return false;
      }
    }

    if (step === 4 && !qs('#terms').checked) {
      setMessage('Please agree to terms and privacy policy.', 'error');
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
          <div class="vehicle-media"><img src="${imageForCategory(vehicle.category)}" alt="${vehicle.name}" loading="lazy" /></div>
          <div class="vehicle-body">
            <div class="vehicle-row">
              <h3 class="vehicle-name">${vehicle.name}</h3>
              <span class="badge">${vehicle.category}</span>
            </div>
            <p class="vehicle-model">${vehicle.model}</p>
            <p class="vehicle-model">Capacity: ${vehicle.capacity} passengers${features ? ` • ${features}` : ''}</p>
            <p class="price">From ${money(vehicle.base_price)}</p>
          </div>
        </article>
      `;
    }).join('');

    qsa('.vehicle-card').forEach((card) => {
      card.addEventListener('click', () => {
        const id = Number(card.dataset.vehicleId);
        state.selectedVehicle = state.vehicles.find((v) => v.id === id) || null;
        renderVehicleGrid();
      });
    });
  }

  async function loadVehicles() {
    try {
      const res = await fetch('/api/vehicles');
      const data = await res.json();
      state.vehicles = data.vehicles || [];
      renderVehicleGrid();
    } catch (_error) {
      refs.vehicleGrid.innerHTML = '<p class="warn">Unable to load vehicle list.</p>';
    }
  }

  function estimatePrice() {
    if (!state.selectedVehicle) return 0;
    const base = Number(state.selectedVehicle.base_price || 0);
    if (state.serviceType === 'hourly') {
      return base * Number(qs('#hourly-duration').value || 1);
    }
    return state.transferType === 'roundtrip' ? base * 1.9 : base;
  }

  function renderSummary() {
    const rows = [];

    if (state.serviceType === 'trip') {
      rows.push(['Service', 'Transfer']);
      rows.push(['Type', state.transferType === 'roundtrip' ? 'Round Trip' : 'One Way']);
      rows.push(['Pickup', qs('#pickup-location').value]);
      rows.push(['Dropoff', qs('#dropoff-location').value]);
      rows.push(['Departure', `${qs('#departure-date').value} ${qs('#departure-time').value}`]);
      if (state.transferType === 'roundtrip') {
        rows.push(['Return', `${qs('#return-date').value} ${qs('#return-time').value}`]);
      }
      rows.push(['Passengers', qs('#passengers').value]);
    } else {
      rows.push(['Service', 'Hourly']);
      rows.push(['Pickup', qs('#hourly-pickup').value]);
      rows.push(['Start', `${qs('#hourly-date').value} ${qs('#hourly-time').value}`]);
      rows.push(['Duration', `${qs('#hourly-duration').value} hours`]);
      rows.push(['Passengers', qs('#hourly-passengers').value]);
    }

    if (state.selectedVehicle) {
      rows.push(['Vehicle', `${state.selectedVehicle.name} (${state.selectedVehicle.model})`]);
    }

    rows.push(['Passenger Name', `${qs('#first-name').value} ${qs('#last-name').value}`]);
    rows.push(['Email', qs('#email').value]);
    rows.push(['Phone', `${qs('#country-code').value} ${qs('#phone').value}`]);

    const summaryHtml = rows.map(([k, v]) => `<div class="summary-item"><span>${k}</span><strong>${v || '—'}</strong></div>`).join('');
    qs('#summary-box').innerHTML = summaryHtml;
    qs('#price-preview').textContent = money(estimatePrice());
  }

  function bookingPayload() {
    const common = {
      vehicle_id: state.selectedVehicle.id,
      first_name: qs('#first-name').value.trim(),
      last_name: qs('#last-name').value.trim(),
      email: qs('#email').value.trim(),
      country_code: qs('#country-code').value,
      phone: qs('#phone').value.trim(),
      special_requests: qs('#special-requests').value.trim() || null,
      promo_code: null,
      source: 'web'
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
      setMessage('Booking is currently unavailable. Please contact support.', 'error');
      return;
    }

    if (!validateStep(4)) return;

    const submitBtn = qs('#submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookingPayload())
      });
      const data = await res.json();

      if (!res.ok) {
        setMessage(data.error || 'Unable to submit booking.', 'error');
        return;
      }

      qs('#booking-ref').textContent = data.booking.booking_ref;
      updateStep(5);
    } catch (_error) {
      setMessage('Network error. Please try again.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Confirm Booking';
    }
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
        const res = await fetch(`/api/geo/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        const results = data.results || [];

        list.innerHTML = results.map((r) => `<li data-lat="${r.lat}" data-lng="${r.lon}" data-name="${r.display_name}">${r.display_name}</li>`).join('');
        list.classList.toggle('show', results.length > 0);

        qsa('li', list).forEach((li) => {
          li.addEventListener('click', () => {
            input.value = li.dataset.name;
            state.geo[stateKey] = { lat: li.dataset.lat, lng: li.dataset.lng };
            state.locationSelected[stateKey] = true;
            list.classList.remove('show');
          });
        });
      } catch (_error) {
        list.classList.remove('show');
      }
    }, 300);

    input.addEventListener('input', search);
    input.addEventListener('input', () => {
      state.locationSelected[stateKey] = false;
      state.geo[stateKey] = null;
    });
    input.addEventListener('blur', () => setTimeout(() => list.classList.remove('show'), 120));
  }

  function bindActions() {
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

    qs('#submit-btn').addEventListener('click', submitBooking);
  }

  function initMinDates() {
    const min = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    ['#departure-date', '#return-date', '#hourly-date'].forEach((id) => {
      const el = qs(id);
      if (el) el.min = min;
    });
  }

  function init() {
    bindActions();
    bindGeoAutocomplete('pickup-location', 'pickup-suggestions', 'pickup');
    bindGeoAutocomplete('dropoff-location', 'dropoff-suggestions', 'dropoff');
    bindGeoAutocomplete('hourly-pickup', 'hourly-suggestions', 'hourly');
    initMinDates();
    loadVehicles();
    loadSettings();
  }

  init();
})();
