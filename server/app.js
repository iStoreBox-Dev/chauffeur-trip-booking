require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const routes = require('./routes');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.use('/api', routes);

app.use('/css', express.static(path.join(__dirname, '../client/css')));
app.use('/js', express.static(path.join(__dirname, '../client/js')));
app.use('/admin', express.static(path.join(__dirname, '../client/admin')));
app.use('/public', express.static(path.join(__dirname, '../public')));

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '../client/booking.html'));
});

app.get('/booking', (_req, res) => {
  res.sendFile(path.join(__dirname, '../client/booking.html'));
});

app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, '../client/admin/index.html'));
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint not found.' });
});

app.use((error, _req, res, _next) => {
  console.error('Unhandled application error:', error.message);
  res.status(500).json({ error: 'Something went wrong. Please try again later.' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Chauffeur booking API listening on port ${PORT}`);
  });
}

module.exports = app;
