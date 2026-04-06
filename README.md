# Chauffeur Trip Booking

Production-ready chauffeur booking app with:
- Node.js + Express backend
- PostgreSQL (raw SQL via pg)
- JWT auth + role-based admin
- Luxury 4-step SPA booking flow
- Full admin control center (bookings, vehicles, promos, users)
- Heroku deployment support

## Local Development

### 1) Install dependencies
```bash
npm install
```

### 2) Configure env
A local `.env` is created for testing. Update values as needed:
- `DATABASE_URL`
- `JWT_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

### 3) Create local database
```bash
createdb chauffeur
```

### 4) Run schema and seed
```bash
npm run migrate
npm run seed
```

### 5) Start app
```bash
npm start
```

- Booking UI: `http://localhost:3000/`
- Admin UI: `http://localhost:3000/admin`

## Heroku Full Setup

### 1) Login and create app
```bash
heroku login
heroku create your-app-name
```

### 2) Create Heroku PostgreSQL database
```bash
heroku addons:create heroku-postgresql:mini --app your-app-name
```

This automatically sets `DATABASE_URL` in your app config vars.

### 3) Set required config vars
```bash
heroku config:set \
JWT_SECRET="replace_with_secure_secret" \
JWT_EXPIRES_IN="8h" \
ADMIN_EMAIL="admin@example.com" \
ADMIN_PASSWORD="change_this_now" \
SMTP_HOST="" \
SMTP_PORT="587" \
SMTP_USER="" \
SMTP_PASS="" \
EMAIL_FROM="booking@example.com" \
WHATSAPP_WEBHOOK_URL="" \
CORS_ORIGIN="*" \
NODE_ENV="production" \
--app your-app-name
```

### 4) Deploy
```bash
git add .
git commit -m "Deploy production app"
git push heroku main
```

### 5) Run migration and seed on Heroku
```bash
heroku run npm run migrate --app your-app-name
heroku run npm run seed --app your-app-name
```

### 6) Open app
```bash
heroku open --app your-app-name
```

## Notes
- Prices are handled in BHD with 3 decimals.
- Public vehicle endpoint only returns active vehicles.
- Admin can manage inactive/active vehicles from the control center.
