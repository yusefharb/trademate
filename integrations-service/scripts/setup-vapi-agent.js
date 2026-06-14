#!/usr/bin/env node

/**
 * Trademate — Vapi.ai Voice Agent Setup Script
 *
 * Configures a Vapi.ai voice agent for a trader using the Vapi REST API.
 * Creates or updates the agent with the receptionist prompt, tools, and webhooks.
 *
 * Usage:
 *   export VAPI_API_KEY="sk-..."
 *   export TRADEMATE_WEBHOOK_BASE_URL="https://integrations.trademateapp.uk"
 *   node scripts/setup-vapi-agent.js
 *
 * Optional env vars for trader customisation:
 *   TRADER_ID, TRADER_NAME, TRADER_SERVICES, TRADER_PHONE, TRADER_BOOKING_LINK
 *
 * API Reference: https://docs.vapi.ai/api-reference/assistant/create-assistant
 *   POST /assistant — Create a new assistant
 *   PATCH /assistant/:id — Update an existing assistant
 *   GET /assistant — List assistants
 *   POST /phone-number — Buy/import a phone number
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
const axios = require('axios')
const path = require('path')
const fs = require('fs')

const VAPI_API_BASE = 'https://api.vapi.ai'
const VAPI_API_KEY = process.env.VAPI_API_KEY
const WEBHOOK_BASE = (process.env.TRADEMATE_WEBHOOK_BASE_URL || 'http://localhost:4000').replace(/\/+$/, '')

// ─── Validators ──────────────────────────────────────────────────────────────────

function fail (msg) {
  console.error(`\n❌ ${msg}`)
  process.exit(1)
}

function requireEnv (name) {
  if (!process.env[name]) fail(`${name} is not set. Add it to your .env or export it.`)
  return process.env[name]
}

// ─── Agent Configuration Builder ─────────────────────────────────────────────────

function loadReceptionistPrompt () {
  // Try to read from the shared ai-configs first
  const promptPath = path.join(__dirname, '..', '..', 'ai-configs', 'vapi-receptionist-prompt.md')
  try {
    return fs.readFileSync(promptPath, 'utf-8').trim()
  } catch {
    // Fall back to built-in prompt if file not found
    return null
  }
}

/**
 * Build the full assistant configuration object.
 * Matches the Vapi.ai Create Assistant API schema.
 */
