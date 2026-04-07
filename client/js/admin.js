(function () {
  'use strict';

  const TOKEN_KEY = 'chauffeur_admin_token';
  const STATUS_COLORS = {
    pending: 'status-pending',
    confirmed: 'status-confirmed',
    chauffeur_assigned: 'status-assigned',
    in_progress: 'status-progress',
    completed: 'status-completed',
    cancelled: 'status-cancelled',
    rejected: 'status-cancelled'
  };

  const state = {
    token: '',
    user: null,
    currentTab: 'dashboard',
    bookings: [],
    bookingLogs: [],
    selectedBooking: null,
    stats: null,
    analytics: { daily_bookings: [], daily_revenue: [] },
    vehicles: [],
    chauffeurs: [],
    promos: [],
    users: [],
    settings: null,
    charts: { bookings: null, revenue: null }
  };

  function qs(selector, ctx = document) { return ctx.querySelector(selector); }
  function qsa(selector, ctx = document) { return Array.from(ctx.querySelectorAll(selector)); }

  function setAuthView(authenticated) {
    document.body.classList.toggle('admin-auth-locked', !authenticated);
    qs('#login-card').hidden = authenticated;
    qs('#app-shell').hidden = !authenticated;
  }

  function authHeaders() {
    return { Authorization: `Bearer ${state.token}`, 'Content-Type': 'application/json' };
  }

  function money(v) {
    const currency = state.settings?.currency_code || 'BHD';
    return `${currency} ${Number(v || 0).toFixed(3)}`;
  }

  function statusBadge(status) {
    const cls = STATUS_COLORS[status] || 'status-pending';
    return `<span class="pill ${cls}">${status}</span>`;
  }

  function setLoginMessage(message, error = false) {
    const el = qs('#login-message');
    el.textContent = message;
    el.style.color = error ? 'var(--admin-danger)' : 'var(--admin-success)';
  }

  async function request(url, options = {}) {
    const res = await fetch(url, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  function activateTab(tab) {
    state.currentTab = tab;
    qsa('.tab-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
    qsa('.tab-content').forEach((panel) => panel.classList.remove('active'));
    qs(`#tab-${tab}`).classList.add('active');
    qs('#tab-title').textContent = tab.charAt(0).toUpperCase() + tab.slice(1);
  }

  async function login(event) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const data = await request('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      state.token = data.token;
      state.user = data.user;
      localStorage.setItem(TOKEN_KEY, state.token);
      setAuthView(true);
      qs('#whoami').textContent = `${state.user.full_name} (${state.user.role})`;
      await refreshAll();
    } catch (error) {
      setLoginMessage(error.message, true);
    }
  }

  function logout() {
    state.token = '';
    localStorage.removeItem(TOKEN_KEY);
    location.reload();
  }

  async function restoreSession() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    try {
      state.token = token;
      const data = await request('/api/auth/me', { headers: authHeaders() });
      state.user = data.user;
      setAuthView(true);
      qs('#whoami').textContent = `${state.user.full_name} (${state.user.role})`;
      await refreshAll();
    } catch (_error) {
      localStorage.removeItem(TOKEN_KEY);
      setAuthView(false);
    }
  }

  function renderDashboard() {
    const s = state.stats || {};
    qs('#kpi-total').textContent = Number(s.total || 0);
    qs('#kpi-pending').textContent = Number(s.pending || 0);
    qs('#kpi-confirmed').textContent = Number(s.confirmed || 0);
    qs('#kpi-completed').textContent = Number(s.completed_trips || 0);
    qs('#kpi-revenue').textContent = money(s.total_revenue || 0);
    qs('#kpi-month-revenue').textContent = money(s.month_revenue || 0);
    qs('#kpi-avg-value').textContent = money(s.average_booking_value || 0);
    qs('#kpi-today').textContent = Number(s.today || 0);
    qs('#pending-badge').textContent = Number(s.pending || 0);
    renderCharts();
  }

  function chartLabels(rows) {
    return rows.map((r) => String(r.day).slice(0, 10));
  }

  function renderCharts() {
    if (!window.Chart) return;
    const bookingsCtx = qs('#bookings-chart');
    const revenueCtx = qs('#revenue-chart');
    if (!bookingsCtx || !revenueCtx) return;

    if (state.charts.bookings) state.charts.bookings.destroy();
    if (state.charts.revenue) state.charts.revenue.destroy();

    state.charts.bookings = new Chart(bookingsCtx, {
      type: 'bar',
      data: {
        labels: chartLabels(state.analytics.daily_bookings || []),
        datasets: [{ label: 'Bookings', data: (state.analytics.daily_bookings || []).map((r) => Number(r.count || 0)), backgroundColor: 'rgba(193, 162, 90, 0.45)', borderColor: 'rgba(193, 162, 90, 1)', borderWidth: 1 }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });

    state.charts.revenue = new Chart(revenueCtx, {
      type: 'line',
      data: {
        labels: chartLabels(state.analytics.daily_revenue || []),
        datasets: [{ label: 'Revenue', data: (state.analytics.daily_revenue || []).map((r) => Number(r.revenue || 0)), borderColor: 'rgba(74, 144, 226, 1)', backgroundColor: 'rgba(74, 144, 226, 0.2)', tension: 0.35, fill: true }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
  }

  function renderBookings() {
    const query = qs('#search-bookings').value.trim().toLowerCase();
    const filter = qs('#status-filter').value;
    const rows = state.bookings.filter((b) => {
      const txt = `${b.booking_ref} ${b.first_name} ${b.last_name} ${b.email}`.toLowerCase();
      const passText = !query || txt.includes(query);
      const passStatus = !filter || b.status === filter;
      return passText && passStatus;
    });

    qs('#bookings-body').innerHTML = rows.map((b) => `
      <tr data-booking-row="${b.id}">
        <td>${b.booking_ref}</td>
        <td>${b.first_name} ${b.last_name}</td>
        <td>${b.service_type}</td>
        <td>${b.pickup_location || '-'}</td>
        <td>${b.departure_date || ''} ${b.departure_time || ''}</td>
        <td>${money(b.final_price)}</td>
        <td>${statusBadge(b.status)}</td>
        <td><button data-action="view-booking" data-id="${b.id}">Open</button></td>
      </tr>
    `).join('') || '<tr><td colspan="8">No bookings found.</td></tr>';

    qsa('[data-action="view-booking"]').forEach((btn) => btn.addEventListener('click', () => showBookingDetails(Number(btn.dataset.id))));
  }

  function group(title, itemsHtml) {
    return `<section class="detail-group"><h4>${title}</h4><div class="detail-grid">${itemsHtml}</div></section>`;
  }

  function detailItem(label, value) {
    return `<div class="detail-item"><span>${label}</span><strong>${value || '-'}</strong></div>`;
  }

  function renderTimeline(booking) {
    const steps = ['pending', 'confirmed', 'chauffeur_assigned', 'in_progress', 'completed', 'cancelled', 'rejected'];
    const at = {
      pending: booking.created_at,
      confirmed: booking.confirmed_at,
      chauffeur_assigned: booking.chauffeur_assigned_at,
      in_progress: booking.in_progress_at,
      completed: booking.completed_at,
      cancelled: booking.cancelled_at,
      rejected: booking.rejected_at
    };
    return `<section class="detail-group"><h4>Timeline</h4><div class="timeline">${steps.map((step) => `<div class="timeline-item ${booking.status === step ? 'active' : ''}"><span>${step}</span><small>${at[step] || '-'}</small></div>`).join('')}</div></section>`;
  }

  function allowedTransitions(status) {
    const map = {
      pending: ['confirmed', 'rejected', 'cancelled'],
      confirmed: ['chauffeur_assigned', 'rejected', 'cancelled'],
      chauffeur_assigned: ['in_progress', 'cancelled'],
      in_progress: ['completed']
    };
    return map[status] || [];
  }

  function renderBookingActions(booking) {
    const transitions = allowedTransitions(booking.status);
    qs('#booking-actions').innerHTML = transitions.map((status) => `<button data-transition="${status}">Set ${status}</button>`).join('') || '<span>No transitions available.</span>';
    qsa('[data-transition]').forEach((btn) => btn.addEventListener('click', async () => {
      await request(`/api/bookings/${booking.id}/status`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ status: btn.dataset.transition }) });
      await Promise.all([loadBookings(), loadStats()]);
      await showBookingDetails(booking.id);
    }));
  }

  function renderAssignmentSection(booking) {
    const chauffeurOptions = state.chauffeurs
      .filter((c) => c.is_active && ['available', 'off_duty'].includes(c.status))
      .map((c) => `<option value="${c.id}" ${Number(booking.assigned_chauffeur_id) === Number(c.id) ? 'selected' : ''}>${c.full_name} (${c.status})</option>`)
      .join('');
    const vehicleOptions = state.vehicles
      .filter((v) => v.is_active)
      .map((v) => `<option value="${v.id}" ${Number(booking.assigned_vehicle_id) === Number(v.id) ? 'selected' : ''}>${v.name}</option>`)
      .join('');

    return `
      <section class="detail-group">
        <h4>Assignment</h4>
        <div class="assignment-box">
          <label>Assigned Chauffeur
            <select id="assign-chauffeur"><option value="">Select chauffeur</option>${chauffeurOptions}</select>
          </label>
          <label>Assigned Vehicle
            <select id="assign-vehicle"><option value="">Select vehicle</option>${vehicleOptions}</select>
          </label>
          <button id="save-assignment" class="btn-primary">Save Assignment</button>
          <p>Current: ${booking.assigned_chauffeur_name || '-'} / ${booking.assigned_vehicle_name || '-'}</p>
          <p>Assigned At: ${booking.assigned_at || '-'}</p>
        </div>
      </section>
    `;
  }

  function renderNotesSection(booking) {
    const notes = Array.isArray(booking.internal_notes) ? booking.internal_notes.slice().reverse() : [];
    return `
      <section class="detail-group">
        <h4>Notes</h4>
        <div class="notes-box">
          <textarea id="booking-note-input" rows="3" placeholder="Add internal note"></textarea>
          <button id="add-booking-note">Add Note</button>
          <div class="notes-history">${notes.map((n) => `<article><strong>${n.admin_name || 'Admin'}</strong><small>${n.created_at || ''}</small><p>${n.note || ''}</p></article>`).join('') || '<p>No notes yet.</p>'}</div>
        </div>
      </section>
    `;
  }

  async function showBookingDetails(id) {
    const [detail, logs] = await Promise.all([
      request(`/api/bookings/${id}`, { headers: authHeaders() }),
      request(`/api/bookings/${id}/logs`, { headers: authHeaders() })
    ]);
    const b = detail.booking;
    state.selectedBooking = b;
    state.bookingLogs = logs.logs || [];
    // Header: include booking ref and status badge
    const head = qs('#booking-detail .detail-head');
    if (head) {
      const h3 = head.querySelector('h3');
      if (h3) h3.textContent = `Booking ${b.booking_ref}`;
      // remove old badge if present
      const oldBadge = head.querySelector('.booking-status-badge');
      if (oldBadge) oldBadge.remove();
      const badgeCls = STATUS_COLORS[b.status] || 'status-pending';
      h3.insertAdjacentHTML('afterend', `<span class="pill ${badgeCls} booking-status-badge" style="margin-left:8px">${b.status}</span>`);
    }

    // Pickup/dropoff with Google Maps links when coordinates are present
    const pickupHtml = `${b.pickup_location || '-'}${b.pickup_lat && b.pickup_lng ? `<div><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.pickup_lat + ',' + b.pickup_lng)}" target="_blank" rel="noopener" class="map-link">Open in Google Maps</a></div>` : ''}`;
    const dropoffHtml = `${b.dropoff_location || '-'}${b.dropoff_lat && b.dropoff_lng ? `<div><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.dropoff_lat + ',' + b.dropoff_lng)}" target="_blank" rel="noopener" class="map-link">Open in Google Maps</a></div>` : ''}`;

    const customer = group('Customer', [
      detailItem('Name', `${b.first_name} ${b.last_name}`),
      detailItem('Email', b.email),
      detailItem('Phone', `${b.country_code || ''} ${b.phone || ''}`.trim())
    ].join(''));

    const trip = group('Trip', [
      detailItem('Reference', b.booking_ref),
      detailItem('Service', b.service_type),
      detailItem('Pickup', pickupHtml),
      detailItem('Dropoff', dropoffHtml),
      detailItem('Departure', `${b.departure_date || ''} ${b.departure_time || ''}`.trim()),
      detailItem('Status', statusBadge(b.status))
    ].join(''));

    const pricing = group('Pricing', [
      detailItem('Base', money(b.base_price)),
      detailItem('Discount', money(b.discount_amount)),
      detailItem('Total', money(b.final_price))
    ].join(''));

    qs('#booking-detail-body').innerHTML = customer + trip + pricing + renderAssignmentSection(b) + renderNotesSection(b) + renderTimeline(b);
    qs('#booking-detail').hidden = false;
    renderBookingActions(b);
    bindDetailActions(b.id);
  }

  function formatAddOnsForDisplay(addOns) {
    if (!addOns || typeof addOns !== 'object') return 'None';
    const parts = [];
    if (addOns.child_seat) parts.push(`Child seat${addOns.child_seat_count ? ' x' + addOns.child_seat_count : ''}`);
    if (addOns.extra_luggage) parts.push(`Extra luggage${addOns.extra_luggage_count ? ' x' + addOns.extra_luggage_count : ''}`);
    if (addOns.pet_friendly) parts.push('Pet friendly');
    return parts.length ? parts.join('; ') : 'None';
  }

  function printInvoice() {
    if (!state.selectedBooking) return;
    const b = state.selectedBooking;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>Invoice ${b.booking_ref}</title><style>
      body{font-family:Arial,sans-serif;padding:24px;color:#111}
      h1{margin-bottom:2px} .muted{color:#666} table{width:100%;border-collapse:collapse;margin-top:14px}
      td,th{border-bottom:1px solid #ddd;padding:8px;text-align:left} .total{font-size:18px;font-weight:700}
      @media print {button{display:none}}
    </style></head><body>
      <h1>${state.settings?.app_name || 'LUXERIDE'}</h1>
      <p class="muted">Booking Invoice</p>
      <p><strong>Reference:</strong> ${b.booking_ref}</p>
      <table>
        <tr><th>Customer</th><td>${b.first_name} ${b.last_name}</td></tr>
        <tr><th>Service</th><td>${b.service_type}</td></tr>
        <tr><th>Pickup</th><td>${b.pickup_location || '-'}</td></tr>
        <tr><th>Dropoff</th><td>${b.dropoff_location || '-'}</td></tr>
        <tr><th>Vehicle</th><td>${b.assigned_vehicle_name || b.vehicle_snapshot?.name || '-'}</td></tr>
        <tr><th>Chauffeur</th><td>${b.assigned_chauffeur_name || '-'}</td></tr>
        <tr><th>Add-ons</th><td>${formatAddOnsForDisplay(b.add_ons || {})}</td></tr>
        <tr><th>Subtotal</th><td>${money((Number(b.base_price || 0) + Number(b.add_ons_price || 0)))}</td></tr>
        <tr><th>Discount</th><td>${money(b.discount_amount || 0)}</td></tr>
        <tr><th class="total">Total</th><td class="total">${money(b.final_price)}</td></tr>
      </table>
      <p>Support: ${state.settings?.support_email || '-'} | ${state.settings?.support_phone || '-'}</p>
      <button onclick="window.print()">Print</button>
    </body></html>`);
    w.document.close();
  }

  async function bindDetailActions(bookingId) {
    const saveAssignment = qs('#save-assignment');
    const addNoteBtn = qs('#add-booking-note');

    if (saveAssignment) {
      saveAssignment.addEventListener('click', async () => {
        const chauffeurId = Number(qs('#assign-chauffeur').value || 0) || null;
        const vehicleId = Number(qs('#assign-vehicle').value || 0) || null;
        await request(`/api/bookings/${bookingId}/assign`, {
          method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ chauffeur_id: chauffeurId, vehicle_id: vehicleId })
        });
        await Promise.all([loadBookings(), loadStats(), loadChauffeurs()]);
        await showBookingDetails(bookingId);
      });
    }

    if (addNoteBtn) {
      addNoteBtn.addEventListener('click', async () => {
        const note = qs('#booking-note-input').value.trim();
        if (!note) return;
        await request(`/api/bookings/${bookingId}/notes`, {
          method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ note })
        });
        await showBookingDetails(bookingId);
      });
    }
  }

  function renderVehicles() {
    qs('#vehicle-list').innerHTML = state.vehicles.map((v) => `
      <article class="list-item">
        <h4>${v.name} ${statusBadge(v.is_active ? 'confirmed' : 'cancelled')}</h4>
        <p>${v.model} | ${v.category} | ${money(v.base_price)}</p>
        <div class="row"><button data-vehicle-toggle="${v.id}">Toggle Active</button><button data-vehicle-delete="${v.id}">Delete</button></div>
      </article>
    `).join('') || '<p>No vehicles</p>';
    qsa('[data-vehicle-toggle]').forEach((btn) => btn.addEventListener('click', () => toggleVehicle(Number(btn.dataset.vehicleToggle))));
    qsa('[data-vehicle-delete]').forEach((btn) => btn.addEventListener('click', () => deleteVehicle(Number(btn.dataset.vehicleDelete))));

    const vehicleSelect = qs('#chauffeur-vehicle-select');
    if (vehicleSelect) {
      const currentValue = vehicleSelect.value;
      vehicleSelect.innerHTML = '<option value="">No vehicle</option>'
        + state.vehicles.filter((v) => v.is_active).map((v) => `<option value="${v.id}">${v.name}</option>`).join('');
      vehicleSelect.value = currentValue;
    }
  }

  function renderChauffeurs() {
    const query = qs('#search-chauffeurs').value.trim().toLowerCase();
    const rows = state.chauffeurs.filter((c) => {
      const txt = `${c.full_name} ${c.phone} ${c.email || ''}`.toLowerCase();
      return !query || txt.includes(query);
    });

    qs('#chauffeur-list').innerHTML = rows.map((c) => `
      <article class="list-item">
        <h4>${c.full_name} ${statusBadge(c.status)}</h4>
        <p>${c.phone} ${c.email ? `| ${c.email}` : ''}</p>
        <p>License: ${c.license_number || '-'} / Exp: ${c.license_expiry || '-'}</p>
        <p>Vehicle: ${c.vehicle_name || '-'}</p>
        <div class="row">
          <button data-chauffeur-edit="${c.id}">Set Off Duty</button>
          <button data-chauffeur-delete="${c.id}">Delete</button>
        </div>
      </article>
    `).join('') || '<p>No chauffeurs found.</p>';

    qsa('[data-chauffeur-edit]').forEach((btn) => btn.addEventListener('click', async () => {
      await request(`/api/chauffeurs/${btn.dataset.chauffeurEdit}`, {
        method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ status: 'off_duty' })
      });
      await loadChauffeurs();
    }));

    qsa('[data-chauffeur-delete]').forEach((btn) => btn.addEventListener('click', async () => {
      await request(`/api/chauffeurs/${btn.dataset.chauffeurDelete}`, { method: 'DELETE', headers: authHeaders() });
      await loadChauffeurs();
    }));
  }

  function renderPromos() {
    qs('#promo-list').innerHTML = state.promos.map((p) => `
      <article class="list-item">
        <h4>${p.code} ${statusBadge(p.is_active ? 'confirmed' : 'cancelled')}</h4>
        <p>${p.discount_type} ${p.discount_value} | Uses ${p.used_count}/${p.max_uses || 'inf'}</p>
        <div class="row"><button data-promo-toggle="${p.id}">Toggle Active</button></div>
      </article>
    `).join('') || '<p>No promos</p>';
    qsa('[data-promo-toggle]').forEach((btn) => btn.addEventListener('click', () => togglePromo(Number(btn.dataset.promoToggle))));
  }

  function renderUsers() {
    qs('#user-list').innerHTML = state.users.map((u) => `
      <article class="list-item">
        <h4>${u.full_name} ${statusBadge(u.is_active ? 'confirmed' : 'cancelled')}</h4>
        <p>${u.email} | ${u.role}</p>
        <div class="row"><button data-user-toggle="${u.id}">Toggle Active</button></div>
      </article>
    `).join('') || '<p>No users</p>';
    qsa('[data-user-toggle]').forEach((btn) => btn.addEventListener('click', () => toggleUser(Number(btn.dataset.userToggle))));
  }

  function fillSettingsForms(settings) {
    const app = qs('#settings-form');
    const seo = qs('#seo-form');
    if (!app || !seo) return;
    app.app_name.value = settings.app_name || '';
    app.app_tagline.value = settings.app_tagline || '';
    app.hero_title.value = settings.hero_title || '';
    app.hero_subtitle.value = settings.hero_subtitle || '';
    app.currency_code.value = settings.currency_code || 'BHD';
    app.primary_color.value = settings.primary_color || '#d6b16f';
    app.secondary_color.value = settings.secondary_color || '#0e1a26';
    app.support_email.value = settings.support_email || '';
    app.support_phone.value = settings.support_phone || '';
    app.whatsapp_number.value = settings.whatsapp_number || '';
    app.enhance_journey_enabled.value = String(Boolean(settings.enhance_journey_enabled));
    app.enhance_journey_text.value = settings.enhance_journey_text || '';
    app.maintenance_mode.value = String(Boolean(settings.maintenance_mode));
    app.booking_enabled.value = String(Boolean(settings.booking_enabled));

    seo.seo_title.value = settings.seo_title || '';
    seo.seo_description.value = settings.seo_description || '';
    seo.seo_keywords.value = settings.seo_keywords || '';
    seo.seo_indexable.value = String(Boolean(settings.seo_indexable));
    seo.instagram.value = settings.social_links?.instagram || '';
    seo.x.value = settings.social_links?.x || '';
    seo.facebook.value = settings.social_links?.facebook || '';
    seo.linkedin.value = settings.social_links?.linkedin || '';

    const adminBrand = qs('#admin-brand-name');
    const adminFooterBrand = qs('#admin-footer-brand');
    if (settings.app_name && adminBrand) {
      adminBrand.innerHTML = `${settings.app_name} <span>ADMIN</span>`;
    }
    if (settings.app_name && adminFooterBrand) {
      adminFooterBrand.textContent = settings.app_name;
    }
    if (settings.app_name) {
      document.title = `${settings.app_name} Admin Control Center`;
    }
  }

  async function loadStats() {
    const [statsData, analyticsData] = await Promise.all([
      request('/api/bookings/stats', { headers: authHeaders() }),
      request('/api/bookings/analytics', { headers: authHeaders() })
    ]);
    state.stats = statsData.stats || {};
    state.analytics = analyticsData;
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

  async function loadChauffeurs() {
    const data = await request('/api/chauffeurs', { headers: authHeaders() });
    state.chauffeurs = data.chauffeurs || [];
    renderChauffeurs();
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

  async function loadSettings() {
    const data = await request('/api/admin/settings', { headers: authHeaders() });
    state.settings = data.settings || {};
    fillSettingsForms(state.settings);
  }

  async function refreshAll() {
    await Promise.all([loadStats(), loadBookings(), loadVehicles(), loadChauffeurs(), loadPromos(), loadUsers(), loadSettings()]);
  }

  async function createVehicle(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    data.capacity = Number(data.capacity);
    data.base_price = Number(data.base_price);
    data.features = data.features ? data.features.split(',').map((s) => s.trim()).filter(Boolean) : [];
    await request('/api/vehicles', { method: 'POST', headers: authHeaders(), body: JSON.stringify(data) });
    event.currentTarget.reset();
    await loadVehicles();
  }

  async function toggleVehicle(id) {
    const v = state.vehicles.find((x) => x.id === id);
    if (!v) return;
    await request(`/api/vehicles/${id}`, {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify({ ...v, is_active: !v.is_active, features: v.features || [] })
    });
    await loadVehicles();
  }

  async function deleteVehicle(id) {
    await request(`/api/vehicles/${id}`, { method: 'DELETE', headers: authHeaders() });
    await loadVehicles();
  }

  async function createChauffeur(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    data.assigned_vehicle_id = data.assigned_vehicle_id ? Number(data.assigned_vehicle_id) : null;
    await request('/api/chauffeurs', { method: 'POST', headers: authHeaders(), body: JSON.stringify(data) });
    event.currentTarget.reset();
    await loadChauffeurs();
  }

  async function createPromo(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const msgEl = qs('#promo-form-message');
    if (msgEl) { msgEl.textContent = ''; msgEl.style.color = 'var(--admin-muted)'; }
    try {
      const data = Object.fromEntries(new FormData(form).entries());
      data.discount_value = Number(data.discount_value);
      data.max_uses = data.max_uses ? Number(data.max_uses) : null;
      data.min_amount = Number(data.min_amount || 0);
      data.expires_at = data.expires_at ? new Date(data.expires_at).toISOString() : null;
      const created = await request('/api/promo', { method: 'POST', headers: authHeaders(), body: JSON.stringify(data) });
      if (msgEl) { msgEl.textContent = 'Promo created.'; msgEl.style.color = 'var(--admin-success)'; }
      form.reset();
      await loadPromos();
      setTimeout(() => { if (msgEl) msgEl.textContent = ''; }, 3500);
    } catch (err) {
      if (msgEl) { msgEl.textContent = err.message || 'Unable to create promo.'; msgEl.style.color = 'var(--admin-danger)'; }
      else alert(err.message || 'Unable to create promo.');
    }
  }

  async function togglePromo(id) {
    await request(`/api/promo/${id}/toggle`, { method: 'PATCH', headers: authHeaders(), body: '{}' });
    await loadPromos();
  }

  async function createUser(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    await request('/api/admin/users', { method: 'POST', headers: authHeaders(), body: JSON.stringify(data) });
    event.currentTarget.reset();
    await loadUsers();
  }

  async function toggleUser(id) {
    await request(`/api/admin/users/${id}/toggle`, { method: 'PATCH', headers: authHeaders(), body: '{}' });
    await loadUsers();
  }

  async function saveAppSettings(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const msg = qs('#settings-message');
    const payload = {
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
      enhance_journey_enabled: form.enhance_journey_enabled ? (form.enhance_journey_enabled.value === 'true') : false,
      enhance_journey_text: form.enhance_journey_text ? form.enhance_journey_text.value.trim() : '',
      maintenance_mode: form.maintenance_mode.value === 'true',
      booking_enabled: form.booking_enabled.value === 'true'
    };
    try {
      await request('/api/admin/settings', { method: 'PUT', headers: authHeaders(), body: JSON.stringify(payload) });
      await loadSettings();
      if (msg) {
        msg.textContent = 'Settings saved successfully.';
        msg.style.color = 'var(--admin-success)';
      }
    } catch (error) {
      if (msg) {
        msg.textContent = error.message || 'Failed to save settings.';
        msg.style.color = 'var(--admin-danger)';
      }
      alert(error.message || 'Failed to save settings.');
    }
  }

  async function saveSeoSettings(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const msg = qs('#settings-message');
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
    try {
      await request('/api/admin/settings', { method: 'PUT', headers: authHeaders(), body: JSON.stringify(payload) });
      await loadSettings();
      if (msg) {
        msg.textContent = 'SEO and social settings saved successfully.';
        msg.style.color = 'var(--admin-success)';
      }
    } catch (error) {
      if (msg) {
        msg.textContent = error.message || 'Failed to save SEO settings.';
        msg.style.color = 'var(--admin-danger)';
      }
      alert(error.message || 'Failed to save SEO settings.');
    }
  }

  function bindEvents() {
    qs('#login-form').addEventListener('submit', login);
    qs('#btn-logout').addEventListener('click', logout);
    qs('#btn-refresh').addEventListener('click', refreshAll);
    qs('#btn-export').addEventListener('click', async () => {
      try {
        const res = await fetch(`/api/bookings/export/csv?ts=${Date.now()}`, { headers: authHeaders() });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          alert(err.error || 'Export failed');
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bookings-${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch (e) {
        alert('Export failed');
      }
    });
    qs('#print-invoice-btn').addEventListener('click', printInvoice);

    qsa('.tab-btn').forEach((btn) => btn.addEventListener('click', () => activateTab(btn.dataset.tab)));
    qs('#search-bookings').addEventListener('input', renderBookings);
    qs('#status-filter').addEventListener('change', renderBookings);
    qs('#search-chauffeurs').addEventListener('input', renderChauffeurs);

    qs('#vehicle-form').addEventListener('submit', createVehicle);
    qs('#chauffeur-form').addEventListener('submit', createChauffeur);
    qs('#promo-form').addEventListener('submit', createPromo);
    qs('#user-form').addEventListener('submit', createUser);
    qs('#settings-form').addEventListener('submit', saveAppSettings);
    qs('#seo-form').addEventListener('submit', saveSeoSettings);
  }

  bindEvents();
  setAuthView(false);
  qs('#admin-footer-year').textContent = String(new Date().getFullYear());
  restoreSession();
})();