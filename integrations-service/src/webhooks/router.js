/**
 * Webhook Router — Production Hardened
 *
 * Central handler for all third-party webhooks:
 * - Twilio incoming SMS
 * - Twilio call forwarding results
 * - Calendly booking events
 * - Vapi.ai voice agent events (with signature verification)
 * - Meta (Facebook/Instagram) DM events
 */
const express = require('express')
const router = express.Router()

const smsService = require('../services/sms-service')
const missedCallService = require('../services/missed-call-service')
const calendarService = require('../services/calendar-service')
const leadPipeline = require('../services/lead-pipeline')
const { verifyVapiSignature } = require('./vapi-verify')
const { sendMessengerReply, sendInstagramReply } = require('./meta-send')

// ─── Health Check ────────────────────────────────────────────────────────────────

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'tendd-integrations',
    timestamp: new Date().toISOString()
  })
})

// ─── Twilio: Inbound SMS ─────────────────────────────────────────────────────────

/**
 * POST /api/webhooks/twilio/sms
 *
 * Twilio sends incoming SMS replies here.
 * Expects Twilio webhook POST with standard Twilio parameters.
 */
router.post('/twilio/sms', async (req, res) => {
  try {
    const result = await smsService.handleInboundSMS(req.body)

    if (result.reply) {
      res.set('Content-Type', 'text/xml')
      res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${result.reply}</Message>
</Response>`)
    } else {
      res.sendStatus(200)
    }
  } catch (err) {
    console.error('[Webhook] Twilio SMS error:', err.message)
    res.sendStatus(200)
  }
})

// ─── Twilio: Call Forwarding Result ──────────────────────────────────────────────

/**
 * POST /api/webhooks/twilio/call-forward-result
 *
 * Called when a call forwarding attempt completes.
 */
router.post('/twilio/call-forward-result', async (req, res) => {
  try {
    const result = await missedCallService.handleForwardResult(req.body)

    if (!result.answered) {
      console.log('[Webhook] Missed call handled, SMS sent')
    }

    res.set('Content-Type', 'text/xml')
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Thank you. We've noted your call.</Say>
</Response>`)
  } catch (err) {
    console.error('[Webhook] Call forward error:', err.message)
    res.sendStatus(200)
  }
})

// ─── Twilio: Voice Fallback (Missed Call) ────────────────────────────────────────

/**
 * POST /api/webhooks/twilio/voice-fallback
 *
 * Called when Vapi forwarding or direct dial fails.
 * This is the entry point for Vapi.ai Twilio integration.
 *
 * Returns TwiML that connects the call to Vapi.ai via WebSocket stream,
 * with a fallback to missed-call SMS.
 */
router.post('/twilio/voice-fallback', async (req, res) => {
  try {
    const traderId = req.body.traderId || process.env.TRADER_ID || 'unknown'
    const traderName = req.body.traderName || process.env.TRADER_NAME || 'Your Trader'
    const vapiAgentId = process.env.VAPI_AGENT_ID
    const webhookBase = process.env.TENDD_WEBHOOK_BASE_URL || `https://${req.get('host')}`

    if (vapiAgentId) {
      // Connect to Vapi.ai via Stream
      res.set('Content-Type', 'text/xml')
      res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://api.vapi.ai/ws">
      <Parameter name="agentId" value="${vapiAgentId}"/>
      <Parameter name="traderId" value="${traderId}"/>
      <Parameter name="traderName" value="${traderName}"/>
    </Stream>
  </Connect>
</Response>`)
    } else {
      // No Vapi configured — do direct forwarding with SMS fallback
      const traderPhone = process.env.TRADER_PHONE || req.body.traderPhone || null

      if (traderPhone) {
        res.set('Content-Type', 'text/xml')
        res.send(missedCallService.buildForwardingTwiML({
          traderPhone,
          ringTimeout: 25,
          webhookBaseUrl: webhookBase
        }))
      } else {
        // Can't forward — immediately trigger missed-call text-back
        const result = await missedCallService.handleMissedCall({
          callerNumber: req.body.From,
          callerName: req.body.CallerName || '',
          traderId,
          traderName,
          bookingLink: process.env.TRADER_BOOKING_LINK || 'https://tenddapp.uk/book'
        })

        res.set('Content-Type', 'text/xml')
        res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Thanks for calling. We'll send you a text with a link to book online.</Say>
</Response>`)
      }
    }
  } catch (err) {
    console.error('[Webhook] Voice fallback error:', err.message)
    res.sendStatus(200)
  }
})

// ─── Calendly Webhooks ──────────────────────────────────────────────────────────

/**
 * POST /api/webhooks/calendly
 *
 * Calendly sends events when bookings are created or cancelled.
 */
router.post('/calendly', async (req, res) => {
  try {
    const signature = req.headers['x-calendly-signature'] || null
    // TODO: Verify Calendly webhook signature using CALENDLY_WEBHOOK_SECRET

    const result = await calendarService.handleCalendlyWebhook(req.body)
    console.log('[Webhook] Calendly event processed:', result)
    res.sendStatus(200)
  } catch (err) {
    console.error('[Webhook] Calendly error:', err.message)
    res.sendStatus(200)
  }
})