function buildAssistantConfig (opts = {}) {
  const traderId = opts.traderId || process.env.TRADER_ID || 'demo-trader'
  const traderName = opts.traderName || process.env.TRADER_NAME || 'Ace Plumbing'
  const businessName = opts.businessName || traderName
  const servicesList = (opts.services || (process.env.TRADER_SERVICES || 'plumbing, heating, gas')).split(',').map(s => s.trim()).join(', ')
  const traderPhone = opts.phone || process.env.TRADER_PHONE || '+447700900000'
  const bookingLink = opts.bookingLink || process.env.TRADER_BOOKING_LINK || 'https://trademateapp.uk/book'

  // Load prompt from file or build inline
  const basePrompt = loadReceptionistPrompt()
  const systemPrompt = basePrompt
    ? basePrompt
        .replace(/\[Business Name\]/g, businessName)
        .replace(/\[Trader Name\]/g, traderName)
    : `You are a professional AI receptionist for ${businessName}, a ${servicesList} business.

## Your Role
Handle incoming calls for the owner. Gather lead information. Provide a professional first impression.

## Information to Gather (ALWAYS collect all of these)
1. **Caller Name** — Full name
2. **Service Needed** — What specific trade/service (e.g., leaky tap, boiler service, rewire)
3. **Address/Area** — Property address or at least the postcode/area
4. **Urgency** — How soon do they need it? (emergency, today, this week, flexible)
5. **Phone Number** — Confirm the number they're calling from or ask for the best contact number

## Flow
1. Greeting: "Hello! Thank you for calling ${businessName}. This is their AI assistant. How can I help you today?"
2. Gather info naturally — ask follow-ups based on what they say
3. Confirm details: summarise everything you've gathered
4. Closing: "Thank you, [Name]. I've captured those details. ${traderName} is currently on a job, but I'll send this through right away. They'll get back to you as soon as they can."
5. ALWAYS call the captureLead tool before the call ends

## Edge Cases
- **Pricing**: "We provide custom quotes based on the specific job."
- **Emergency**: "I understand this is urgent. I'm flagging this as a priority."
- **Transfer request**: "They're on another job. I'll make sure they call you back."
- **Abusive callers**: "I'm sorry, I can't help with that." Then end the call.`

  return {
    name: `${businessName} Voice Receptionist`,

    model: {
      provider: 'openai',
      model: 'gpt-4o-mini',
      temperature: 0.3,
      maxTokens: 300,
      emotionRecognitionEnabled: true
    },

    voice: {
      provider: '11labs',
      voiceId: '21m00Tcm4TlvDq8ikWAM', // 11labs "Rachel" — clear British English
      stability: 0.5,
      similarityBoost: 0.75
    },

    firstMessage: `Hello! Thank you for calling ${businessName}. This is their AI assistant. How can I help you today?`,

    prompt: systemPrompt,

    // Tools (functions the AI can call during the conversation)
    tools: [
      {
        type: 'function',
        function: {
          name: 'captureLead',
          description: `Record a new sales lead from a phone call. Call this when you have gathered the caller's name and at least one service they need.`,
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string', description: "Caller's full name" },
              phone: { type: 'string', description: "Caller's phone number in E.164 format (e.g. +447700900001)" },
              serviceRequired: { type: 'string', description: 'What service or trade they need help with' },
              address: { type: 'string', description: 'Property address or area / first part of postcode' },
              urgency: { type: 'string', enum: ['emergency', 'today', 'this_week', 'flexible', 'unknown'], description: 'How soon they need the service' },
              description: { type: 'string', description: 'Brief description of the problem in the caller\'s own words' }
            },
            required: ['name', 'phone', 'serviceRequired']
          }
        }
      }
    ],

    // Webhook server — Vapi POSTs call events here
    server: {
      url: `${WEBHOOK_BASE}/api/webhooks/vapi`,
      secret: process.env.VAPI_WEBHOOK_SECRET || 'trademate-vapi-secret'
    },

    // Call behaviour
    maxDurationSeconds: 300,
    silenceTimeoutSeconds: 15,
    endCallPhrasesEnabled: true,
    endCallFunctionEnabled: true,
    voicemailDetectionEnabled: true,

    // Recording
    recordingEnabled: true,

    // Forwarding — if the AI needs to transfer to the real trader
    forwardingPhoneNumber: traderPhone,
    forwardingFallbackEnabled: true,
    forwardingFallbackPhoneNumber: traderPhone
  }
}

// ─── Vapi API Functions ──────────────────────────────────────────────────────────

function vapiHeaders () {
  return {
    Authorization: `Bearer ${VAPI_API_KEY}`,
    'Content-Type': 'application/json'
  }
}

async function listAssistants () {
  const res = await axios.get(`${VAPI_API_BASE}/assistant`, { headers: vapiHeaders() })
  return res.data
}

async function createAssistant (config) {
  const res = await axios.post(`${VAPI_API_BASE}/assistant`, config, { headers: vapiHeaders() })
  return res.data
}

async function updateAssistant (id, config) {
  const res = await axios.patch(`${VAPI_API_BASE}/assistant/${id}`, config, { headers: vapiHeaders() })
  return res.data
}

async function deleteAssistant (id) {
  const res = await axios.delete(`${VAPI_API_BASE}/assistant/${id}`, { headers: vapiHeaders() })
  return res.data
}

async function listPhoneNumbers () {
  const res = await axios.get(`${VAPI_API_BASE}/phone-number`, { headers: vapiHeaders() })
  return res.data
}

