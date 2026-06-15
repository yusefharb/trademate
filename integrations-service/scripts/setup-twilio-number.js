#!/usr/bin/env node

/**
 * Tendd — Twilio Phone Number Setup
 *
 * Buys a Twilio phone number and configures it to forward to the Vapi.ai agent.
 * Handles the full Twilio → Vapi.ai voice forwarding pipeline.
 *
 * Usage:
 *   export TWILIO_ACCOUNT_SID="AC..."
 *   export TWILIO_AUTH_TOKEN="..."
 *   export VAPI_API_KEY="sk-..."        # optional: if you want to auto-assign in Vapi
 *   node scripts/setup-twilio-number.js
 *
 * What this script does:
 *   1. Checks if you already have a Twilio number
 *   2. If not, searches for an available UK geographic number
 *   3. Purchases the number
 *   4. Sets voice URL to point at the Tendd integrations service
 *   5. Optionally imports the number into Vapi.ai
 *
 * Flow:
 *   Incoming call → Twilio number → POST to integrations service
 *   → service returns TwiML connecting to Vapi.ai WebSocket
 *   → Vapi.ai AI agent answers the call
 *   → If no answer, missed-call text-back is triggered
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
const axios = require('axios')
const path = require('path')

// ─── Configuration ───────────────────────────────────────────────────────────────

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN
const VAPI_API_KEY = process.env.VAPI_API_KEY
const WEBHOOK_BASE = (process.env.TENDD_WEBHOOK_BASE_URL || 'http://localhost:4000').replace(/\/+$/, '')
const AREA_CODE = process.env.TWILIO_AREA_CODE || ''     // e.g., "020" for London
const COUNTRY_CODE = process.env.TWILIO_COUNTRY || 'GB'

// ─── Helpers ─────────────────────────────────────────────────────────────────────

function fail (msg) {
  console.error(`\n❌ ${msg}`)
  process.exit(1)
}

/**
 * Twilio REST API helper using Basic Auth.
 */
async function twilioRequest (method, path, params = {}) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/${path}`
  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')

  const config = {
    method,
    url,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  }

  // Convert params object to URLSearchParams for POST requests
  if (method === 'POST') {
    const body = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        body.append(key, value)
      }
    }
    config.data = body.toString()
  } else {
    config.params = params
  }

  const res = await axios(config)
  return res.data
}

// ─── Phone Number Workflow ───────────────────────────────────────────────────────

/**
 * List existing incoming phone numbers on the Twilio account.
 */
async function listExistingNumbers () {
  const data = await twilioRequest('GET', 'IncomingPhoneNumbers.json', { PageSize: 50 })
  return data.incoming_phone_numbers || []
}

/**
 * Search for available UK phone numbers.
 *
 * @param {string} areaCode - Optional area code prefix (e.g., "020" for London)
 */
async function searchAvailableNumbers (areaCode = '') {
  // First try to find a geographic/local number
  const searchParams = {
    Country: COUNTRY_CODE,
    Type: 'local',
    VoiceEnabled: true,
    SmsEnabled: true,
    PageSize: 10
  }

  if (areaCode) {
    searchParams.Contains = areaCode
  }

  try {
    const data = await twilioRequest('GET', 'AvailablePhoneNumbers/GB/Local.json', searchParams)
    if (data.available_phone_numbers && data.available_phone_numbers.length > 0) {
      return data.available_phone_numbers
    }
  } catch {
    // Fall through to mobile numbers
  }

  // Fall back to mobile numbers
  const mobileData = await twilioRequest('GET', 'AvailablePhoneNumbers/GB/Mobile.json', {
    Country: COUNTRY_CODE,
    VoiceEnabled: true,
    PageSize: 10
  })
  return mobileData.available_phone_numbers || []
}

/**
 * Purchase a phone number.
 */
async function purchaseNumber (phoneNumber) {
  console.log(`   Purchasing ${phoneNumber}...`)
  const result = await twilioRequest('POST', 'IncomingPhoneNumbers.json', {
    PhoneNumber: phoneNumber,
    VoiceUrl: `${WEBHOOK_BASE}/api/webhooks/twilio/voice-fallback`,
    VoiceMethod: 'POST',
    VoiceFallbackUrl: `${WEBHOOK_BASE}/api/webhooks/twilio/voice-fallback`,
    VoiceFallbackMethod: 'POST',
    SmsUrl: `${WEBHOOK_BASE}/api/webhooks/twilio/sms`,
    SmsMethod: 'POST',
    SmsFallbackUrl: `${WEBHOOK_BASE}/api/webhooks/twilio/sms`,
    SmsFallbackMethod: 'POST',
    StatusCallback: `${WEBHOOK_BASE}/api/webhooks/twilio/call-forward-result`,
    StatusCallbackMethod: 'POST'
  })
  return result
}

/**
 * Update an existing number's voice URL to point at our integrations service.
 */
async function updateNumberVoiceUrl (numberSid) {
  console.log(`   Updating voice URL for SID ${numberSid}...`)
  const result = await twilioRequest('POST', `IncomingPhoneNumbers/${numberSid}.json`, {
    VoiceUrl: `${WEBHOOK_BASE}/api/webhooks/twilio/voice-fallback`,
    VoiceMethod: 'POST',
    VoiceFallbackUrl: `${WEBHOOK_BASE}/api/webhooks/twilio/voice-fallback`,
    VoiceFallbackMethod: 'POST',
    SmsUrl: `${WEBHOOK_BASE}/api/webhooks/twilio/sms`,
    SmsMethod: 'POST',
    SmsFallbackUrl: `${WEBHOOK_BASE}/api/webhooks/twilio/sms`,
    SmsFallbackMethod: 'POST',
    StatusCallback: `${WEBHOOK_BASE}/api/webhooks/twilio/call-forward-result`,
    StatusCallbackMethod: 'POST'
  })
  return result
}

/**
 * Import the Twilio number into Vapi.ai so Vapi can use it.
 */
async function importToVapi (twilioPhoneNumber) {
  if (!VAPI_API_KEY) {
    console.log('   ⚠️  VAPI_API_KEY not set — skipping Vapi import.')
    console.log('   💡 Manually add this number in Vapi Dashboard → Phone Numbers')
    return null
  }

  const credentialId = process.env.VAPI_TWILIO_CREDENTIAL_ID
  if (!credentialId) {
    console.log('   ⚠️  VAPI_TWILIO_CREDENTIAL_ID not set — skipping Vapi import.')
    console.log('   💡 Create a Twilio credential in Vapi Dashboard → Credentials, then set VAPI_TWILIO_CREDENTIAL_ID')
    return null
  }

  const res = await axios.post('https://api.vapi.ai/phone-number',
    {
      provider: 'twilio',
      number: twilioPhoneNumber,
      twilioAccountSid: TWILIO_ACCOUNT_SID,
      credentialId
    },
    {
      headers: {
        Authorization: `Bearer ${VAPI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    }
  )

  return res.data
}

