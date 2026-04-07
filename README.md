# Chauffeur Trip Booking

> **NOW WITH MODERN 2026 DESIGN** 🎨 Glassmorphism, smooth animations, gradient accents, and responsive luxury aesthetic.

Production-ready chauffeur booking app with:
- **Modern 2026 UI/UX** — Glassmorphic cards, smooth animations, gradient accents
- Node.js + Express backend
- PostgreSQL (raw SQL via pg)
- **Session Persistence** — Stay logged in across refreshes
- JWT auth + role-based admin
- Luxury 4-step SPA booking flow with modern card design
- Live quote endpoint with add-ons and promo-aware pricing
- English + Arabic locale-ready API responses and frontend toggles
- Chauffeur entity and assignment-ready booking model
- Full admin control center (bookings, vehicles, promos, users)
- Heroku deployment support

## 🎨 Design System 2026

The app now features a complete modern redesign with:

| Feature | Light Mode | Dark Mode |
|---------|-----------|----------|
| **Primary Accent** | Indigo (#6366f1) | Indigo (#818cf8) |
| **Secondary Accent** | Violet (#8b5cf6) | Violet (#a78bfa) |
| **Tertiary Accent** | Pink (#ec4899) | Pink (#f472b6) |
| **Typography** | Outfit font family, modern weights | Same as light |
| **Effects** | Glassmorphism, 12px blur | Deep glassmorphism, 20px blur |
| **Animations** | Smooth 0.3s transitions | Same curves |
| **Shadows** | Subtle (0.05 opacity) | Deep (0.3-0.7 opacity) |

### Design Features
- ✨ **Glassmorphic Cards** — Semi-transparent surfaces with backdrop blur
- 🎯 **Smooth Animations** — Cubic-bezier transitions on all interactions
- 🌈 **Gradient Accents** — Multi-color gradients for depth and visual interest
- 📱 **Fully Responsive** — Mobile-first design at all breakpoints
- ♿ **Accessible** — WCAG contrast ratios, keyboard navigation
- 🌙 **Dark Mode Ready** — Automatic theme detection with manual toggle

## Local Development

### Option A: Quick Start with Modern UI (No Database)

Perfect for testing promo codes, quotes, and the new modern design without PostgreSQL.

```bash
npm install
npm start
```

Visit `http://localhost:3000/` and try promo code **WELCOME10** (10% off, min BHD 20).

**Available mock promo codes:**
- `WELCOME10` — 10% discount (min BHD 20)
- `VIP5` — BHD 5 fixed discount (min BHD 30)
- `NIGHT15` — 15% discount (min BHD 40)

**Note:** Mock mode is enabled by default (`USE_MOCK_DB=true` in `.env`). Bookings are not persisted. To use real database, proceed to Option B.

### Option B: Full Setup with PostgreSQL

### 1) Install dependencies
```bash
npm install
```

### 2) Configure env
Update `.env` for PostgreSQL setup:
- Set `USE_MOCK_DB=false` to disable mock mode
- `DATABASE_URL=postgres://user:password@localhost:5432/chauffeur`
- `JWT_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

Optional:
- `OPERATOR_EMAIL`, `OPERATOR_PASSWORD`
- `CORS_ORIGIN`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`
- `WHATSAPP_WEBHOOK_URL`

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

## 🔐 Session Persistence (Fixed)

Your session now persists across page refreshes:
- Token automatically stored in `localStorage`
- On page load, automatically restores session without re-login
- Invalid/expired tokens are automatically cleared
- All admin actions maintain authentication state

## Modern UI/UX Features

### Booking Page
- Glassmorphic card design with subtle shadows
- Smooth step transitions with animated progress indicators
- Real-time quote calculation with smooth updates
- Modern input fields with focus animations
- Responsive vehicle recommendation cards
- Promo code application with instant visual feedback

### Admin Panel
- Modern sidebar with gradient active states
- Sleek login card with backdrop blur effects
- Data tables with modern styling
- KPI cards with gradient backgrounds
- Smooth tab transitions and animations
- Dark mode by default (toggle available)

## Mock Mode Reference

Mock mode provides in-memory promo codes and vehicles for rapid development without PostgreSQL setup.

### When to use Mock Mode
- **Testing booking flow** without database setup
- **Validating promo codes** (WELCOME10, VIP5, NIGHT15)
- **Development sprints** before switching to PostgreSQL
- **CI/CD pipelines** that don't need persistence

### How to Enable/Disable
```bash
# Enable mock mode (default for development)
echo "USE_MOCK_DB=true" >> .env

# Disable mock mode (use real PostgreSQL)
echo "USE_MOCK_DB=false" >> .env
```

### Mock Promo Codes
All codes are case-insensitive and work with quotes endpoint:

| Code | Type | Amount | Min | Max Uses |
|------|------|--------|-----|----------|
| WELCOME10 | 10% off | 10% | BHD 20 | 500 |
| VIP5 | Fixed | BHD 5 | BHD 30 | 1000 |
| NIGHT15 | 15% off | 15% | BHD 40 | 100 |

### Mock Vehicles
Pre-loaded for testing recommendations:

| Name | Capacity | Price | Hourly |
|------|----------|-------|--------|
| Standard Sedan | 4 | BHD 50 | BHD 65 |
| Premium SUV | 5 | BHD 75 | BHD 95 |
| Luxury Sedan | 4 | BHD 100 | BHD 125 |
| Van | 6 | BHD 85 | BHD 110 |

### Testing Promo Validation
```bash
curl -X POST http://localhost:3000/api/bookings/quote \
  -H "Content-Type: application/json" \
  -d '{
    "service_type": "trip",
    "vehicle_id": 1,
    "passengers": 2,
    "luggage": 1,
    "distance_km": 15,
    "promo_code": "WELCOME10"
  }'
```

Expected response includes `quote` object with discount applied.

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
- Booking quote endpoint: `POST /api/bookings/quote` (supports add-ons, promo code, locale, recommendations).
- New booking fields include add-ons, language code, chauffeur assignment, and payment metadata.
- Locale can be selected via query (`?lang=en|ar`) or header (`X-Lang`).

## New API Highlights
- `POST /api/bookings/quote` — compute base/add-ons/discount/final price plus top vehicle recommendations.
- `PATCH /api/bookings/:id/assign` — assign/unassign chauffeur to an existing booking (operator+).
- `GET /api/chauffeurs` — list chauffeurs (operator+).
- `POST /api/chauffeurs` — create chauffeur (admin).
- `PATCH /api/chauffeurs/:id/toggle` — toggle chauffeur active status (admin).

## Dispatch + Follow-up MVP Flow
- `booking -> assignment -> customer lookup -> optional cancellation` is now supported end-to-end.
- Admin booking details include grouped dispatch tools: assignment, internal notes, timeline, status transitions, and print invoice.
- Customer page includes a new `Track My Booking` section with status timeline and cancellation action for eligible bookings.

### Additional Endpoints
- `DELETE /api/bookings/:id/cancel` — customer cancellation by booking id + email (only pending/confirmed and at least 2 hours before pickup).
- `GET /api/settings/public` — minimal public contact payload: app name, support phone/email, WhatsApp number.
- `GET /api/admin/stats` — admin stats alias.
