require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const routes = require('./routes');
const { attachLocale } = require('./middleware/locale');

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
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://nominatim.openstreetmap.org'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

const allowedOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(o => o.trim()) : ['*'];
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Lang', 'X-Forwarded-For']
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(attachLocale);

app.use('/api', routes);

app.use('/css', express.static(path.join(__dirname, '../client/css')));
app.use('/js', express.static(path.join(__dirname, '../client/js')));
app.use('/assets', express.static(path.join(__dirname, '../client/assets')));
app.use('/admin', express.static(path.join(__dirname, '../client/admin')));

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

app.use((error, req, res, _next) => {
  console.error('Unhandled application error:', {
    message: error.message,
    status: error.status || 500,
    method: req.method,
    path: req.path,
    url: req.originalUrl,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
  });
  res.status(error.status || 500).json({
    error: 'Something went wrong. Please try again later.',
    status: error.status || 500,
    message: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Chauffeur booking API listening on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Use Mock DB: ${process.env.USE_MOCK_DB === 'true' ? 'YES' : 'NO'}`);
    console.log(`CORS Origins: ${allowedOrigins.join(', ')}`);
    console.log(`${'='.repeat(60)}\n`);
  });
}

module.exports = app;
