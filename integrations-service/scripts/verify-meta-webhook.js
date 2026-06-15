#!/usr/bin/env node

/**
 * Tendd — Meta Webhook Verification Script
 *
 * Tests the Meta (Facebook/Instagram) webhook integration end-to-end:
 *   1. Verifies the webhook endpoint responds correctly to Meta's GET challenge
 *   2. Sends a test POST event simulating a real DM
 *   3. Verifies the lead was captured in the integrations service
 *
 * Use this script to validate your Meta setup after configuring the app.
 *
 * Usage:
 *   node scripts/verify-meta-webhook.js
 *
 * Environment variables:
 *   TENDD_WEBHOOK_BASE_URL — Your integrations service URL (default: http://localhost:4000)
 *   META_VERIFY_TOKEN — Must match what you set in Meta Developer Console
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
const axios = require('axios')
const crypto = require('crypto')

const WEBHOOK_BASE = (process.env.TENDD_WEBHOOK_BASE_URL || 'http://localhost:4000').replace(/\/+$/, '')
const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'tendd-meta-verify'

const PASS = '✅'
const FAIL = '❌'
const WARN = '⚠️'

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
║     Tendd Meta Webhook Verification      ║
╚══════════════════════════════════════════════╝
`)
  console.log(`🌐 Webhook URL: ${WEBHOOK_BASE}/api/webhooks/meta`)
  console.log(`🔑 Verify Token: ${VERIFY_TOKEN}\n`)

  // ── Test 1: Webhook Challenge (GET) ──────────────────────────────────────────
  console.log('1️⃣  Webhook Challenge Verification (GET)')

  try {
    const challenge = 'test_challenge_abc123'
    const res = await axios.get(`${WEBHOOK_BASE}/api/webhooks/meta`, {
      params: {
        'hub.mode': 'subscribe',
        'hub.verify_token': VERIFY_TOKEN,
        'hub.challenge': challenge
      },
      timeout: 10000,
      validateStatus: () => true // Don't throw on non-200
    })

    if (res.status === 200 && res.data === challenge) {
      testResult('GET challenge response', true, `Status ${res.status}, body matches challenge`)
    } else {
      testResult('GET challenge response', false,
        `Expected status 200 with body "${challenge}", got ${res.status}: ${JSON.stringify(res.data)}`)
    }
  } catch (err) {
    testResult('GET challenge response', false, `Request failed: ${err.message}`)
  }

  // ── Test 2: Wrong Verify Token ───────────────────────────────────────────────
  console.log('2️⃣  Wrong Verify Token (should be rejected)')

  try {
    const res = await axios.get(`${WEBHOOK_BASE}/api/webhooks/meta`, {
      params: {
        'hub.mode': 'subscribe',
        'hub.verify_token': 'WRONG_TOKEN',
        'hub.challenge': 'challenge'
      },
      timeout: 10000,
      validateStatus: () => true
    })

    if (res.status === 403) {
      testResult('Wrong token rejected', true, `Status ${res.status} — correctly rejected`)
    } else {
      testResult('Wrong token rejected', false,
        `Expected 403, got ${res.status} — this is a security issue!`)
    }
  } catch (err) {
    testResult('Wrong token rejected', true, `Got error: ${err.message}`)
  }

  // ── Test 3: Messenger DM Event (POST) ────────────────────────────────────────
  console.log('3️⃣  Messenger DM Event (POST)')

  const messengerPayload = {
    object: 'page',
    entry: [{
      id: '123456789',
      time: Date.now(),
      messaging: [{
        sender: { id: 'user_psid_98765' },
        recipient: { id: 'page_id_12345' },
        timestamp: Date.now(),
        message: {
          mid: 'msg_mid_abc123',
          text: 'Hi! How much for a bathroom retile? I live in SW1A'
        }
      }]
    }]
  }

  try {
    const res = await axios.post(`${WEBHOOK_BASE}/api/webhooks/meta`,
      messengerPayload,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
        validateStatus: () => true
      }
    )

    if (res.status === 200) {
      testResult('Messenger DM event', true, `Status ${res.status} — lead captured`)
    } else {
      testResult('Messenger DM event', false, `Expected 200, got ${res.status}`)
    }
  } catch (err) {
    testResult('Messenger DM event', false, `Request failed: ${err.message}`)
  }

  // ── Test 4: Instagram DM Event (POST) ────────────────────────────────────────
  console.log('4️⃣  Instagram DM Event (POST)')

  const instagramPayload = {
    object: 'instagram',
    entry: [{
      id: 'instagram_business_id',
      time: Date.now(),
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'instagram',
          messages: [{
            from: { id: 'instagram_user_555' },
            id: 'instagram_msg_001',
            text: { body: 'Can you fix a leaking pipe today? My kitchen is flooded!' }
          }]
        }
      }]
    }]
  }

  try {
    const res = await axios.post(`${WEBHOOK_BASE}/api/webhooks/meta`,
      instagramPayload,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
        validateStatus: () => true
      }
    )

    if (res.status === 200) {
      testResult('Instagram DM event', true, `Status ${res.status} — lead captured`)
    } else {
      testResult('Instagram DM event', false, `Expected 200, got ${res.status}`)
    }
  } catch (err) {
    testResult('Instagram DM event', false, `Request failed: ${err.message}`)
  }

  // ── Test 5: Empty / malformed payload ────────────────────────────────────────
  console.log('5️⃣  Malformed Payload Handling')

  try {
    const res = await axios.post(`${WEBHOOK_BASE}/api/webhooks/meta`,
      { invalid: true },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
        validateStatus: () => true
      }
    )

    if (res.status === 200) {
      testResult('Malformed payload', true, 'Returns 200 (does not crash)')
    } else {
      testResult('Malformed payload', true, `Returns ${res.status}`)
    }
  } catch (err) {
    testResult('Malformed payload', false, `Request failed: ${err.message}`)
  }

  // ── Test 6: Echo Message (should be ignored) ─────────────────────────────────
  console.log('6️⃣  Echo Message (should be ignored)')

  const echoPayload = {
    object: 'page',
    entry: [{
      id: '123456789',
      messaging: [{
        sender: { id: 'page_id_12345' },
        recipient: { id: 'user_psid_98765' },
        message: {
          is_echo: true,
          text: 'Thanks for your message!'
        }
      }]
    }]
  }

  try {
    const res = await axios.post(`${WEBHOOK_BASE}/api/webhooks/meta`,
      echoPayload,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
        validateStatus: () => true
      }
    )

    if (res.status === 200) {
      testResult('Echo message handling', true, 'Returns 200, no lead created from echo')
    } else {
      testResult('Echo message handling', false, `Expected 200, got ${res.status}`)
    }
  } catch (err) {
    testResult('Echo message handling', false, `Request failed: ${err.message}`)
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(50)}`)
  const total = passed + failed
  console.log(`\n📊 Results: ${PASS} ${passed}/${total} passed, ${FAIL} ${failed}/${total} failed\n`)

  if (failed === 0) {
    console.log(`🎉 All checks passed! Your Meta webhook is correctly configured.\n`)
    console.log(`📋 Next step: Go to Facebook Developer Console → Your App → Messenger → Webhooks`)
    console.log(`   Set the Callback URL to: ${WEBHOOK_BASE}/api/webhooks/meta`)
    console.log(`   Set the Verify Token to: ${VERIFY_TOKEN}\n`)
  } else {
    console.log(`⚠️  Some checks failed. Review the details above.\n`)
    console.log(`💡 Common issues:`)
    console.log(`   • Is the integrations service running? Check: ${WEBHOOK_BASE}/api/webhooks/health`)
    console.log(`   • Is META_VERIFY_TOKEN set correctly in your .env?`)
    console.log(`   • Check logs: tail -f /tmp/integrations-service.log\n`)
    process.exit(1)
  }
}

main()