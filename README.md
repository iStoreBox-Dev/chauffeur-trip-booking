# 🚗 Chauffeur Trip Booking

A premium white-label chauffeur trip booking form — Node.js + Express + Vanilla JS, Heroku-ready.

## Features
- 4-step booking flow: Trip Details → Vehicle → Contact → Confirm
- Service types: Transfer (one way / round trip) + Hourly charter
- 4 vehicle categories with capacity validation
- Admin dashboard at `/admin.html`
- REST API: `POST/GET/PATCH /api/bookings`
- Fully responsive, mobile-first dark/gold design

## Run Locally
```bash
npm install
npm start
# → http://localhost:3000
```

## Deploy to Heroku
```bash
git init
git add .
git commit -m "initial commit"
heroku create your-app-name
git push heroku main
heroku open
```

## API
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/bookings` | Create booking |
| `GET` | `/api/bookings` | List all bookings |
| `GET` | `/api/bookings/:id` | Get single booking |
| `PATCH`| `/api/bookings/:id/status` | Update status |

## Env Vars (optional)
```
GOOGLE_MAPS_KEY=  ← enables Places autocomplete
ADMIN_EMAIL=      ← admin notification email
SMTP_HOST=
SMTP_USER=
SMTP_PASS=
```

## Customize
- **Branding**: Edit `logo-text` in HTML files
- **Vehicles**: Edit `vehicle-card` blocks in `index.html`
- **Colors**: Change `--color-primary` in `style.css`
- **Locations**: Update `<datalist>` in `index.html`
