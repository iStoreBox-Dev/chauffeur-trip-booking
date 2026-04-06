(function () {
  'use strict';

  const state = {
    currentStep: 1,
    serviceType: 'trip',
    transferType: 'oneway',
    tripData: {},
    vehicle: null,
    contactData: {}
  };

  function $(sel, ctx = document) { return ctx.querySelector(sel); }
  function $$(sel, ctx = document) { return [...ctx.querySelectorAll(sel)]; }
  function fmt(val) { return val || '—'; }

  function goToStep(n) {
    state.currentStep = n;
    $$('.form-step').forEach(el => el.classList.add('hidden'));
    const target = $(`#step-${n}`);
    if (target) target.classList.remove('hidden');
    $$('.step-item').forEach(item => {
      const s = parseInt(item.dataset.step);
      item.classList.remove('active', 'completed');
      if (s === n) item.classList.add('active');
      else if (s < n) item.classList.add('completed');
    });
    if (n === 4) buildSummary();
    $('html').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function validateStep(n) {
    if (n === 1) {
      if (state.serviceType === 'trip') {
        const pickup = $('#pickup-location').value.trim();
        const dropoff = $('#dropoff-location').value.trim();
        const date = $('#departure-date').value;
        const time = $('#departure-time').value;
        const pax = $('#passengers').value;
        if (!pickup || !dropoff || !date || !time || !pax) { showError('Please fill in all required trip fields.'); return false; }
        if (state.transferType === 'roundtrip') {
          if (!$('#return-date').value || !$('#return-time').value) { showError('Please fill in return date and time.'); return false; }
        }
      } else {
        if (!$('#hourly-pickup').value.trim() || !$('#hourly-date').value || !$('#hourly-time').value || !$('#hourly-duration').value || !$('#hourly-passengers').value) { showError('Please fill in all required hourly fields.'); return false; }
      }
    }
    if (n === 2) {
      if (!state.vehicle) { showError('Please select a vehicle.'); return false; }
      const pax = parseInt(state.serviceType === 'trip' ? $('#passengers').value : $('#hourly-passengers').value) || 1;
      if (pax > parseInt(state.vehicle.capacity)) { $('#vehicle-warning').classList.remove('hidden'); return false; }
    }
    if (n === 3) {
      const fn = $('#first-name').value.trim();
      const ln = $('#last-name').value.trim();
      const em = $('#email').value.trim();
      const ph = $('#phone').value.trim();
      if (!fn || !ln || !em || !ph) { showError('Please fill in all required personal details.'); return false; }
      if (!/\S+@\S+\.\S+/.test(em)) { showError('Please enter a valid email address.'); return false; }
    }
    if (n === 4) {
      if (!$('#terms-agree').checked) { showError('Please agree to the Terms & Conditions.'); return false; }
    }
    return true;
  }

  function showError(msg) {
    const existing = $('.form-error-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'form-error-toast';
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><span>${msg}</span>`;
    const step = $(`#step-${state.currentStep}`);
    if (step) step.insertAdjacentElement('afterbegin', toast);
    setTimeout(() => toast.remove(), 4000);
  }

  $$('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.serviceType = btn.dataset.tab;
      $$('.tab-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      $$('.tab-panel').forEach(p => { p.classList.remove('active'); p.hidden = true; });
      const panel = $(`#tab-${btn.dataset.tab}`);
      panel.classList.add('active');
      panel.hidden = false;
    });
  });

  $$('.radio-pill').forEach(pill => {
    const radio = pill.querySelector('input');
    radio.addEventListener('change', () => {
      $$('.radio-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      state.transferType = radio.value;
      const returnFields = $$('.return-field');
      returnFields.forEach(f => f.classList.toggle('hidden', radio.value !== 'roundtrip'));
    });
    pill.addEventListener('click', () => radio.dispatchEvent(new Event('change')));
  });

  $$('.vehicle-card input[type="radio"]').forEach(radio => {
    radio.addEventListener('change', () => {
      $('#vehicle-warning').classList.add('hidden');
      state.vehicle = { value: radio.value, name: radio.dataset.name, price: radio.dataset.price, capacity: radio.dataset.capacity };
    });
  });

  document.addEventListener('click', e => {
    const nextBtn = e.target.closest('.btn-next');
    const backBtn = e.target.closest('.btn-back');
    const editBtn = e.target.closest('.edit-link');
    const submitBtn = e.target.closest('.btn-submit');
    if (nextBtn) { const next = parseInt(nextBtn.dataset.next); if (validateStep(state.currentStep)) { collectData(state.currentStep); goToStep(next); } }
    if (backBtn) { goToStep(parseInt(backBtn.dataset.prev)); }
    if (editBtn) { goToStep(parseInt(editBtn.dataset.goto)); }
    if (submitBtn) { if (validateStep(4)) submitBooking(); }
  });

  function collectData(step) {
    if (step === 1) {
      if (state.serviceType === 'trip') {
        state.tripData = { serviceType: 'trip', transferType: state.transferType, pickupLocation: $('#pickup-location').value.trim(), dropoffLocation: $('#dropoff-location').value.trim(), departureDate: $('#departure-date').value, departureTime: $('#departure-time').value, returnDate: $('#return-date').value, returnTime: $('#return-time').value, passengers: $('#passengers').value, luggage: $('#luggage').value, flightNumber: $('#flight-number').value.trim() };
      } else {
        state.tripData = { serviceType: 'hourly', hourlyPickup: $('#hourly-pickup').value.trim(), hourlyDate: $('#hourly-date').value, hourlyTime: $('#hourly-time').value, hourlyDuration: $('#hourly-duration').value, passengers: $('#hourly-passengers').value };
      }
    }
    if (step === 3) {
      state.contactData = { firstName: $('#first-name').value.trim(), lastName: $('#last-name').value.trim(), email: $('#email').value.trim(), countryCode: $('#country-code').value, phone: $('#phone').value.trim(), specialRequests: $('#special-requests').value.trim() };
    }
  }

  function buildSummary() {
    const td = state.tripData;
    const vc = state.vehicle;
    const cd = state.contactData;
    const tripRows = td.serviceType === 'trip' ? [
      ['Service', 'Transfer Trip'], ['Type', td.transferType === 'roundtrip' ? 'Round Trip' : 'One Way'],
      ['Pick Up', fmt(td.pickupLocation)], ['Drop Off', fmt(td.dropoffLocation)],
      ['Date', formatDate(td.departureDate) + (td.departureTime ? ' · ' + td.departureTime : '')],
      td.transferType === 'roundtrip' ? ['Return', formatDate(td.returnDate) + (td.returnTime ? ' · ' + td.returnTime : '')] : null,
      ['Passengers', fmt(td.passengers)],
      td.flightNumber ? ['Flight No.', td.flightNumber] : null
    ].filter(Boolean) : [
      ['Service', 'Hourly Charter'], ['Pick Up', fmt(td.hourlyPickup)],
      ['Date', formatDate(td.hourlyDate) + (td.hourlyTime ? ' · ' + td.hourlyTime : '')],
      ['Duration', td.hourlyDuration ? td.hourlyDuration + ' hours' : '—'], ['Passengers', fmt(td.passengers)]
    ];
    $('#summary-trip').innerHTML = tripRows.map(([l, v]) => `<div class="summary-item"><span class="summary-label">${l}</span><span class="summary-value">${v}</span></div>`).join('');
    $('#summary-vehicle').innerHTML = vc ? `<div class="summary-item"><span class="summary-label">Vehicle</span><span class="summary-value">${vc.name}</span></div><div class="summary-item"><span class="summary-label">Est. Price</span><span class="summary-value" style="color:var(--color-primary)">from BHD ${vc.price}</span></div>` : '<div class="summary-item"><span class="summary-value">—</span></div>';
    $('#summary-contact').innerHTML = `<div class="summary-item"><span class="summary-label">Name</span><span class="summary-value">${fmt(cd.firstName)} ${fmt(cd.lastName)}</span></div><div class="summary-item"><span class="summary-label">Email</span><span class="summary-value">${fmt(cd.email)}</span></div><div class="summary-item"><span class="summary-label">Phone</span><span class="summary-value">${fmt(cd.countryCode)} ${fmt(cd.phone)}</span></div>${cd.specialRequests ? `<div class="summary-item" style="grid-column:1/-1"><span class="summary-label">Requests</span><span class="summary-value">${cd.specialRequests}</span></div>` : ''}`;
    if (vc) {
      const base = parseInt(vc.price) || 15;
      const hrs = parseInt(td.hourlyDuration) || 1;
      const isHourly = td.serviceType === 'hourly';
      const est = isHourly ? base * hrs : base;
      const rt = state.transferType === 'roundtrip' ? est * 1.9 : est;
      $('#price-display').textContent = `BHD ${Math.round(rt)}+`;
    }
  }

  function formatDate(d) {
    if (!d) return '—';
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('en-BH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }

  async function submitBooking() {
    const btn = $('#submit-btn');
    btn.classList.add('loading');
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Submitting...`;
    const payload = { ...state.tripData, ...state.contactData, vehicleName: state.vehicle?.name, vehicleType: state.vehicle?.value, vehicleBasePrice: state.vehicle?.price };
    try {
      const res = await fetch('/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (data.success) { $('#booking-id-display').textContent = data.bookingId.slice(0, 8).toUpperCase(); goToStep(5); }
      else throw new Error(data.error || 'Unknown error');
    } catch (err) {
      showError('Submission failed. Please try again or call us directly.');
      btn.classList.remove('loading');
      btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Confirm Booking`;
    }
  }

  function setMinDates() {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    ['#departure-date', '#hourly-date'].forEach(sel => { const el = $(sel); if (el) el.min = tomorrow; });
    const ret = $('#return-date');
    const dep = $('#departure-date');
    if (dep && ret) { dep.addEventListener('change', () => { ret.min = dep.value || tomorrow; }); }
  }
  setMinDates();

  const menuBtn = $('[data-menu-toggle]');
  const nav = $('.header-nav');
  if (menuBtn && nav) {
    menuBtn.addEventListener('click', () => {
      const isOpen = nav.style.display === 'flex';
      nav.style.display = isOpen ? '' : 'flex';
      if (!isOpen) { nav.style.flexDirection='column'; nav.style.position='absolute'; nav.style.top='64px'; nav.style.left='0'; nav.style.right='0'; nav.style.background='var(--color-surface)'; nav.style.padding='var(--space-4) var(--space-6)'; nav.style.borderBottom='1px solid var(--color-divider)'; nav.style.zIndex='99'; }
    });
  }

  const toastStyle = document.createElement('style');
  toastStyle.textContent = `.form-error-toast{display:flex;align-items:center;gap:var(--space-3);padding:var(--space-3) var(--space-4);background:rgba(208,79,79,0.12);border:1px solid rgba(208,79,79,0.3);border-radius:var(--radius-md);font-size:var(--text-sm);color:#f07070;margin-bottom:var(--space-4);animation:slide-in 0.2s ease}@keyframes slide-in{from{transform:translateY(-8px);opacity:0}to{transform:translateY(0);opacity:1}}.spin{animation:rotate 1s linear infinite}@keyframes rotate{to{transform:rotate(360deg)}}`;
  document.head.appendChild(toastStyle);

})();
