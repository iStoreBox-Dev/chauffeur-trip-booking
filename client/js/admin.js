let token = '';

function authHeaders() {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

async function login(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const payload = Object.fromEntries(formData.entries());
  const result = document.getElementById('login-result');

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok) {
      result.textContent = data.error || 'Login failed.';
      return;
    }

    token = data.token;
    result.textContent = 'Login successful.';
    document.getElementById('dashboard').hidden = false;
    await Promise.all([loadStats(), loadBookings()]);
  } catch (_error) {
    result.textContent = 'Network error.';
  }
}

async function loadStats() {
  const box = document.getElementById('stats-box');

  try {
    const res = await fetch('/api/bookings/stats', { headers: authHeaders() });
    const data = await res.json();

    if (!res.ok) {
      box.textContent = data.error || 'Failed to load stats.';
      return;
    }

    box.textContent = JSON.stringify(data.stats, null, 2);
  } catch (_error) {
    box.textContent = 'Failed to load stats.';
  }
}

async function loadBookings() {
  const body = document.getElementById('bookings-body');

  try {
    const res = await fetch('/api/bookings?page=1&limit=20', { headers: authHeaders() });
    const data = await res.json();

    if (!res.ok) {
      body.innerHTML = `<tr><td colspan="5">${data.error || 'Failed to load bookings.'}</td></tr>`;
      return;
    }

    const rows = (data.bookings || []).map((b) => `
      <tr>
        <td>${b.booking_ref}</td>
        <td>${b.first_name} ${b.last_name}</td>
        <td>${b.service_type}</td>
        <td>BHD ${Number(b.final_price).toFixed(3)}</td>
        <td>${b.status}</td>
      </tr>
    `).join('');

    body.innerHTML = rows || '<tr><td colspan="5">No bookings found.</td></tr>';
  } catch (_error) {
    body.innerHTML = '<tr><td colspan="5">Failed to load bookings.</td></tr>';
  }
}

document.getElementById('login-form').addEventListener('submit', login);
document.getElementById('load-bookings').addEventListener('click', loadBookings);
document.getElementById('load-stats').addEventListener('click', loadStats);
