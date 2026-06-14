# Trademate

AI-powered customer acquisition and retention platform for tradespeople.

## Repository Structure

```
trademate/
├── platform-api/          # Core SaaS platform (Node.js/Express + SQLite)
│   ├── api/               # Express API (port 3001)
│   │   ├── src/           # TypeScript source
│   │   │   ├── routes/    # Auth, users, leads, subscriptions, admin, webhooks
│   │   │   ├── services/  # Business logic
│   │   │   ├── middleware/ # Auth middleware
│   │   │   └── db/        # Schema, migrations, seed
│   │   ├── admin/         # Admin dashboard UI
│   │   └── onboarding/    # Onboarding wizard UI
│   ├── onboarding-wizard/ # Standalone onboarding wizard
│   └── src/services/      # Integrations client
├── integrations-service/  # Third-party integrations (port 4000)
│   ├── src/
│   │   ├── services/      # Calendar, SMS, GMB, reviews, missed-call
│   │   ├── webhooks/      # Twilio, Calendly, Vapi, Meta webhooks
│   │   └── models/        # In-memory data store
│   └── scripts/           # Setup scripts
└── shared/                # Shared types
```

## Quick Start

### Platform API
```bash
cd platform-api/api
npm install
npm run seed    # Load demo data
npm run dev     # http://localhost:3001
```

### Integrations Service
```bash
cd integrations-service
npm install
npm start       # http://localhost:4000
```

## Tech Stack
- **API:** Node.js, Express, TypeScript, SQLite
- **Auth:** Magic link + JWT
- **Integrations:** Twilio, Calendly/Cal.com, Google Business Profile, Vapi.ai, Meta
- **UI:** Tailwind CSS, vanilla JS

## Demo Trader
- Email: `demo@trademateapp.uk`
- Tier: Growth (14-day trial)
- Services: Plumbing, boiler installation, bathroom renovation
