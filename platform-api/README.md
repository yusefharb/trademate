# Tendd Core Platform API v0.1.0

## Overview
The core Tendd backend serves as the central hub for all Tendd services.

**Base URL:** `http://0.0.0.0:3001/api`

## Authentication
Uses **email-based magic link** auth (no passwords).
1. `POST /api/auth/magic-link` — request a magic link
2. `POST /api/auth/verify` — exchange token for JWT
3. Pass JWT as `Authorization: Bearer <jwt>` header

### Auth Routes
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/magic-link` | No | Request magic link. In dev, returns `magic_link` URL directly |
| POST | `/api/auth/verify` | No | Verify token, get JWT + user object |
| GET | `/api/auth/me` | Yes | Get current user profile |
| POST | `/api/auth/register-lead` | No | Public endpoint to register a lead (for chatbot/website) |

### User Routes (all require JWT)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/users/profile` | Get full profile |
| PUT | `/api/users/profile` | Update business info |
| GET | `/api/users/services` | List services |
| POST | `/api/users/services` | Add service |
| PUT | `/api/users/services/:id` | Update service |
| DELETE | `/api/users/services/:id` | Delete service |
| GET | `/api/users/service-areas` | List service areas |
| POST | `/api/users/service-areas` | Add service area |
| DELETE | `/api/users/service-areas/:id` | Delete service area |
| GET | `/api/users/onboarding` | Get onboarding progress |
| POST | `/api/users/onboarding/advance` | Advance onboarding step |
| POST | `/api/users/website-subdomain` | Set website subdomain (for Website Builder) |

### Subscription Routes (require JWT)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/subscriptions` | Get current subscription |
| PUT | `/api/subscriptions/tier` | Update tier |

### Lead Routes (require JWT)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/leads` | List leads (query: status, limit, page) |
| POST | `/api/leads` | Create lead (manual) |
| PATCH | `/api/leads/:id/status` | Update lead status + quote |
| GET | `/api/leads/stats` | Lead stats by status |

### Admin Routes
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/stats` | Dashboard statistics |
| GET | `/api/admin/users` | List all users |
| GET | `/api/admin/subscriptions` | All subscriptions |

### Webhook Routes (called by Integrations Service)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/webhooks/leads` | Receive lead from integrations service (Twilio, Vapi, Meta, etc.) |
| POST | `/api/webhooks/bookings` | Receive booking from integrations service (Calendly/Cal.com sync) |
| POST | `/api/webhooks/sync` | Batch sync leads from integrations service |

### Integration Bridge
The platform API automatically syncs leads to the Integrations Service (port 4000):
- `POST /api/leads` → forwards to Integrations Service
- `PATCH /api/leads/:id/status` → notifies Integrations Service

**Architecture:** Platform API (port 3001) ←bidirectional→ Integrations Service (port 4000)

### UI Pages
| URL | Description |
|-----|-------------|
| `/admin/` | Admin Dashboard (live stats + trader list) |
| `/onboarding/` | Trader Onboarding Wizard (5-step setup) |

### Health
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |

## Database Schema (SQLite)
Tables: `users`, `subscriptions`, `services`, `service_areas`, `leads`, `onboarding_tasks`, `auth_tokens`

See `api/src/db/schema.ts` for full schema.

## Onboarding Flow
Steps: `account_created` → `business_info` → `services_added` → `service_areas` → `pricing_set` → `booking_connected` → `website_generated` → `voice_setup` → `social_connected` → `complete`

## Demo Data
- Email: `demo@tenddapp.uk`
- Uses Growth tier (14-day trial)
- Has 4 services, 4 service areas, 4 sample leads
- Onboarding at step 5/10 (pricing_set)

## Tech Stack
- **Runtime:** Node.js + TypeScript
- **Framework:** Express.js
- **Database:** SQLite (better-sqlite3, WAL mode)
- **Auth:** Magic link + JWT
- **Billing:** Stripe-ready (stub endpoints, no keys configured)

## File Structure (api/)
```
api/
├── src/
│   ├── index.ts          — Main entry point, Express app
│   ├── routes/
│   │   ├── auth.ts       — Auth routes + public lead registration
│   │   ├── users.ts      — User profile, services, areas, onboarding
│   │   ├── subscriptions.ts
│   │   ├── leads.ts
│   │   └── admin.ts
│   ├── services/
│   │   ├── auth.ts       — Magic link, JWT, user lookup
│   │   ├── users.ts      — Profile CRUD, services, areas, onboarding
│   │   ├── subscriptions.ts
│   │   └── leads.ts
│   ├── middleware/
│   │   └── auth.ts       — requireAuth, requireTier, optionalAuth
│   └── db/
│       ├── connection.ts — SQLite connection, migrations
│       ├── schema.ts     — DDL schema
│       ├── migrate.ts    — Migration runner
│       └── seed.ts       — Demo data seeder
├── admin/
│   └── index.html        — Admin dashboard (Tailwind CSS)
├── shared/
│   └── types.ts          — Shared TypeScript types
└── package.json
