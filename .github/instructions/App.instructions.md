---
name: Luxury Chauffeur Booking System Standard
description: "Use when implementing or updating booking flow, admin panel, Express APIs, PostgreSQL schema, UX/UI, notifications, pricing, i18n, deployment, or architecture for the chauffeur-trip-booking project."
applyTo: "**"
---

# Luxury Chauffeur Booking System Standard

Apply these rules when adding or changing frontend, backend, admin, database, deployment, and product UX functionality.

## Product Goal

Build a ready-to-run luxury chauffeur trip booking platform with:
- Public booking experience
- Secure admin dashboard
- Express + PostgreSQL backend
- Heroku-compatible deployment setup

## Hard Requirements

### 1) Booking Form (Public)

- Must be fully responsive on desktop, tablet, and mobile.
- Must include: pickup, dropoff, date/time, car type, passengers, notes, promo code.
- Must support real-time validation and live price updates including promo code effects.
- Must use reusable layout sections (header, content, footer).
- Must include smooth transitions and purposeful microinteractions.

### 2) Admin Panel

- Must enforce secure login.
- Sidebar/navigation must remain hidden until successful authentication.
- Must include dashboard metrics: bookings overview, revenue, vehicles, promo code performance.
- Must support booking CRUD, search, and filtering.
- Must implement role-based access control with at least Admin and Operator roles.
- Must support CSV export and analytics chart visualizations.
- Must preserve mobile usability with sticky table headers and readable status indicators.

### 3) Backend/API and Security

- Stack must remain Node.js + Express + PostgreSQL.
- Must provide booking CRUD endpoints and promo validation endpoint(s).
- Must provide admin endpoints for auth, bookings, vehicles, pricing, promo codes, and analytics.
- Must use password hashing, strict input validation, and security-oriented middleware.
- Must keep configuration HTTPS-ready for production deployment.

### 4) Extra Features

- Must support email and WhatsApp notifications.
- Must include distance-based pricing logic.
- Must support optional add-ons (for example child seat and chauffeur notes).
- Must support dark mode toggle.
- Must support English and Arabic localization.

### 5) UI/UX Direction

- Visual style is mandatory: luxury black-and-gold, modern, premium tone.
- UX must prioritize clarity, speed, accessibility, and SEO fundamentals.
- Use meaningful animations only; avoid noisy effects that reduce performance.
- Make sure all pages are nice and functional on mobile, with touch-friendly controls and readable text.

### 6) Deliverables Rule

Every implementation request must produce a complete, coherent end-to-end update set:
- Frontend booking flow with promo support
- Secure admin login and dashboard workflows
- Reusable structural templates (header/footer/sidebar/content)
- Backend/API coverage for booking/admin/pricing/promo/analytics
- PostgreSQL schema and migration readiness for Heroku
- Clear local run and Heroku deployment instructions in README when behavior changes

Strictness policy:
- Even if the user asks for a narrow change, include and verify all dependent layers (UI, backend/API, data model, and operational docs) required to keep the system production-ready.
- Do not leave partial implementations or TODO placeholders for core requirements listed in this instruction.

## Implementation and Quality Guardrails

- Prefer maintainable, modular code over one-file solutions.
- Keep validation rules consistent between client and server.
- Ensure server responses are explicit and predictable for UI integration.
- Include verification steps for each major requirement touched.
- If a request is ambiguous or conflicting, ask focused clarification before changing architecture.

## Definition of Done (Per Feature)

- Functionality implemented end-to-end (UI, API, and DB impact where applicable)
- Responsive behavior verified at common breakpoints
- Input validation and permission checks confirmed
- Error states and empty states handled
- Basic accessibility checks done (labels, contrast, keyboard reachability)
- Run/deploy instructions updated if setup or commands changed