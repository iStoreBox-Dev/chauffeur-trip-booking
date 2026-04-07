# Heroku Deployment & Database Reset Guide

## Understanding the Booking Error

### Root Cause
The booking error **"We could not submit your booking right now. Please try again."** occurs when:
1. `USE_MOCK_DB=true` in `.env` (uses in-memory mock database, not production-ready)
2. PostgreSQL database tables don't exist
3. Database connection URL is missing or incorrect
4. Required initial data (vehicles, promo codes) isn't seeded

### The Fix
Updated configurations:
- `.env` now has `USE_MOCK_DB=false` for production use
- Improved error logging in booking controller for debugging
- Database migration will create all necessary tables
- Seed script will populate initial vehicles, promo codes, and admin user

---

## ✅ Step 1: Fresh Deploy to Heroku

If deploying a new app to Heroku for the first time:

```bash
# 1. Create a new Heroku app (replace with your app name)
heroku create your-chauffeur-app

# 2. Add PostgreSQL addon
heroku addons:create heroku-postgresql:hobby-dev --app your-chauffeur-app

# 3. Set environment variables
heroku config:set JWT_SECRET=your_strong_secret_key --app your-chauffeur-app
heroku config:set USE_MOCK_DB=false --app your-chauffeur-app
heroku config:set NODE_ENV=production --app your-chauffeur-app
heroku config:set ADMIN_PASSWORD=YourSecureAdminPass123 --app your-chauffeur-app

# 4. Deploy code
git push heroku main

# 5. Run database migration
heroku run npm run migrate --app your-chauffeur-app

# 6. Seed initial data
heroku run npm run seed --app your-chauffeur-app

# 7. Check logs
heroku logs --tail --app your-chauffeur-app
```

---

## 🔄 Step 2: Reset Existing Heroku Database

If your Heroku app already exists and you need to refresh/reset the data:

### Option A: Full Database Reset (⚠️ Deletes all data)

```bash
# 1. Get your app name
heroku apps

# 2. List PostgreSQL database info
heroku pg:info --app your-chauffeur-app

# 3. RESET DATABASE (removes all tables and data)
heroku pg:reset DATABASE_URL --confirm your-chauffeur-app

# 4. Re-run migrations
heroku run npm run migrate --app your-chauffeur-app

# 5. Re-seed initial data
heroku run npm run seed --app your-chauffeur-app

# 6. View logs to confirm success
heroku logs --tail --app your-chauffeur-app
```

### Option B: Soft Reset (Keep bookings, refresh master data)

```bash
# 1. Connect to database and backup bookings
heroku pg:psql -a your-chauffeur-app

# 2. In the psql prompt, run:
DELETE FROM vehicles;
DELETE FROM promo_codes;
DELETE FROM chauffeurs;
DELETE FROM routes;
DELETE FROM users WHERE role = 'operator';  -- Keep admin
\q

# 3. Exit psql and re-seed
heroku run npm run seed --app your-chauffeur-app --app your-chauffeur-app
```

---

## 📋 Step 3: Verify Deployment

After running migrations and seed:

```bash
# View all logs (last 100 lines)
heroku logs -n 100 --app your-chauffeur-app

# Monitor real-time logs
heroku logs --tail --app your-chauffeur-app

# Test booking endpoint
curl -X GET https://your-chauffeur-app.herokuapp.com/api/bookings/list

# Test admin login
curl -X POST https://your-chauffeur-app.herokuapp.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"YourAdminPassword"}'
```

---

## 🐛 Troubleshooting

### Booking Still Failing?

Check detailed logs:
```bash
heroku logs -n 200 --app your-chauffeur-app | grep -i "booking\|error\|fail"
```

Look for:
- Database connection errors
- Missing tables
- Validation errors on booking payload
- Missing vehicles or promo codes

### Database Connection Issues

Verify DATABASE_URL is set:
```bash
heroku config --app your-chauffeur-app | grep DATABASE_URL
```

