# Tendd — Integration Setup Scripts

This directory contains scripts for setting up and testing third-party integrations for Tendd.

## Prerequisites

All scripts need the integrations service `.env` file at `/home/team/shared/integrations-service/.env`.

```bash
cd /home/team/shared/integrations-service
cp .env.example .env
# Fill in your API keys
npm install
```

## Scripts

### `setup-vapi-agent.js` — Vapi.ai Voice Agent

Configures a Vapi.ai AI voice receptionist for a trader.

```bash
# Required
export VAPI_API_KEY="sk-your-vapi-api-key"

# Optional — customise the agent
export TRADER_NAME="Ace Plumbing"
export TRADER_SERVICES="plumbing, heating, gas"
export TRADER_PHONE="+447700900000"
export TRADER_BOOKING_LINK="https://aceplumbing.tenddapp.uk/book"
export TENDD_WEBHOOK_BASE_URL="https://integrations.tenddapp.uk"

# Run it
node scripts/setup-vapi-agent.js
```

**What it does:**
1. Reads the receptionist prompt from `/home/team/shared/ai-configs/vapi-receptionist-prompt.md`
2. Creates or updates a Vapi.ai assistant with the prompt, tools, and webhook URL
3. The agent collects: **caller name, service needed, address/area, urgency, phone**
4. On call end, sends data to `POST /api/webhooks/vapi`
5. Lists configured phone numbers

**Agent tools:**
- `captureLead` — collects name, phone, service, address, urgency, description. Called automatically before call ends.

### `setup-twilio-number.js` — Twilio Phone Number

Buys/configures a Twilio phone number for call forwarding.

```bash
export TWILIO_ACCOUNT_SID="AC..."
export TWILIO_AUTH_TOKEN="..."
export TENDD_WEBHOOK_BASE_URL="https://integrations.tenddapp.uk"

node scripts/setup-twilio-number.js
```

**What it does:**
1. Lists existing Twilio numbers — updates voice URL if needed
2. If no numbers exist, searches for available UK numbers
3. Purchases the first available number
4. Sets Voice URL → `POST /api/webhooks/twilio/voice-fallback`
5. Sets SMS URL → `POST /api/webhooks/twilio/sms`
6. Optionally imports the number into Vapi.ai

**Call flow once configured:**
```
Customer calls Twilio number
    → POST to integrations service /api/webhooks/twilio/voice-fallback
    → Service returns TwiML connecting to Vapi.ai via WebSocket
    → Vapi.ai agent answers, greets, captures lead info
    → On call end, Vapi POSTS /api/webhooks/vapi with transcript + data
    → Integrations service creates lead
```

### `verify-meta-webhook.js` — Meta Webhook Test

Tests the Facebook/Instagram DM webhook endpoint.

```bash
export TENDD_WEBHOOK_BASE_URL="https://integrations.tenddapp.uk"
export META_VERIFY_TOKEN="your-verify-token"

node scripts/verify-meta-webhook.js
```

**What it tests:**
1. ✅ GET challenge response (Meta's verification handshake)
2. ✅ Wrong verify token is rejected (security check)
3. ✅ Messenger DM event → lead captured
4. ✅ Instagram DM event → lead captured
5. ✅ Malformed payload doesn't crash
6. ✅ Echo messages are ignored

### `test-vapi-webhook.js` — Vapi Webhook Test

Simulates Vapi.ai call events to test the full pipeline.

```bash
export TENDD_WEBHOOK_BASE_URL="https://integrations.tenddapp.uk"

node scripts/test-vapi-webhook.js
```

**What it tests:**
1. ✅ call.ended webhook → lead captured with transcript
2. ✅ Lead appears in the API with correct metadata
3. ✅ forwarding-failed event triggers missed-call text-back

## Running Order (First-Time Setup)

```bash
# 1. Buy/configure a Twilio number
node scripts/setup-twilio-number.js

# 2. Create the Vapi.ai voice agent
node scripts/setup-vapi-agent.js

# 3. Test the Vapi webhook
node scripts/test-vapi-webhook.js

# 4. Test the Meta webhook
node scripts/verify-meta-webhook.js
```

## Environment Variables Reference

| Variable | Required for | Purpose |
|----------|-------------|---------|
| `VAPI_API_KEY` | Vapi scripts | Vapi.ai API key |
| `VAPI_AGENT_ID` | Runtime | Agent ID (set after running setup) |
| `VAPI_WEBHOOK_SECRET` | Vapi scripts | Webhook signature secret |
| `TWILIO_ACCOUNT_SID` | Twilio scripts | Twilio account |
| `TWILIO_AUTH_TOKEN` | Twilio scripts | Twilio auth |
| `TWILIO_PHONE_NUMBER` | Runtime | Purchased number |
| `META_VERIFY_TOKEN` | Meta scripts | Webhook verify token |
| `META_PAGE_ACCESS_TOKEN` | Runtime | Page access token |
| `TENDD_WEBHOOK_BASE_URL` | All scripts | Your integrations service URL |