/**
 * Twilio SMS Service
 *
 * Handles all SMS messaging:
 * - Job confirmation after booking
 * - 24-hour reminder before appointment
 * - Follow-up thank-you after completion
 * - Missed-call text-back
 * - Review request after job completion
 * - Inbound SMS webhook processing
 */
const { config } = require('../config')
const { store } = require('../models/data-models')
const { v4: uuidv4 } = require('uuid')

let twilioClient = null

/**
 * Initialise the Twilio client.
 * Must be called before sending messages.
 */
function init () {
  if (!config.twilio.accountSid || !config.twilio.authToken) {
    console.warn('[TwilioSMS] Twilio not configured — SMS will be logged only')
    return null
  }

  try {
    twilioClient = require('twilio')(
      config.twilio.accountSid,
      config.twilio.authToken
    )
    console.log('[TwilioSMS] Twilio client initialised')
  } catch (err) {
    console.error('[TwilioSMS] Failed to initialise Twilio:', err.message)
  }

  return twilioClient
}

/**
 * Send an SMS message.
 *
 * @param {Object} params
 * @param {string} params.to - E.164 phone number
 * @param {string} params.body - Message text
 * @param {string} params.leadId - Associated lead (for logging)
 * @param {string} params.traderId - Associated trader
 * @param {string} params.template - Template identifier
 * @returns {Promise<Object>} { success, messageId, status }
 */
async function sendSMS ({ to, body, leadId, traderId, template }) {
  const msgId = uuidv4()

  // Log the communication regardless
  const comm = {
    id: msgId,
    leadId: leadId || null,
    traderId: traderId || null,
    type: 'sms',
    direction: 'outbound',
    template: template || 'custom',
    body,
    status: 'sent',
    createdAt: new Date().toISOString()
  }
  store.communications.push(comm)

  if (!twilioClient) {
    console.log(`[TwilioSMS] 📱 SMS would send to ${to}: "${body.substring(0, 60)}..."`)
    return { success: true, messageId: msgId, status: 'logged_only' }
  }

  try {
    const message = await twilioClient.messages.create({
      from: config.twilio.phoneNumber,
      to,
      body
    })

    comm.status = 'delivered'
    comm.metadata = { twilioSid: message.sid }

    console.log(`[TwilioSMS] ✅ Sent to ${to} (SID: ${message.sid})`)
    return { success: true, messageId: msgId, status: message.status, twilioSid: message.sid }
  } catch (err) {
    comm.status = 'failed'
    comm.metadata = { error: err.message }

    console.error(`[TwilioSMS] ❌ Failed to send to ${to}:`, err.message)
    return { success: false, messageId: msgId, status: 'failed', error: err.message }
  }
}

// ─── Template Messages ──────────────────────────────────────────────────────────

/**
 * Send booking confirmation SMS.
 */
async function sendBookingConfirmation ({ to, customerName, traderName, scheduledFor, serviceType }) {
  const date = new Date(scheduledFor)
  const day = date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  const body = `Hi ${customerName}, your ${serviceType} appointment with ${traderName} is confirmed for ${day} at ${time}. We'll send a reminder 24h before. Reply C to confirm or call us to reschedule.`

  return sendSMS({ to, body, template: 'booking_confirmation' })
}

/**
 * Send 24-hour reminder SMS.
 */
async function sendReminder ({ to, customerName, traderName, scheduledFor, serviceType }) {
  const date = new Date(scheduledFor)
  const day = date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  const body = `Reminder: ${traderName} will be at your property ${day} at ${time} for ${serviceType}. Reply C to confirm or R to reschedule.`

  return sendSMS({ to, body, template: 'booking_reminder' })
}

/**
 * Send follow-up thank-you after job completion.
 */
async function sendThankYou ({ to, customerName, traderName }) {
  const body = `Hi ${customerName}, thank you for choosing ${traderName}! We hope you're happy with the work. If you have a moment, please leave a Google review: [review link coming shortly].`

  return sendSMS({ to, body, template: 'follow_up' })
}

/**
 * Send Google review request (separate from thank-you).
 */
async function sendReviewRequest ({ to, customerName, traderName, reviewLink }) {
  const body = `Hi ${customerName}, could you spare 30 seconds to review ${traderName}? Your feedback helps us improve. ${reviewLink}`

  return sendSMS({ to, body, template: 'review_request' })
}

/**
 * Send missed-call text-back.
 */
async function sendMissedCallTextBack ({ to, customerName, traderName, bookingLink }) {
  const body = `Hi ${customerName}, ${traderName} is on a job right now. Book a callback at a time that suits you: ${bookingLink}`

  return sendSMS({ to, body, template: 'missed_call' })
}

/**
 * Send generic booking link to a prospect.
 */
async function sendBookingLink ({ to, customerName, traderName, bookingLink }) {
  const body = `Hi ${customerName}, ${traderName} can see you soon. Pick a time that works: ${bookingLink}`

  return sendSMS({ to, body, template: 'booking_link' })
}

// ─── Inbound SMS Webhook Handler ────────────────────────────────────────────────

/**
 * Handle an incoming SMS webhook from Twilio.
 *
 * Supports:
 * - "C" → confirm booking
 * - "R" → reschedule request
 *
 * @param {Object} twilioParams - The POST body from Twilio
 * @returns {Promise<Object>} Response to send back to Twilio
 */
async function handleInboundSMS (twilioParams) {
  const from = twilioParams.From
  const body = (twilioParams.Body || '').trim().toUpperCase()
  const messageSid = twilioParams.MessageSid

  // Log the inbound message
  store.communications.push({
    id: uuidv4(),
    leadId: null, // would be resolved from the phone number
    traderId: null,
    type: 'sms',
    direction: 'inbound',
    template: 'inbound_reply',
    body: twilioParams.Body,
    status: 'received',
    createdAt: new Date().toISOString()
  })

  console.log(`[TwilioSMS] 📨 Inbound from ${from}: "${twilioParams.Body}"`)

  if (body === 'C') {
    return {
      success: true,
      action: 'confirmed',
      reply: 'Thanks for confirming! We look forward to seeing you.'
    }
  }

  if (body === 'R') {
    return {
      success: true,
      action: 'reschedule_requested',
      reply: 'Please call us to reschedule or visit your booking link.'
    }
  }

  // Default response for unrecognised messages
  return {
    success: true,
    action: 'unrecognised',
    reply: "Thanks for your message. Reply C to confirm your appointment or R to reschedule."
  }
}

module.exports = {
  init,
  sendSMS,
  sendBookingConfirmation,
  sendReminder,
  sendThankYou,
  sendReviewRequest,
  sendMissedCallTextBack,
  sendBookingLink,
  handleInboundSMS
}