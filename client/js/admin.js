(function () {
  'use strict';

  const state = {
    token: '',
    user: null,
    currentTab: 'dashboard',
    bookings: [],
    stats: null,
    vehicles: [],
    promos: [],
    users: [],
    settings: null
  };

  const TOKEN_KEY = 'chauffeur_admin_token';

  function qs(s, ctx = document) { return ctx.querySelector(s); }
  function qsa(s, ctx = document) { return Array.from(ctx.querySelectorAll(s)); }

  function authHeaders() {
    return {
      Authorization: `Bearer ${state.token}`,
      'Content-Type': 'application/json'
    };
  }

  function setLoginMessage(msg, isError) {
    const el = qs('#login-message');
    el.textContent = msg;
    el.style.color = isError ? 'var(--err)' : 'var(--ok)';
  }

  function setSettingsMessage(msg, isError) {
    const el = qs('#settings-message');
    if (!el) return;
    el.textContent = msg;
    el.style.color = isError ? 'var(--err)' : 'var(--ok)';
  }

  function money(v) {
    const currency = state.settings?.currency_code || 'BHD';
    return `${currency} ${Number(v || 0).toFixed(3)}`;
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

  function applyAdminTheme(settings) {
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

    const appName = settings.app_name || 'LUXERIDE';
    document.title = `${appName} Admin Control Center`;

    const brandName = qs('#admin-brand-name');
    if (brandName) {
      brandName.innerHTML = `${appName} <span>ADMIN</span>`;
    }

    const brandTagline = qs('#admin-brand-tagline');
    if (brandTagline) {
      brandTagline.textContent = settings.app_tagline || 'Operations cockpit';
    }
  }

  function activateTab(tab) {
    state.currentTab = tab;
    qsa('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    qsa('.tab-content').forEach((c) => c.classList.remove('active'));
    qs(`#tab-${tab}`).classList.add('active');
    qs('#tab-title').textContent = tab.charAt(0).toUpperCase() + tab.slice(1);
  }

  async function request(url, options = {}) {
    const res = await fetch(url, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Request failed');
    }
    return data;
  }

  async function login(event) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());

    try {
      const data = await request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      state.token = data.token;
      state.user = data.user;
      localStorage.setItem(TOKEN_KEY, state.token);
      setLoginMessage('Login successful.', false);
      qs('#login-card').hidden = true;
      qs('#app-shell').hidden = false;
      qs('#whoami').textContent = `${state.user.full_name} (${state.user.role})`;
      await refreshAll();
    } catch (error) {
      setLoginMessage(error.message, true);
    }
  }

  function logout() {
    state.token = '';
    state.user = null;
    localStorage.removeItem(TOKEN_KEY);
    location.reload();
  }

  async function restoreSession() {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (!saved) return;

    try {
      state.token = saved;
      const data = await request('/api/auth/me', { headers: authHeaders() });
      state.user = data.user;
      qs('#login-card').hidden = true;
      qs('#app-shell').hidden = false;
      qs('#whoami').textContent = `${state.user.full_name} (${state.user.role})`;
      await refreshAll();
    } catch (_error) {
      localStorage.removeItem(TOKEN_KEY);
      state.token = '';
      state.user = null;
    }
  }

  function renderDashboard() {
    const s = state.stats || {};
    qs('#kpi-total').textContent = Number(s.total || 0);
    qs('#kpi-pending').textContent = Number(s.pending || 0);
    qs('#kpi-confirmed').textContent = Number(s.confirmed || 0);
    qs('#kpi-today').textContent = Number(s.today || 0);
    qs('#kpi-revenue').textContent = money(s.total_revenue || 0);

    const rows = [
      ['Pending', Number(s.pending || 0)],
      ['Confirmed', Number(s.confirmed || 0)],
      ['Completed', Number(s.completed || 0)]
    ];
    qs('#status-mix').innerHTML = rows.map(([k, v]) => `<div>${k}: <strong>${v}</strong></div>`).join('');
  }

  function renderBookings() {
    const query = qs('#search-bookings').value.trim().toLowerCase();
    const status = qs('#status-filter').value;
    const body = qs('#bookings-body');

    const rows = state.bookings.filter((b) => {
      const text = `${b.booking_ref} ${b.first_name} ${b.last_name} ${b.email}`.toLowerCase();
      const statusOk = status ? b.status === status : true;
      return statusOk && (!query || text.includes(query));
    });

    body.innerHTML = rows.map((b) => `
      <tr>
        <td>${b.booking_ref}</td>
        <td>${b.first_name} ${b.last_name}</td>
        <td>${b.service_type}</td>
        <td>${b.pickup_location || '—'}</td>
        <td>${b.departure_date || ''} ${b.departure_time || ''}</td>
        <td>${money(b.final_price)}</td>
        <td><span class="pill">${b.status}</span></td>
        <td>
          <button data-act="view" data-id="${b.id}">View</button>
          <button data-act="status" data-id="${b.id}" data-status="confirmed">Confirm</button>
          <button data-act="status" data-id="${b.id}" data-status="completed">Complete</button>
          <button data-act="status" data-id="${b.id}" data-status="rejected">Reject</button>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="8">No bookings found.</td></tr>';

    qsa('button[data-act="status"]', body).forEach((btn) => {
      btn.addEventListener('click', () => updateBookingStatus(btn.dataset.id, btn.dataset.status));
    });
    qsa('button[data-act="view"]', body).forEach((btn) => {
      btn.addEventListener('click', () => showBookingDetails(btn.dataset.id));
    });
  }

  function formatDateTime(dateValue, timeValue) {
    if (!dateValue) return '—';
    return `${dateValue}${timeValue ? ` ${timeValue}` : ''}`;
  }

  async function showBookingDetails(id) {
    const data = await request(`/api/bookings/${id}`, { headers: authHeaders() });
    const b = data.booking;
    const fields = [
      ['Reference', b.booking_ref],
      ['Service', b.service_type],
      ['Transfer Type', b.transfer_type],
      ['Status', b.status],
      ['Customer', `${b.first_name} ${b.last_name}`],
      ['Email', b.email],
      ['Phone', `${b.country_code || ''} ${b.phone || ''}`.trim()],
      ['Pickup', b.pickup_location],
      ['Dropoff', b.dropoff_location],
      ['Departure', formatDateTime(b.departure_date, b.departure_time)],
      ['Return', formatDateTime(b.return_date, b.return_time)],
      ['Passengers', b.passengers],
      ['Luggage', b.luggage],
      ['Flight', b.flight_number],
      ['Vehicle', b.vehicle_snapshot ? `${b.vehicle_snapshot.name} (${b.vehicle_snapshot.model})` : '—'],
      ['Special Requests', b.special_requests],
      ['Base Price', money(b.base_price)],
      ['Discount', money(b.discount_amount)],
      ['Final Price', money(b.final_price)],
      ['Created At', b.created_at]
    ];

    const detailBody = qs('#booking-detail-body');
    detailBody.innerHTML = fields.map(([label, value]) => `
      <div class="detail-item">
        <span>${label}</span>
        <strong>${value || '—'}</strong>
      </div>
    `).join('');
    qs('#booking-detail').hidden = false;
  }

  function renderVehicles() {
    const box = qs('#vehicle-list');
    box.innerHTML = state.vehicles.map((v) => `
      <article class="list-item">
        <h4>${v.name} <span class="pill">${v.category}</span></h4>
        <p>${v.model} • Capacity ${v.capacity} • ${money(v.base_price)} • ${v.is_active ? 'Active' : 'Inactive'}</p>
        <div class="row">
          <button data-vehicle-toggle="${v.id}">Toggle Active</button>
          <button data-vehicle-delete="${v.id}">Delete</button>
        </div>
      </article>
    `).join('') || '<p>No vehicles.</p>';

    qsa('[data-vehicle-toggle]', box).forEach((btn) => btn.addEventListener('click', () => toggleVehicle(btn.dataset.vehicleToggle)));
    qsa('[data-vehicle-delete]', box).forEach((btn) => btn.addEventListener('click', () => deleteVehicle(btn.dataset.vehicleDelete)));
  }

  function renderPromos() {
    const box = qs('#promo-list');
    box.innerHTML = state.promos.map((p) => `
      <article class="list-item">
        <h4>${p.code} <span class="pill">${p.discount_type}</span></h4>
        <p>Value ${p.discount_value} • Uses ${p.used_count}/${p.max_uses || '∞'} • Min ${money(p.min_amount)} • ${p.is_active ? 'Active' : 'Inactive'}</p>
        <div class="row"><button data-promo-toggle="${p.id}">Toggle Active</button></div>
      </article>
    `).join('') || '<p>No promos.</p>';

    qsa('[data-promo-toggle]', box).forEach((btn) => btn.addEventListener('click', () => togglePromo(btn.dataset.promoToggle)));
  }

  function renderUsers() {
    const box = qs('#user-list');
    box.innerHTML = state.users.map((u) => `
      <article class="list-item">
        <h4>${u.full_name} <span class="pill">${u.role}</span></h4>
        <p>${u.email} • ${u.is_active ? 'Active' : 'Inactive'}</p>
        <div class="row"><button data-user-toggle="${u.id}">Toggle Active</button></div>
      </article>
    `).join('') || '<p>No users.</p>';

    qsa('[data-user-toggle]', box).forEach((btn) => btn.addEventListener('click', () => toggleUser(btn.dataset.userToggle)));
  }

  async function loadStats() {
    const data = await request('/api/bookings/stats', { headers: authHeaders() });
    state.stats = data.stats;
    renderDashboard();
  }

  async function loadBookings() {
    const data = await request('/api/bookings?page=1&limit=100', { headers: authHeaders() });
    state.bookings = data.bookings || [];
    renderBookings();
  }

  async function loadVehicles() {
    const data = await request('/api/vehicles/all', { headers: authHeaders() });
    state.vehicles = data.vehicles || [];
    renderVehicles();
  }

  async function loadPromos() {
    const data = await request('/api/promo', { headers: authHeaders() });
    state.promos = data.promos || [];
    renderPromos();
  }

  async function loadUsers() {
    const data = await request('/api/admin/users', { headers: authHeaders() });
    state.users = data.users || [];
    renderUsers();
  }

  function fillSettingsForms(settings) {
    const appForm = qs('#settings-form');
    const seoForm = qs('#seo-form');
    if (!appForm || !seoForm) return;

    appForm.app_name.value = settings.app_name || '';
    appForm.app_tagline.value = settings.app_tagline || '';
    appForm.hero_title.value = settings.hero_title || '';
    appForm.hero_subtitle.value = settings.hero_subtitle || '';
    appForm.currency_code.value = settings.currency_code || 'BHD';
    appForm.primary_color.value = settings.primary_color || '#ffd27d';
    appForm.secondary_color.value = settings.secondary_color || '#0d1622';
    appForm.support_email.value = settings.support_email || '';
    appForm.support_phone.value = settings.support_phone || '';
    appForm.whatsapp_number.value = settings.whatsapp_number || '';
    appForm.maintenance_mode.value = String(Boolean(settings.maintenance_mode));
    appForm.booking_enabled.value = String(Boolean(settings.booking_enabled));

    seoForm.seo_title.value = settings.seo_title || '';
    seoForm.seo_description.value = settings.seo_description || '';
    seoForm.seo_keywords.value = settings.seo_keywords || '';
    seoForm.seo_indexable.value = String(Boolean(settings.seo_indexable));
    seoForm.instagram.value = settings.social_links?.instagram || '';
    seoForm.x.value = settings.social_links?.x || '';
    seoForm.facebook.value = settings.social_links?.facebook || '';
    seoForm.linkedin.value = settings.social_links?.linkedin || '';
  }

  async function loadSettings() {
    const data = await request('/api/admin/settings', { headers: authHeaders() });
    state.settings = data.settings || null;
    if (state.settings) {
      fillSettingsForms(state.settings);
      applyAdminTheme(state.settings);
      renderDashboard();
      renderBookings();
      renderVehicles();
      renderPromos();
    }
  }

  function settingsPayloadFromAppForm(form) {
    return {
      app_name: form.app_name.value.trim(),
      app_tagline: form.app_tagline.value.trim(),
      hero_title: form.hero_title.value.trim(),
      hero_subtitle: form.hero_subtitle.value.trim(),
      currency_code: form.currency_code.value.trim() || 'BHD',
      primary_color: form.primary_color.value,
      secondary_color: form.secondary_color.value,
      support_email: form.support_email.value.trim(),
      support_phone: form.support_phone.value.trim(),
      whatsapp_number: form.whatsapp_number.value.trim(),
      maintenance_mode: form.maintenance_mode.value === 'true',
      booking_enabled: form.booking_enabled.value === 'true'
    };
  }

  async function saveAppSettings(event) {
    event.preventDefault();
    const payload = settingsPayloadFromAppForm(event.currentTarget);

    await request('/api/admin/settings', {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(payload)
    });

    setSettingsMessage('App settings saved.', false);
    await loadSettings();
  }

  async function saveSeoSettings(event) {
    event.preventDefault();
    const form = event.currentTarget;

    const payload = {
      seo_title: form.seo_title.value.trim(),
      seo_description: form.seo_description.value.trim(),
      seo_keywords: form.seo_keywords.value.trim(),
      seo_indexable: form.seo_indexable.value === 'true',
      social_links: {
        instagram: form.instagram.value.trim(),
        x: form.x.value.trim(),
        facebook: form.facebook.value.trim(),
        linkedin: form.linkedin.value.trim()
      }
    };

    await request('/api/admin/settings', {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(payload)
    });

    setSettingsMessage('SEO settings saved.', false);
    await loadSettings();
  }

  async function refreshAll() {
    await Promise.all([loadStats(), loadBookings(), loadVehicles(), loadPromos(), loadUsers(), loadSettings()]);
  }

  async function updateBookingStatus(id, status) {
    await request(`/api/bookings/${id}/status`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ status })
    });
    await Promise.all([loadBookings(), loadStats()]);
  }

  async function createVehicle(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    data.capacity = Number(data.capacity);
    data.base_price = Number(data.base_price);
    data.features = data.features ? data.features.split(',').map((x) => x.trim()).filter(Boolean) : [];

    await request('/api/vehicles', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data)
    });

    event.currentTarget.reset();
    await loadVehicles();
  }

  async function toggleVehicle(id) {
    const vehicle = state.vehicles.find((x) => String(x.id) === String(id));
    if (!vehicle) return;

    await request(`/api/vehicles/${id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({
        name: vehicle.name,
        model: vehicle.model,
        category: vehicle.category,
        capacity: Number(vehicle.capacity),
        base_price: Number(vehicle.base_price),
        features: vehicle.features || [],
        is_active: !vehicle.is_active
      })
    });

    await loadVehicles();
  }

  async function deleteVehicle(id) {
    await request(`/api/vehicles/${id}`, { method: 'DELETE', headers: authHeaders() });
    await loadVehicles();
  }

  async function createPromo(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    data.discount_value = Number(data.discount_value);
    data.max_uses = data.max_uses ? Number(data.max_uses) : null;
    data.min_amount = Number(data.min_amount || 0);
    data.expires_at = data.expires_at ? new Date(data.expires_at).toISOString() : null;

    await request('/api/promo', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data)
    });

    event.currentTarget.reset();
    await loadPromos();
  }

  async function togglePromo(id) {
    await request(`/api/promo/${id}/toggle`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({})
    });
    await loadPromos();
  }

  async function createUser(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());

    await request('/api/admin/users', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data)
    });

    event.currentTarget.reset();
    await loadUsers();
  }

  async function toggleUser(id) {
    await request(`/api/admin/users/${id}/toggle`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({})
    });
    await loadUsers();
  }

  function bindEvents() {
    qs('#login-form').addEventListener('submit', login);
    qs('#btn-logout').addEventListener('click', logout);
    qs('#btn-refresh').addEventListener('click', refreshAll);
    qs('#btn-export').addEventListener('click', () => {
      window.open(`/api/bookings/export/csv?ts=${Date.now()}`, '_blank');
    });

    qsa('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        activateTab(btn.dataset.tab);
      });
    });

    qs('#search-bookings').addEventListener('input', renderBookings);
    qs('#status-filter').addEventListener('change', renderBookings);
    qs('#vehicle-form').addEventListener('submit', createVehicle);
    qs('#promo-form').addEventListener('submit', createPromo);
    qs('#user-form').addEventListener('submit', createUser);
    qs('#settings-form').addEventListener('submit', saveAppSettings);
    qs('#seo-form').addEventListener('submit', saveSeoSettings);
  }

  bindEvents();
  restoreSession();
})();
