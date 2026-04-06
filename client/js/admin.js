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
    users: []
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

  function money(v) {
    return `BHD ${Number(v || 0).toFixed(3)}`;
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

  async function refreshAll() {
    await Promise.all([loadStats(), loadBookings(), loadVehicles(), loadPromos(), loadUsers()]);
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
  }

  bindEvents();
  restoreSession();
})();