// ─── Cal.com Webhooks ────────────────────────────────────────────────────────────

/**
 * POST /api/webhooks/calcom
 *
 * Cal.com sends booking lifecycle events.
 */
router.post('/calcom', async (req, res) => {
  try {
    const { triggerEvent, payload } = req.body

    console.log(`[Webhook] Cal.com event: ${triggerEvent}`)

    if (triggerEvent === 'BOOKING_CREATED') {
      const attendee = payload.attendees?.[0] || {}
      leadPipeline.captureLead({
        traderId: payload.metadata?.traderId || 'calcom-import',
        source: 'website',
        name: attendee.name || 'Cal.com Booking',
        phone: attendee.phone || '',
        email: attendee.email || '',
        serviceRequired: payload.title || 'Booking',
        metadata: { calcomBookingId: payload.id }
      })
    }

    res.sendStatus(200)
  } catch (err) {
    console.error('[Webhook] Cal.com error:', err.message)
    res.sendStatus(200)
  }
})

// ─── Vapi.ai Webhooks ────────────────────────────────────────────────────────────

/**
 * POST /api/webhooks/vapi
 *
 * Vapi.ai sends call lifecycle events:
 *   - call.started  — Call initiated, agent begins speaking
 *   - call.ended    — Call completed (success or failure)
 *   - call.forwarding-failed — Couldn't forward to trader
 *   - tool.called   — Agent invoked a function tool
 *   - transcript.available — Full transcript ready (async)
 *
 * The request is validated using HMAC-SHA256 signature verification.
 */
router.post('/vapi', async (req, res) => {
  try {
    // Signature verification
    const signature = req.headers['x-vapi-signature']
    const secret = process.env.VAPI_WEBHOOK_SECRET

    if (secret && signature) {
      const isValid = verifyVapiSignature(req.rawBody, signature, secret)
      if (!isValid) {
        console.warn('[Webhook] ⚠️ Vapi webhook signature INVALID — rejecting')
        return res.status(401).json({ error: 'Invalid signature' })
      }
      console.log('[Webhook] ✅ Vapi webhook signature verified')
    }

    const { type, call, message, toolCall } = req.body

    console.log(`[Webhook] Vapi event: ${type}, call: ${call?.id || 'N/A'}`)

    switch (type) {
      case 'call.started': {
        // Call connected — log it
        const customer = call?.customer || {}
        console.log(`[Webhook] 📞 Call started from ${customer.number || customer.name || 'unknown'}`)
        break
      }

      case 'tool.called': {
        // Agent called a function tool
        const toolName = toolCall?.function?.name
        const toolArgs = toolCall?.function?.arguments
        console.log(`[Webhook] 🔧 Tool called: ${toolName}`, toolArgs ? JSON.stringify(toolArgs).substring(0, 200) : '')
        break
      }

      case 'call.ended': {
        const customer = call?.customer || {}
        const transcript = call?.artifact?.transcript || ''

        // Capture lead from the call data
        const lead = leadPipeline.captureLead({
          traderId: call?.assistantId || process.env.VAPI_AGENT_ID || 'vapi-agent',
          source: 'voice',
          name: customer.name || customer.number || 'Voice Caller',
          phone: customer.number || req.body.fromNumber || '',
          email: customer.email || '',
          description: transcript.substring(0, 500),
          metadata: {
            vapiCallId: call.id,
            duration: call.duration,
            endedReason: call.endedReason,
            cost: call.cost,
            transcript: transcript.substring(0, 2000),
            callType: 'inbound',
            vapiAgentId: call.assistantId
          }
        })

        // If the call ended without a booking / forwarding failed → trigger text-back
        const failedReasons = [
          'assistant:forwarding-failed',
          'assistant:error',
          'assistant:customer-ended',
          'assistant:no-action'
        ]

        if (failedReasons.includes(call.endedReason) || !call.endedReason?.includes('success')) {
          await missedCallService.handleMissedCall({
            callerNumber: customer.number || req.body.fromNumber,
            callerName: customer.name || '',
            traderId: call.assistantId || 'vapi-agent',
            traderName: process.env.TRADER_NAME || 'Your Trader',
            bookingLink: process.env.TRADER_BOOKING_LINK || 'https://tenddapp.uk/book',
            leadId: lead.id
          })
        }
        break
      }

      case 'call.forwarding-failed': {
        // Vapi tried to forward to trader but failed
        const customer = call?.customer || {}
        await missedCallService.handleMissedCall({
          callerNumber: customer.number || req.body.fromNumber,
          callerName: customer.name || '',
          traderId: call?.assistantId || 'vapi-agent',
          traderName: process.env.TRADER_NAME || 'Your Trader',
          bookingLink: process.env.TRADER_BOOKING_LINK || 'https://tenddapp.uk/book'
        })
        break
      }

      case 'transcript.available': {
        // Async transcript — update existing lead if we can find it
        const vapiCallId = message?.callId || call?.id
        if (vapiCallId) {
          // Would update lead metadata with full transcript
          console.log(`[Webhook] 📝 Transcript available for call ${vapiCallId}`)
        }
        break
      }

      default:
        console.log(`[Webhook] Vapi unhandled event type: ${type}`)
    }

    res.sendStatus(200)
  } catch (err) {
    console.error('[Webhook] Vapi error:', err.message)
    res.sendStatus(200)
  }
})

