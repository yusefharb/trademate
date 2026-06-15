# Tendd Integrations Service

Third-party integrations for the Tendd platform: calendar booking, SMS, Google Business Profile, review management, and missed-call text-back.

## Architecture

```
┌─────────────┐     ┌──────────────────────────────────┐     ┌──────────────┐
│  Platform   │────▶│   Integrations Service (:4000)    │────▶│   Twilio     │
│  API (:3000)│     │                                  │     │   (SMS/Voice)│
│             │     │  ┌────────────┐ ┌──────────────┐ │     └──────────────┘
│  Chatbot    │◀───▶│  │ Webhooks   │ │ Internal API │ │────▶│   Calendly   │
│  Widget     │     │  │ Router     │ │  Routes      │ │     │   or Cal.com │
│             │     │  └────────────┘ └──────────────┘ │     └──────────────┘
│  Admin      │     │                                  │────▶│   Google BP  │
│  Dashboard  │◀───▶│  ┌──────────────────────────────┐│     └──────────────┘
└─────────────┘     │  │    Services                   ││────▶│   Vapi.ai    │
                    │  │  • SMS (Twilio)               ││     └──────────────┘
                    │  │  • Calendar (Calendly/Cal.com)││
                    │  │  • GMB Sync                   ││────▶│   Meta API   │
                    │  │  • Review Management          ││     └──────────────┘
                    │  │  • Missed-Call Text-Back      ││
                    │  │  • Lead Capture Pipeline      ││
                    │  └──────────────────────────────┘│
                    └──────────────────────────────────┘
```

## Services

### 1. SMS Service (`sms-service.js`)
- Send booking confirmations, reminders, follow-ups, review requests
- Handle inbound SMS replies ("C" to confirm, "R" to reschedule)
- Missed-call text-back: "Hi [name], [trader] is on a job. Book a callback: [link]"

### 2. Calendar Service (`calendar-service.js`)
- **Calendly** integration (managed booking platform)
- **Cal.com** integration (open-source, self-hostable)
- Fetch availability, create bookings, handle webhooks
- Automatically sends confirmation SMS on booking

### 3. Google Business Profile Service (`gmb-service.js`)
- OAuth 2.0 authentication with refresh tokens
- Sync business hours to GBP
- Create posts (offers, updates, events)
- Reply to reviews
- Get insights/analytics
- Generate Google review links

### 4. Review Management (`review-service.js`)
- Trigger review requests after job completion
- Track clicks on review links
- Monitor for new reviews on GBP
- Per-trader review analytics

### 5. Missed-Call Text-Back (`missed-call-service.js`)
- Twilio voice forwarding with fallback
- Generates TwiML for call routing
- Vapi.ai voice agent integration
- Automatic SMS when calls are missed

### 6. Lead Capture Pipeline (`lead-pipeline.js`)
- Centralises leads from ALL sources
- Deduplication by phone number
- Source tracking (chatbot, voice, social, GMB, missed-call, manual)
- Conversion metrics and stats

## API Endpoints

### Internal API Routes
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/leads` | Capture a new lead |
| GET | `/api/leads/:traderId` | List leads for a trader |
| GET | `/api/leads/:traderId/stats` | Lead statistics |
| POST | `/api/bookings` | Create a booking |
| POST | `/api/bookings/:id/complete` | Complete booking → trigger review |
| POST | `/api/bookings/:id/cancel` | Cancel a booking |
| POST | `/api/sms/send` | Send custom SMS |
| POST | `/api/sms/send-confirmation` | Send booking confirmation |
| POST | `/api/sms/send-reminder` | Send 24h reminder |
| POST | `/api/missed-call` | Trigger missed-call text-back |
| GET | `/api/reviews/track/:requestId` | Track review link click |
| GET | `/api/reviews/trader/:traderId/stats` | Review stats |
| POST | `/api/gmb/sync-hours` | Sync hours to GBP |
| POST | `/api/gmb/create-post` | Post to GBP |
| GET | `/api/availability` | Get available slots |
| POST | `/api/reminders/trigger` | Send pending reminders |

### Webhook Routes
| Method | Path | Source |
|--------|------|--------|
| POST | `/api/webhooks/twilio/sms` | Twilio SMS replies |
| POST | `/api/webhooks/twilio/call-forward-result` | Twilio call forwarding |
| POST | `/api/webhooks/twilio/voice-fallback` | Twilio missed call |
| POST | `/api/webhooks/calendly` | Calendly events |
| POST | `/api/webhooks/calcom` | Cal.com events |
| POST | `/api/webhooks/vapi` | Vapi.ai call events |
| POST | `/api/webhooks/meta` | Meta/Facebook/Instagram DMs |

## Setup

1. Copy `.env.example` to `.env` and fill in API keys
2. Install dependencies: `npm install`
3. Start: `npm start` (or `npm run dev` for watch mode)

### Required API Keys

| Service | Key | Where to Get |
|---------|-----|-------------|
| Twilio | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | [twilio.com/console](https://twilio.com/console) |
| Calendly | `CALENDLY_API_KEY` | [calendly.com/integrations/api](https://calendly.com/integrations/api) |
| Cal.com | `CALCOM_API_KEY` | Self-hosted or Cal.com dashboard |
| Google BP | `GMB_CLIENT_ID`, `GMB_CLIENT_SECRET`, `GMB_REFRESH_TOKEN` | Google Cloud Console |
| Vapi.ai | `VAPI_API_KEY`, `VAPI_AGENT_ID` | [vapi.ai](https://vapi.ai) |

## Integration Points with Other Teams

### Platform Team
- Data models in `src/models/data-models.js` can drive the PostgreSQL schema
- `PLATFORM_API_URL` and `PLATFORM_API_KEY` connect to the platform API
- Lead/bookings/comms records pushed to platform DB via API

### Chatbot Team
- `POST /api/leads` — chatbot feeds leads here
- `GET /api/availability` — chatbot queries available slots
- `POST /api/bookings` — chatbot creates booking when quote accepted
- Webhook router handles Vapi.ai and Meta DM callbacks

### Website Builder Team
- Missed-call text-back includes `bookingLink` — website builder generates this
- Review links point to Google review landing page