// ─── Main ────────────────────────────────────────────────────────────────────────

async function main () {
  console.log(`
╔══════════════════════════════════════════════╗
║      Tendd Twilio Number Setup           ║
╚══════════════════════════════════════════════╝
`)

  if (!TWILIO_ACCOUNT_SID) fail('TWILIO_ACCOUNT_SID is not set')
  if (!TWILIO_AUTH_TOKEN) fail('TWILIO_AUTH_TOKEN is not set')

  console.log(`🌐 Webhook URL: ${WEBHOOK_BASE}/api/webhooks/twilio/voice-fallback\n`)

  // Step 1: Check existing numbers
  console.log('📋 Checking existing Twilio numbers...')
  const existing = await listExistingNumbers()
  const voiceNumbers = existing.filter(n => n.capabilities?.voice || n.voice)

  if (voiceNumbers.length > 0) {
    console.log(`   Found ${voiceNumbers.length} existing number(s) with voice:`)
    for (const n of voiceNumbers) {
      const currentUrl = n.voice_url || '(not configured)'
      console.log(`   • ${n.phone_number} — voice URL: ${currentUrl.substring(0, 60)}`)
    }

    // Offer to update the first unconfigured number
    const unconfigured = voiceNumbers.find(n => !n.voice_url || !n.voice_url.includes(WEBHOOK_BASE))
    if (unconfigured) {
      console.log(`\n🔧 Updating ${unconfigured.phone_number} to point at integrations service...`)
      await updateNumberVoiceUrl(unconfigured.sid)
      console.log(`   ✅ Updated!`)
    } else {
      console.log(`\n   ✅ All numbers already configured.`)
    }

    console.log(`\n🎯 Done! Numbers are ready to receive calls.`)
    return
  }

  // Step 2: Search for available numbers
  console.log('🔍 Searching for available UK numbers...')
  const available = await searchAvailableNumbers(AREA_CODE)

  if (available.length === 0) {
    fail('No available phone numbers found for GB. Check your Twilio account has funds.')
  }

  console.log(`   Found ${available.length} available number(s). Top picks:`)
  for (let i = 0; i < Math.min(available.length, 5); i++) {
    const n = available[i]
    console.log(`   [${i + 1}] ${n.phone_number} — ${n.locality || 'mobile'} (${n.iso_country || 'GB'})`)
  }

  // Step 3: Purchase the first number
  const chosenNumber = available[0].phone_number
  console.log(`\n💳 Purchasing ${chosenNumber}...`)
  try {
    const purchased = await purchaseNumber(chosenNumber)
    console.log(`   ✅ Purchased! SID: ${purchased.sid}`)
    console.log(`   📞 Number: ${purchased.phone_number}`)

    // Step 4: Optionally import into Vapi
    if (VAPI_API_KEY) {
      console.log('\n🔗 Importing into Vapi.ai...')
      try {
        const vapiNumber = await importToVapi(purchased.phone_number)
        console.log(`   ✅ Imported! Vapi phone number ID: ${vapiNumber.id}`)
      } catch (err) {
        console.log(`   ⚠️  Could not import to Vapi: ${err.message}`)
        console.log('   💡 Manually add this number in Vapi Dashboard → Phone Numbers')
      }
    }

    console.log(`\n🎯 Success! Number is configured and ready.`)
    console.log(`   📞 ${purchased.phone_number}`)
    console.log(`   → Voice URL: ${WEBHOOK_BASE}/api/webhooks/twilio/voice-fallback`)
    console.log(`   → SMS URL: ${WEBHOOK_BASE}/api/webhooks/twilio/sms`)
    console.log(`\n📋 Add this to your .env:`)
    console.log(`   TWILIO_PHONE_NUMBER="${purchased.phone_number}"`)
  } catch (err) {
    console.error(`\n❌ Purchase failed:`, err.response?.data?.message || err.message)
    if (err.response?.data?.code === 21452) {
      console.log('💡 You may need to add funds to your Twilio account.')
    }
    process.exit(1)
  }
}

main()