It should show something like:
```
DATABASE_URL: postgres://user:password@ec2-xx-xxx-xxx-x.compute-1.amazonaws.com:5432/dbxxxxxxxxx
```

### Vehicles Not Loading?

Confirm seed ran successfully:
```bash
heroku run "node -e \"const pool = require('./config/db'); pool.query('SELECT * FROM vehicles').then(r => console.log(r.rows)).catch(e => console.error(e.message))\"" --app your-chauffeur-app
```

---

## 🔑 Default Credentials After Seed

After running `npm run seed`:

```
Admin Email: admin@example.com
Admin Password: AdminPass123!
```

⚠️ **IMPORTANT**: Change these credentials immediately in production!

```bash
heroku run "node config/seed.js" --app your-chauffeur-app
# Then login and update password in admin panel
```

---

## 📦 Environment Variables Reference

Required for Heroku:

```bash
DATABASE_URL             # Auto-set by Heroku PostgreSQL addon
NODE_ENV                 # Set to "production"
USE_MOCK_DB              # Set to "false"
PORT                     # Auto-set by Heroku (usually 5000)
JWT_SECRET               # Your JWT signing key (random strong string)
JWT_EXPIRES_IN           # Token expiration (default: "8h")
ADMIN_EMAIL              # Admin account email
ADMIN_PASSWORD           # Admin account password (change after deploy!)
CORS_ORIGIN              # CORS allowed origins (e.g., "https://your-app.com")
SMTP_HOST                # Optional: Email service SMTP host
SMTP_USER                # Optional: Email service username
SMTP_PASS                # Optional: Email service password
```

---

## 📊 Database Schema

Tables automatically created by migration:

- **users** - Admin/operator accounts
- **vehicles** - Chauffeur vehicle options
- **bookings** - Customer booking records
- **promo_codes** - Discount code management
- **routes** - Pre-configured routes with pricing
- **chauffeurs** - Driver profiles
- **booking_logs** - Booking history/audit trail

---

## 🧪 Testing the Fix Locally

Before deploying, test locally:

```bash
# 1. Update .env to use real PostgreSQL
# USE_MOCK_DB=false
# DATABASE_URL=postgres://user:pass@localhost:5432/chauffeur

# 2. Create local database
createdb chauffeur

# 3. Run migration
npm run migrate

# 4. Seed data
npm run seed

# 5. Start server
npm start

# 6. Test booking submission at http://localhost:3000
```

If you see booking errors locally, check:
- PostgreSQL is running: `psql -U postgres`
- Database exists: `\l` in psql
- Tables created: `npm run migrate` output
- Vehicles seeded: Visit `/api/bookings/vehicles`

---

## ✨ What Changed

### In `.env`:
- `USE_MOCK_DB`: Changed from `true` → `false`
- `NODE_ENV`: Changed from `development` → `production`

### In `bookingController.js`:
- Added detailed error logging with stack traces
- Logs the booking payload for debugging
- Shows which mode (mock vs real DB) is active

---

## 🆘 Still Having Issues?

```bash
# View everything
heroku logs -n 500 --app your-chauffeur-app

# SSH into dyno and inspect
heroku ps:exec --app your-chauffeur-app

# Manually test database
heroku run "node" --app your-chauffeur-app
# Then in Node REPL:
> const pool = require('./config/db');
> const result = await pool.query('SELECT * FROM bookings LIMIT 1');
> console.log(result.rows);
```

---

## 📝 Quick Reference

```bash
# Common commands
heroku apps                                    # List your apps
heroku config --app YOUR_APP                  # Show env vars
heroku logs --tail --app YOUR_APP             # Watch logs
heroku run npm run migrate --app YOUR_APP     # Run migration
heroku run npm run seed --app YOUR_APP        # Seed data
heroku pg:reset DATABASE_URL --app YOUR_APP   # Reset database
heroku restart --app YOUR_APP                 # Restart app
```

---

**Last Updated**: April 2026  
**Node Version**: 18.x  
**Database**: PostgreSQL
