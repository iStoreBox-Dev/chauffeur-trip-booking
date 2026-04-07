'use strict';

const nodemailer = require('nodemailer');
const { confirmationEmail, cancellationEmail, assignedEmail } = require('./emailTemplates');

let transporter;

function getTransporter() {
  if (transporter) return transporter;

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });

  return transporter;
}

function loadSettings() {
  try {
    const pool = require('../../config/db');
    return pool
      .query('SELECT value FROM app_settings WHERE key = $1 LIMIT 1', ['app'])
      .then((r) => r.rows[0]?.value || {})
      .catch(() => ({}));
  } catch {
    return Promise.resolve({});
  }
}

async function sendBookingConfirmation(booking) {
  const mailer = getTransporter();
  if (!mailer) return;

  const settings = await loadSettings();
  const { subject, html } = confirmationEmail(booking, settings);

  await mailer.sendMail({
    from: process.env.EMAIL_FROM || settings.support_email || 'noreply@luxeride.com',
    to: booking.email,
    subject,
    html
  });
}

async function sendBookingCancellation(booking) {
  const mailer = getTransporter();
  if (!mailer) return;

  const settings = await loadSettings();
  const { subject, html } = cancellationEmail(booking, settings);

  await mailer.sendMail({
    from: process.env.EMAIL_FROM || settings.support_email || 'noreply@luxeride.com',
    to: booking.email,
    subject,
    html
  });
}

async function sendBookingAssigned(booking) {
  const mailer = getTransporter();
  if (!mailer) return;

  const settings = await loadSettings();
  const { subject, html } = assignedEmail(booking, settings);

  await mailer.sendMail({
    from: process.env.EMAIL_FROM || settings.support_email || 'noreply@luxeride.com',
    to: booking.email,
    subject,
    html
  });
}

module.exports = { sendBookingConfirmation, sendBookingCancellation, sendBookingAssigned };
