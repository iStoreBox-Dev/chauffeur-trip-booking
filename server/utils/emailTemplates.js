'use strict';

const { formatBHD } = require('./helpers');

function baseLayout(title, bodyHtml, supportEmail = 'booking@luxeride.com', supportPhone = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; background: #0d1622; font-family: 'Outfit', Arial, sans-serif; color: #e8e1d5; }
    .wrap { max-width: 600px; margin: 32px auto; background: #162032; border-radius: 12px; overflow: hidden; }
    .header { background: #1a2840; padding: 32px 40px; text-align: center; border-bottom: 1px solid #2a3a50; }
    .header h1 { margin: 0; font-size: 28px; letter-spacing: 4px; color: #ffd27d; }
    .header h1 span { color: #e8e1d5; }
    .body { padding: 36px 40px; }
    .body h2 { margin: 0 0 8px; font-size: 20px; color: #ffd27d; }
    .body p { margin: 0 0 16px; line-height: 1.6; color: #c9c0b5; }
    .ref-box { background: #0d1622; border: 1px solid #ffd27d44; border-radius: 8px; padding: 16px 20px; margin: 24px 0; text-align: center; }
    .ref-box .label { font-size: 12px; letter-spacing: 2px; text-transform: uppercase; color: #7a8ea0; }
    .ref-box .ref { font-size: 24px; font-weight: 700; color: #ffd27d; letter-spacing: 3px; margin-top: 4px; }
    .details-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    .details-table td { padding: 10px 4px; border-bottom: 1px solid #1e2e42; font-size: 14px; }
    .details-table td:first-child { color: #7a8ea0; width: 40%; }
    .details-table td:last-child { color: #e8e1d5; font-weight: 500; }
    .price-row td { border-bottom: none !important; padding-top: 16px !important; }
    .price-row td:last-child { color: #ffd27d !important; font-size: 18px !important; font-weight: 700 !important; }
    .status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; }
    .status-confirmed { background: #1a3a28; color: #4ade80; }
    .status-cancelled { background: #3a1a1a; color: #f87171; }
    .footer { background: #0d1622; padding: 24px 40px; text-align: center; border-top: 1px solid #1e2e42; }
    .footer p { margin: 4px 0; font-size: 12px; color: #4a5a6a; }
    .footer a { color: #ffd27d; text-decoration: none; }
    @media print { body { background: #fff; color: #111; } .wrap { margin: 0; border-radius: 0; } .header { background: #f5f0e8; } .header h1 { color: #b8860b; } .body h2 { color: #b8860b; } .ref-box { background: #fafafa; } .ref-box .ref { color: #b8860b; } .footer { background: #f5f5f5; } }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <h1>LUXE<span>RIDE</span></h1>
      <p style="margin:8px 0 0;font-size:12px;letter-spacing:2px;color:#7a8ea0;text-transform:uppercase;">Premium Chauffeur Services</p>
    </div>
    <div class="body">
      ${bodyHtml}
    </div>
    <div class="footer">
      <p>Questions? <a href="mailto:${supportEmail}">${supportEmail}</a>${supportPhone ? ` &nbsp;|&nbsp; <a href="tel:${supportPhone}">${supportPhone}</a>` : ''}</p>
      <p style="margin-top:8px;">© ${new Date().getFullYear()} LUXERIDE. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;
}

function confirmationEmail(booking, settings = {}) {
  const supportEmail = settings.support_email || 'booking@luxeride.com';
  const supportPhone = settings.support_phone || '';
  const appName = settings.app_name || 'LUXERIDE';

  const snap = booking.vehicle_snapshot || {};
  const vehicleName = snap.name || booking.vehicle_name || 'N/A';
  const vehicleModel = snap.model || '';

  const isHourly = booking.service_type === 'hourly';
  const tripLine = isHourly
    ? `${booking.pickup_location || '—'} (${booking.hourly_duration || '?'}h hourly)`
    : `${booking.pickup_location || '—'} → ${booking.dropoff_location || '—'}`;

  const dateStr = booking.departure_date
    ? `${booking.departure_date}${booking.departure_time ? ' at ' + booking.departure_time : ''}`
    : '—';

  const discountRow = Number(booking.discount_amount) > 0
    ? `<tr><td>Discount</td><td style="color:#4ade80;">- ${formatBHD(booking.discount_amount)}</td></tr>`
    : '';

  const addOnsRow = Number(booking.add_ons_price) > 0
    ? `<tr><td>Add-ons</td><td>${formatBHD(booking.add_ons_price)}</td></tr>`
    : '';

  const bodyHtml = `
    <h2>Booking Confirmed ✓</h2>
    <p>Dear <strong>${booking.first_name} ${booking.last_name}</strong>, your booking has been received and is being processed. We will confirm your chauffeur details shortly.</p>
    <div class="ref-box">
      <div class="label">Booking Reference</div>
      <div class="ref">${booking.booking_ref}</div>
    </div>
    <table class="details-table">
      <tr><td>Service</td><td>${isHourly ? 'Hourly Rental' : 'Point to Point Transfer'}</td></tr>
      <tr><td>Trip</td><td>${tripLine}</td></tr>
      <tr><td>Date &amp; Time</td><td>${dateStr}</td></tr>
      <tr><td>Passengers</td><td>${booking.passengers || 1}</td></tr>
      ${booking.flight_number ? `<tr><td>Flight Number</td><td>${booking.flight_number}</td></tr>` : ''}
      <tr><td>Vehicle</td><td>${vehicleName}${vehicleModel ? ' — ' + vehicleModel : ''}</td></tr>
      ${booking.chauffeur_name ? `<tr><td>Chauffeur</td><td>${booking.chauffeur_name}</td></tr>` : ''}
      <tr><td>Status</td><td><span class="status-badge status-confirmed">Pending Confirmation</span></td></tr>
      <tr><td>Base Price</td><td>${formatBHD(booking.base_price)}</td></tr>
      ${addOnsRow}
      ${discountRow}
      <tr class="price-row"><td>Total</td><td>${formatBHD(booking.final_price)}</td></tr>
    </table>
    ${booking.special_requests ? `<p><strong>Special Requests:</strong> ${booking.special_requests}</p>` : ''}
    <p style="margin-top:24px;">Our operations team will contact you on <strong>${booking.country_code || ''} ${booking.phone || ''}</strong> to confirm all details. For immediate assistance, please contact us at <a href="mailto:${supportEmail}" style="color:#ffd27d;">${supportEmail}</a>.</p>
  `;

  return {
    subject: `Booking Confirmed — ${booking.booking_ref} | ${appName}`,
    html: baseLayout(`Booking Confirmed — ${booking.booking_ref}`, bodyHtml, supportEmail, supportPhone)
  };
}

function cancellationEmail(booking, settings = {}) {
  const supportEmail = settings.support_email || 'booking@luxeride.com';
  const supportPhone = settings.support_phone || '';
  const appName = settings.app_name || 'LUXERIDE';

  const dateStr = booking.departure_date
    ? `${booking.departure_date}${booking.departure_time ? ' at ' + booking.departure_time : ''}`
    : '—';

  const bodyHtml = `
    <h2>Booking Cancelled</h2>
    <p>Dear <strong>${booking.first_name} ${booking.last_name}</strong>, your booking has been cancelled as requested.</p>
    <div class="ref-box">
      <div class="label">Cancelled Booking Reference</div>
      <div class="ref">${booking.booking_ref}</div>
    </div>
    <table class="details-table">
      <tr><td>Service</td><td>${booking.service_type === 'hourly' ? 'Hourly Rental' : 'Point to Point Transfer'}</td></tr>
      <tr><td>Pickup</td><td>${booking.pickup_location || '—'}</td></tr>
      <tr><td>Date &amp; Time</td><td>${dateStr}</td></tr>
      <tr><td>Status</td><td><span class="status-badge status-cancelled">Cancelled</span></td></tr>
      <tr class="price-row"><td>Amount</td><td>${formatBHD(booking.final_price)}</td></tr>
    </table>
    <p>If this cancellation was made in error or you have questions about refunds, please contact us immediately at <a href="mailto:${supportEmail}" style="color:#ffd27d;">${supportEmail}</a>${supportPhone ? ` or call <a href="tel:${supportPhone}" style="color:#ffd27d;">${supportPhone}</a>` : ''}.</p>
    <p>We hope to serve you again soon.</p>
  `;

  return {
    subject: `Booking Cancellation — ${booking.booking_ref} | ${appName}`,
    html: baseLayout(`Booking Cancellation — ${booking.booking_ref}`, bodyHtml, supportEmail, supportPhone)
  };
}

function assignedEmail(booking, settings = {}) {
  const supportEmail = settings.support_email || 'booking@luxeride.com';
  const supportPhone = settings.support_phone || '';
  const appName = settings.app_name || 'LUXERIDE';

  const vehicleName = booking.assigned_vehicle_name
    || booking.vehicle_snapshot?.name
    || booking.vehicle_name
    || 'N/A';
  const chauffeurName = booking.assigned_chauffeur_name || booking.chauffeur_name || 'Assigned Chauffeur';

  const bodyHtml = `
    <h2>Your Chauffeur Is Assigned</h2>
    <p>Dear <strong>${booking.first_name} ${booking.last_name}</strong>, your trip is now assigned and preparing for dispatch.</p>
    <div class="ref-box">
      <div class="label">Booking Reference</div>
      <div class="ref">${booking.booking_ref}</div>
    </div>
    <table class="details-table">
      <tr><td>Service</td><td>${booking.service_type === 'hourly' ? 'Hourly Rental' : 'Point to Point Transfer'}</td></tr>
      <tr><td>Pickup</td><td>${booking.pickup_location || '—'}</td></tr>
      <tr><td>Dropoff</td><td>${booking.dropoff_location || '—'}</td></tr>
      <tr><td>Date &amp; Time</td><td>${booking.departure_date || '—'} ${booking.departure_time || ''}</td></tr>
      <tr><td>Vehicle</td><td>${vehicleName}</td></tr>
      <tr><td>Chauffeur</td><td>${chauffeurName}</td></tr>
      <tr><td>Status</td><td><span class="status-badge status-confirmed">Chauffeur Assigned</span></td></tr>
      <tr class="price-row"><td>Total</td><td>${formatBHD(booking.final_price)}</td></tr>
    </table>
    <p>If you need to adjust your booking, contact support at <a href="mailto:${supportEmail}" style="color:#ffd27d;">${supportEmail}</a>${supportPhone ? ` or <a href="tel:${supportPhone}" style="color:#ffd27d;">${supportPhone}</a>` : ''}.</p>
  `;

  return {
    subject: `Chauffeur Assigned — ${booking.booking_ref} | ${appName}`,
    html: baseLayout(`Chauffeur Assigned — ${booking.booking_ref}`, bodyHtml, supportEmail, supportPhone)
  };
}

module.exports = { confirmationEmail, cancellationEmail, assignedEmail };
