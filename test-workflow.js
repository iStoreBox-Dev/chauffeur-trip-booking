require('dotenv').config();

const BASE_URL = process.env.TEST_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

async function api(path, options = {}) {
  const res = await fetch(BASE_URL + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function fail(message, payload) {
  console.error('FAIL:', message);
  if (payload) console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
}

async function run() {
  const loginPayload = {
    email: process.env.ADMIN_EMAIL || 'admin@example.com',
    password: process.env.ADMIN_PASSWORD || 'AdminPass123!'
  };

  const login = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(loginPayload)
  });
  if (!login.ok || !login.data.token) fail('Admin login failed', login);

  const token = login.data.token;

  const vehicles = await api('/api/vehicles');
  if (!vehicles.ok || !Array.isArray(vehicles.data.vehicles) || !vehicles.data.vehicles.length) {
    fail('No vehicles available for test', vehicles);
  }
  const vehicle = vehicles.data.vehicles[0];

  const chauffeurs = await api('/api/chauffeurs', {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!chauffeurs.ok || !Array.isArray(chauffeurs.data.chauffeurs) || !chauffeurs.data.chauffeurs.length) {
    fail('No chauffeurs available for test', chauffeurs);
  }

  // Prefer an active, assignable chauffeur; if none exist, set the first chauffeur to `available`
  let chauffeur = chauffeurs.data.chauffeurs.find((c) => c.is_active && ['available', 'off_duty'].includes(c.status))
    || chauffeurs.data.chauffeurs[0];

  if (chauffeur && !(chauffeur.is_active && ['available', 'off_duty'].includes(chauffeur.status))) {
    const makeAvailable = await api(`/api/chauffeurs/${chauffeur.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: 'available', is_active: true })
    });
    if (!makeAvailable.ok) fail('Unable to set chauffeur to available for test', makeAvailable);
    // refresh chauffeur object
    const refreshed = await api('/api/chauffeurs', { headers: { Authorization: `Bearer ${token}` } });
    if (!refreshed.ok) fail('Unable to refresh chauffeurs after update', refreshed);
    chauffeur = refreshed.data.chauffeurs.find((c) => c.id === chauffeur.id) || refreshed.data.chauffeurs[0];
  }

  const uid = Date.now();
  const bookingPayload = {
    service_type: 'trip',
    transfer_type: 'oneway',
    pickup_location: 'Bahrain International Airport',
    dropoff_location: 'Seef District, Manama',
    departure_date: '2026-12-20',
    departure_time: '18:00',
    passengers: 2,
    luggage: 1,
    vehicle_id: vehicle.id,
    first_name: 'Integration',
    last_name: 'Flow',
    email: `flow.${uid}@example.com`,
    country_code: '+973',
    phone: '33110000',
    special_requests: 'integration workflow test'
  };

  const created = await api('/api/bookings', {
    method: 'POST',
    body: JSON.stringify(bookingPayload)
  });
  if (!created.ok || !created.data.booking?.id) fail('Booking creation failed', created);

  const booking = created.data.booking;
  console.log('Created booking:', JSON.stringify({ id: booking.id, booking_ref: booking.booking_ref, email: booking.email }, null, 2));

  const assign = await api(`/api/bookings/${booking.id}/assign`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ chauffeur_id: chauffeur.id, vehicle_id: vehicle.id })
  });
  if (!assign.ok) fail('Assignment failed', assign);

  const lookup = await api(`/api/bookings/lookup?ref=${encodeURIComponent(booking.booking_ref)}&email=${encodeURIComponent(booking.email)}`);
  if (!lookup.ok || !lookup.data.booking) fail('Booking lookup failed', lookup);

  const cancelAssigned = await api(`/api/bookings/${booking.id}/cancel`, {
    method: 'DELETE',
    body: JSON.stringify({ email: booking.email })
  });
  if (cancelAssigned.ok) fail('Assigned booking should not be cancellable', cancelAssigned);

  const createdCancelable = await api('/api/bookings', {
    method: 'POST',
    body: JSON.stringify({
      ...bookingPayload,
      email: `cancel.${uid}@example.com`,
      phone: '33220000'
    })
  });
  if (!createdCancelable.ok || !createdCancelable.data.booking?.id) fail('Second booking creation failed', createdCancelable);

  const cancelEligible = await api(`/api/bookings/${createdCancelable.data.booking.id}/cancel`, {
    method: 'DELETE',
    body: JSON.stringify({ email: createdCancelable.data.booking.email })
  });
  if (!cancelEligible.ok || cancelEligible.data.booking?.status !== 'cancelled') fail('Pending booking cancellation failed', cancelEligible);

  console.log('PASS: workflow integration smoke test complete');
  console.log(JSON.stringify({
    booking_ref: booking.booking_ref,
    assigned_status: assign.data.booking?.status,
    lookup_status: lookup.data.booking?.status,
    cancel_assigned_status: cancelAssigned.status,
    cancel_pending_status: cancelEligible.status
  }, null, 2));
}

run().catch((error) => {
  fail(error.message);
});
