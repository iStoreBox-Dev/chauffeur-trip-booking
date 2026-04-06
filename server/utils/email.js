const nodemailer = require('nodemailer');
const { formatBHD } = require('./helpers');

let transporter;

function getTransporter() {
  if (transporter) {
    return transporter;
  }

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  return transporter;
}

async function sendBookingConfirmation(booking) {
  const mailer = getTransporter();

  if (!mailer) {
    return;
  }

  await mailer.sendMail({
    from: process.env.EMAIL_FROM,
    to: booking.email,
    subject: `Booking Confirmed - ${booking.booking_ref}`,
    text: [
      `Dear ${booking.first_name} ${booking.last_name},`,
      '',
      'Thank you for booking with us.',
      `Reference: ${booking.booking_ref}`,
      `Service: ${booking.service_type}`,
      `Price: ${formatBHD(booking.final_price)}`,
      '',
      'Our team will contact you shortly.',
      '',
      'Best regards,'
    ].join('\n')
  });
}

module.exports = {
  sendBookingConfirmation
};
