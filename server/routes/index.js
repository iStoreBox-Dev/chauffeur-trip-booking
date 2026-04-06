const express = require('express');
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');
const bookingController = require('../controllers/bookingController');
const { authenticate, requireRole } = require('../middleware/auth');
const { sanitizeBody, requireFields, validateBookingPayload } = require('../middleware/validate');

const router = express.Router();

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again shortly.' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please wait and try again.' }
});

const bookingCreateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Booking limit reached. Please try again later.' }
});

router.use(globalLimiter);
router.use(sanitizeBody);

router.post('/auth/login', authLimiter, requireFields(['email', 'password']), authController.login);
router.get('/auth/me', authenticate, authController.me);

router.get('/vehicles', bookingController.listVehicles);
router.post('/vehicles', authenticate, requireRole('admin'), bookingController.createVehicle);
router.put('/vehicles/:id', authenticate, requireRole('admin'), bookingController.updateVehicle);
router.delete('/vehicles/:id', authenticate, requireRole('admin'), bookingController.deleteVehicle);

router.post('/bookings', bookingCreateLimiter, validateBookingPayload, bookingController.createBooking);
router.get('/bookings', authenticate, bookingController.listBookings);
router.get('/bookings/stats', authenticate, bookingController.bookingStats);
router.get('/bookings/export/csv', authenticate, requireRole('operator'), bookingController.exportCsv);
router.get('/bookings/:id', authenticate, bookingController.getBooking);
router.get('/bookings/:id/logs', authenticate, bookingController.getBookingLogs);
router.patch('/bookings/:id/status', authenticate, bookingController.updateBookingStatus);
router.patch('/bookings/:id', authenticate, bookingController.updateBooking);
router.delete('/bookings/:id', authenticate, requireRole('admin'), bookingController.deleteBooking);

router.post('/promo/validate', bookingController.validatePromo);
router.get('/promo', authenticate, requireRole('admin'), bookingController.listPromos);
router.post('/promo', authenticate, requireRole('admin'), bookingController.createPromo);
router.patch('/promo/:id/toggle', authenticate, requireRole('admin'), bookingController.togglePromo);

router.get('/geo/search', bookingController.geoSearch);

router.get('/admin/users', authenticate, requireRole('admin'), authController.listUsers);
router.post('/admin/users', authenticate, requireRole('admin'), authController.createUser);
router.patch('/admin/users/:id/toggle', authenticate, requireRole('admin'), authController.toggleUser);

module.exports = router;