async function importTwilioPhoneNumber (twilioPhoneNumber, twilioAccountSid) {
  // When you already have a Twilio number, you can import it to Vapi
  const res = await axios.post(`${VAPI_API_BASE}/phone-number`, {
    provider: 'twilio',
    number: twilioPhoneNumber,
    twilioAccountSid,
    // The credential must exist in Vapi — create it via dashboard first
    credentialId: process.env.VAPI_TWILIO_CREDENTIAL_ID
  }, { headers: vapiHeaders() })
  return res.data
}

// ─── Main ────────────────────────────────────────────────────────────────────────

async function main () {
  console.log(`
╔══════════════════════════════════════════════╗
║        Trademate Vapi.ai Agent Setup         ║
╚══════════════════════════════════════════════╝
`)

  requireEnv('VAPI_API_KEY')
  console.log(`🔑 Vapi API Key: ${VAPI_API_KEY.substring(0, 8)}...${VAPI_API_KEY.slice(-4)}`)

  const trader = {
    id: process.env.TRADER_ID || 'demo-trader',
    name: process.env.TRADER_NAME || 'Ace Plumbing',
    businessName: process.env.TRADER_NAME || 'Ace Plumbing & Heating',
    services: process.env.TRADER_SERVICES || 'plumbing, heating, gas',
    phone: process.env.TRADER_PHONE || '+447700900000',
    bookingLink: process.env.TRADER_BOOKING_LINK || 'https://trademateapp.uk/book'
  }

  console.log(`🧑‍🔧 Trader: ${trader.businessName} (${trader.id})`)
  console.log(`🌐 Webhook URL: ${WEBHOOK_BASE}/api/webhooks/vapi\n`)

  // Step 1: Check if assistant already exists
  console.log('📋 Checking existing assistants...')
  const assistants = await listAssistants()
  const assistantName = `${trader.businessName} Voice Receptionist`
  const existing = assistants.find(a => a.name === assistantName)

  const config = buildAssistantConfig(trader)

  if (existing) {
    console.log(`  → Found existing assistant: ${existing.id}`)
    console.log('📝 Updating assistant configuration...')
    const result = await updateAssistant(existing.id, config)
    console.log(`  ✅ Updated! Assistant ID: ${result.id}`)
  } else {
    console.log('  → No existing assistant found')
    console.log('🆕 Creating new assistant...')
    const result = await createAssistant(config)
    console.log(`  ✅ Created! Assistant ID: ${result.id}`)
  }

  // Step 2: List available phone numbers
  console.log('\n📞 Checking phone numbers...')
  try {
    const numbers = await listPhoneNumbers()
    if (numbers.length === 0) {
      console.log('  ⚠️  No phone numbers configured.')
      console.log('  💡 Add one via Vapi Dashboard or run the Twilio setup script.')
    } else {
      console.log(`  Found ${numbers.length} number(s):`)
      for (const n of numbers) {
        console.log(`    • ${n.number} (${n.provider})${n.assistantId ? ` → assistant: ${n.assistantId}` : ' (unassigned)'}`)
      }
    }
  } catch (err) {
    console.log('  ⚠️  Could not list phone numbers:', err.message)
  }

  // Step 3: Print next steps
  console.log(`
📋 Next Steps:
  1. Set VAPI_AGENT_ID in your .env
  2. Assign a phone number to this assistant:
     - Vapi Dashboard → Phone Numbers → select number → assign assistant
     - Or run: node scripts/setup-twilio-number.js
  3. Test by calling the number
  4. Check calls at https://dashboard.vapi.ai

🎯 Done!
`)
}

main().catch(err => {
  console.error('\n❌ Setup failed:')
  if (err.response) {
    console.error(`   Status: ${err.response.status}`)
    console.error(`   Body: ${JSON.stringify(err.response.data, null, 2).substring(0, 500)}`)
  } else {
    console.error(`   ${err.message}`)
  }
  process.exit(1)
})