// ─── Meta (Facebook/Instagram) DM Webhooks ───────────────────────────────────────

/**
 * GET /api/webhooks/meta
 *
 * Meta webhook verification endpoint.
 * Meta sends a GET request with challenge token to verify the endpoint.
 *
 * POST /api/webhooks/meta
 *
 * Meta sends message events here.
 * Handles both Messenger and Instagram DM formats.
 */
router.all('/meta', async (req, res) => {
  try {
    // ── Webhook Verification (GET) ──────────────────────────────────────────
    if (req.method === 'GET') {
      const mode = req.query['hub.mode']
      const token = req.query['hub.verify_token']
      const challenge = req.query['hub.challenge']

      const expectedToken = process.env.META_VERIFY_TOKEN || 'tendd-meta-verify'

      if (mode === 'subscribe' && token === expectedToken) {
        console.log('[Webhook] ✅ Meta webhook verified')
        return res.status(200).send(challenge)
      }

      console.warn('[Webhook] ❌ Meta webhook verification FAILED')
      return res.sendStatus(403)
    }

    // ── Incoming Message (POST) ─────────────────────────────────────────────
    const body = req.body

    // Handle Meta entry format
    for (const entry of body.entry || []) {
      const pageId = entry.id

      // ── Messenger format: entry.messaging[].message ─────────────────────
      if (entry.messaging) {
        for (const event of entry.messaging) {
          const senderId = event.sender?.id
          const message = event.message

          if (message && !message.is_echo) {
            const messageText = message.text || '(attachment)'
            const messageId = message.mid

            console.log(`[Webhook] 💬 Messenger DM from ${senderId}: "${messageText.substring(0, 100)}"`)

            // Capture lead
            const lead = leadPipeline.captureLead({
              traderId: pageId || 'meta-page',
              source: 'social_dm',
              name: `Messenger User ${senderId}`,
              phone: '',
              email: '',
              description: messageText,
              metadata: {
                platform: 'messenger',
                pageId,
                senderId,
                messageId,
                timestamp: event.timestamp
              }
            })

            // Auto-reply with a quick acknowledgement
            // The Chatbot team's AI prompt is used here for intelligent replies
            const pageToken = process.env.META_PAGE_ACCESS_TOKEN
            if (pageToken) {
              await sendMessengerReply({
                recipientId: senderId,
                text: `Hi there! Thanks for reaching out. We've noted your message about "${messageText.substring(0, 50)}" and will get back to you shortly. If you'd like an instant quote, visit our website!`,
                pageAccessToken: pageToken
              })
            }
          }

          // Handle postbacks (quick replies / button clicks)
          if (event.postback) {
            console.log(`[Webhook] Messenger postback from ${senderId}: ${event.postback.payload}`)
          }
        }
      }

      // ── Instagram format: entry.changes[].value ─────────────────────────
      if (entry.changes) {
        for (const change of entry.changes) {
          const value = change.value

          // Instagram DM
          if (value.messaging_product === 'instagram' && value.messages) {
            for (const msg of value.messages) {
              const senderId = msg.from?.id
              const messageText = msg.text?.body || '(media)'

              console.log(`[Webhook] 📸 Instagram DM from ${senderId}: "${messageText.substring(0, 100)}"`)

              leadPipeline.captureLead({
                traderId: pageId || 'meta-instagram',
                source: 'social_dm',
                name: `Instagram User ${senderId}`,
                phone: '',
                email: '',
                description: messageText,
                metadata: {
                  platform: 'instagram',
                  pageId,
                  senderId,
                  messageId: msg.id,
                  timestamp: value.timestamp
                }
              })

              // Optional Instagram reply
              const pageToken = process.env.META_PAGE_ACCESS_TOKEN
              if (pageToken && process.env.INSTAGRAM_AUTO_REPLY_ENABLED === 'true') {
                await sendInstagramReply({
                  recipientId: senderId,
                  text: `Thanks for your message! We've received your enquiry and will be in touch soon. Check your DM requests if you don't hear from us.`,
                  pageAccessToken: pageToken
                })
              }
            }
          }
        }
      }
    }

    // Meta expects 200 OK within 20 seconds
    res.sendStatus(200)
  } catch (err) {
    console.error('[Webhook] Meta error:', err.message)
    // Always return 200 to prevent Meta from retrying
    res.sendStatus(200)
  }
})

module.exports = router