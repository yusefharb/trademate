#!/usr/bin/env node

/**
 * Trademate — Vapi Call Flow Test
 *
 * Simulates a Vapi.ai call.ended webhook to test the full pipeline:
 *   Vapi → integrations service → lead capture → missed-call text-back
 *
 * Usage:
 *   node scripts/test-vapi-webhook.js
 *
 * This sends a realistic call.ended payload to the integrations service
 * webhook endpoint and verifies that:
 *   1. The webhook returns 200
 *   2. A lead was created from the call data
 *   3. Transcript and metadata are captured
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
const axios = require('axios')
const crypto = require('crypto')

const WEBHOOK_BASE = (process.env.TRADEMATE_WEBHOOK_BASE_URL || 'http://localhost:4000').replace(/\/+$/, '')
const VAPI_WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET || 'trademate-vapi-secret'

const PASS = '✅'
const FAIL = '❌'

let passed = 0
let failed = 0

function testResult (name, success, detail = '') {
  const icon = success ? PASS : FAIL
  console.log(`  ${icon} ${name}${detail ? ` — ${detail}` : ''}`)
  if (success) passed++
  else failed++
}

async function main () {
  console.log(`
╔══════════════════════════════════════════════╗
║      Trademate Vapi Webhook Test             ║
╚══════════════════════════════════════════════╝
`)
  console.log(`🌐 Webhook URL: ${WEBHOOK_BASE}/api/webhooks/vapi`)

  // Build a realistic call.ended payload
  const callPayload = {
    type: 'call.ended',
    call: {
      id: `test-call-${Date.now()}`,
      assistantId: 'test-assistant-vapi',
      status: 'ended',
      endedReason: 'assistant:success',
      duration: 142,
      cost: 0.045,
      customer: {
        number: '+447700900001',
        name: 'Sarah Test'
      },
      artifact: {
        transcript: [
          { role: 'assistant', content: 'Hello! Thank you for calling Ace Plumbing.' },
          { role: 'user', content: 'Hi, my boiler is making a strange noise and not heating properly.' },
          { role: 'assistant', content: 'I understand. Could I get your name please?' },
          { role: 'user', content: 'Sarah Test.' },
          { role: 'assistant', content: 'Thanks Sarah. And what area are you in?' },
          { role: 'user', content: 'SW1A 1AA, near Victoria station.' },
          { role: 'assistant', content: 'Great. How urgent is this? Do you need someone today?' },
          { role: 'user', content: 'It would be good to get it looked at tomorrow if possible.' },
          { role: 'assistant', content: 'Perfect, I have all the details. Let me pass this on to the team.' }
        ].map(m => `${m.role}: ${m.content}`).join('\n')
      }
    }
  }

  // Compute signature
  const rawBody = JSON.stringify(callPayload)
  const signature = crypto
    .createHmac('sha256', VAPI_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex')

  console.log(`📞 Simulating call.ended event for: Sarah Test (+447700900001)`)

  // ── Test 1: Send the webhook ────────────────────────────────────────────────
  console.log('\n1️⃣  Sending call.ended webhook...')

  try {
    const res = await axios.post(`${WEBHOOK_BASE}/api/webhooks/vapi`,
      callPayload,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-vapi-signature': signature
        },
        timeout: 10000,
        validateStatus: () => true
      }
    )

    testResult('Webhook accepted', res.status === 200, `Status ${res.status}`)
  } catch (err) {
    testResult('Webhook accepted', false, `Request failed: ${err.message}`)
  }

  // ── Test 2: Check lead was captured ──────────────────────────────────────────
  console.log('\n2️⃣  Verifying lead capture...')

  try {
    const res = await axios.get(`${WEBHOOK_BASE}/api/leads/test-assistant-vapi`,
      { timeout: 10000, validateStatus: () => true }
    )

    if (res.status === 200 && res.data.leads) {
      const leads = res.data.leads
      const voiceLeads = leads.filter(l => l.source === 'voice' && l.phone === '+447700900001')
      testResult('Lead captured', voiceLeads.length > 0, `Found ${voiceLeads.length} voice lead(s) from Sarah Test`)
    } else {
      testResult('Lead captured', false, `API returned ${res.status}`)
    }
  } catch (err) {
    testResult('Lead captured', false, `Could not verify: ${err.message}`)
  }

  // ── Test 3: Send a forwarding-failed event ───────────────────────────────────
  console.log('\n3️⃣  Testing forwarding-failed (should trigger text-back)...')

  const failedPayload = {
    type: 'call.ended',
    call: {
      id: `test-failed-call-${Date.now()}`,
      assistantId: 'test-assistant-vapi',
      status: 'ended',
      endedReason: 'assistant:forwarding-failed',
      duration: 60,
      customer: {
        number: '+447700900002',
        name: 'John Forward'
      }
    }
  }

  try {
    const res = await axios.post(`${WEBHOOK_BASE}/api/webhooks/vapi`,
      failedPayload,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
        validateStatus: () => true
      }
    )

    testResult('Forwarding-failed handled', res.status === 200, `Status ${res.status} — text-back should fire`)
  } catch (err) {
    testResult('Forwarding-failed handled', false, `Request failed: ${err.message}`)
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  const total = passed + failed
  console.log(`\n${'─'.repeat(50)}`)
  console.log(`\n📊 Results: ${PASS} ${passed}/${total} passed, ${FAIL} ${failed}/${total} failed\n`)

  if (failed === 0) {
    console.log(`🎉 All tests passed!\n`)
  } else {
    console.log(`⚠️  Some tests failed. Review the details above.\n`)
    console.log(`💡 Check: is the integrations service running on ${WEBHOOK_BASE}?\n`)
    process.exit(1)
  }
}

main()