async function loadVehicles() {
  const select = document.getElementById('vehicle-select');
  select.innerHTML = '<option value="">Loading vehicles...</option>';

  try {
    const res = await fetch('/api/vehicles');
    const data = await res.json();
    const vehicles = data.vehicles || [];

    if (vehicles.length === 0) {
      select.innerHTML = '<option value="">No active vehicles</option>';
      return;
    }

    select.innerHTML = vehicles
      .map((v) => `<option value="${v.id}">${v.name} (${v.model}) - BHD ${Number(v.base_price).toFixed(3)}</option>`)
      .join('');
  } catch (_error) {
    select.innerHTML = '<option value="">Failed to load vehicles</option>';
  }
}

function bindGeoAutocomplete(inputId) {
  const input = document.getElementById(inputId);
  const list = document.getElementById('geo-results');
  let timer;

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();

    if (q.length < 2) {
      list.innerHTML = '';
      return;
    }

    timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geo/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        const results = data.results || [];

        list.innerHTML = results
          .map((item) => `<li>${item.display_name}</li>`)
          .join('');
      } catch (_error) {
        list.innerHTML = '<li>Location search unavailable.</li>';
      }
    }, 350);
  });
}

async function submitBooking(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const result = document.getElementById('result');
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());

  payload.passengers = Number(payload.passengers || 0);
  payload.luggage = Number(payload.luggage || 0);
  payload.hourly_duration = payload.hourly_duration ? Number(payload.hourly_duration) : null;

  try {
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok) {
      result.textContent = data.error || 'Could not submit booking.';
      return;
    }

    result.textContent = `Booking submitted successfully. Ref: ${data.booking.booking_ref}`;
    form.reset();
    loadVehicles();
  } catch (_error) {
    result.textContent = 'Network error. Please try again.';
  }
}

document.getElementById('booking-form').addEventListener('submit', submitBooking);
bindGeoAutocomplete('pickup');
bindGeoAutocomplete('dropoff');
loadVehicles();
