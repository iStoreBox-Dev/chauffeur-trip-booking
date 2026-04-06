const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// In-memory bookings store
const bookings = [];

// POST /api/bookings — create a new booking
app.post('/api/bookings', (req, res) => {
  try {
    const booking = {
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      status: 'pending',
      ...req.body
    };
    bookings.push(booking);
    console.log('[NEW BOOKING]', booking.id, booking.firstName, booking.lastName, booking.serviceType);
    res.json({ success: true, bookingId: booking.id, booking });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/bookings — list all bookings (admin)
app.get('/api/bookings', (req, res) => {
  res.json({ bookings });
});

// GET /api/bookings/:id
app.get('/api/bookings/:id', (req, res) => {
  const booking = bookings.find(b => b.id === req.params.id);
  if (!booking) return res.status(404).json({ error: 'Not found' });
  res.json(booking);
});

// PATCH /api/bookings/:id/status
app.patch('/api/bookings/:id/status', (req, res) => {
  const booking = bookings.find(b => b.id === req.params.id);
  if (!booking) return res.status(404).json({ error: 'Not found' });
  booking.status = req.body.status;
  res.json({ success: true, booking });
});

// All other routes → SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚗 Trip Booking server running on port ${PORT}`);
});
