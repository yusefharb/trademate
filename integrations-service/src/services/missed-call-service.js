/**
 * Missed-Call Text-Back Service
 *
 * Handles the missed-call → SMS flow:
 * 1. Trader's phone number forwards to Trademate (Twilio)
 * 2. If the call is not answered within X rings → trigger text-back
 * 3. Twilio webhook fires → we log the missed call → SMS the caller
 *
 * Also integrates with Vapi.ai voice agent for when the trader IS available:
 * - Call goes to Vapi.ai voice agent
 * - Agent screens the call, collects info
 * - If urgent/complex, Vapi transfers to trader
 * - If trader can't answer → missed-call text-back fires
 */
const { config } = require('../config')
const { store } = require('../models/data-models')
const { v4: uuidv4 } = require('uuid')
const smsService = require('./sms-service')

/**
 * Handle an incoming call that wasn't answered.
 *
 * This is the main handler called by the Twilio webhook
 * when the call forwarding is missed or the Vapi agent
 * determines the caller needs a call back.
 *
 * @param {Object} params
 * @param {string} params.callerNumber - The caller's phone number (E.164)
 * @param {string} params.callerName - Caller name if available (from Vapi or caller ID)
 * @param {string} params.traderId - The trader's ID
 * @param {string} params.traderName - The trader's business name
 * @param {string} params.bookingLink - Link to book a time slot
 * @param {string|null} params.leadId - Existing lead ID if known
 * @returns {Promise<Object>} Result of the text-back
 */
async function handleMissedCall ({ callerNumber, callerName, traderId, traderName, bookingLink, leadId }) {
  console.log(`[MissedCall] 📞 Missed call from ${callerNumber} (${callerName || 'unknown'}) for trader ${traderId}`)

  // Create a lead entry if we don't have one
  if (!leadId) {
    const lead = {
      id: uuidv4(),
      traderId,
      source: 'missed_call',
      name: callerName || 'Unknown Caller',
      phone: callerNumber,
      email: '',
      postcode: '',
      serviceRequired: '',
      description: 'Missed call - text-back sent',
      status: 'new',
      quoteId: null,
      bookingId: null,
      metadata: {
        callTime: new Date().toISOString(),
        source: 'twilio_voice'
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    store.leads.push(lead)
    leadId = lead.id
    console.log(`[MissedCall] 📋 New lead created: ${lead.id}`)
  }

  // Send the text-back SMS
  const smsResult = await smsService.sendMissedCallTextBack({
    to: callerNumber,
    customerName: callerName || 'there',
    traderName: traderName || 'Your Trader',
    bookingLink: bookingLink || 'https://trademateapp.uk/book'
  })

  return {
    leadId,
    smsSent: smsResult.success,
    messageId: smsResult.messageId
  }
}

/**
 * Generate TwiML (Twilio Markup) for call forwarding with fallback.
 *
 * This creates the Twilio voice instructions for:
 * 1. Try to ring the trader's actual phone
 * 2. If unanswered after N rings → handle missed call
 *
 * @param {Object} params
 * @param {string} params.traderPhone - The trader's real phone number
 * @param {number} params.ringTimeout - Seconds to ring before giving up (default 25)
 * @param {string} params.webhookBaseUrl - Base URL for webhooks
 * @returns {string} TwiML XML
 */
function buildForwardingTwiML ({ traderPhone, ringTimeout = 25, webhookBaseUrl }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="${ringTimeout}"
        action="${webhookBaseUrl}/api/missed-call/forward-result"
        method="POST">
    <Number>${traderPhone}</Number>
  </Dial>
  <Say>We're sorry, we couldn't reach the trader. We'll send you a text message to book a callback.</Say>
</Response>`
}

/**
 * Build TwiML for Vapi.ai voice agent forwarding.
 *
 * Call is sent to Vapi.ai first (AI voice receptionist screens the call),
 * then if the Vapi agent determines a callback is needed, it triggers the missed-call flow.
 *
 * @param {Object} params
 * @returns {string} TwiML XML
 */
function buildVapiForwardingTwiML () {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://api.vapi.ai/ws">
      <Parameter name="agentId" value="${config.vapi.agentId || '{{VAPI_AGENT_ID}}'}"/>
    </Stream>
  </Connect>
</Response>`
}

/**
 * Handle the Twilio call forwarding result.
 *
 * Called when the forward attempt completes (answered or missed).
 *
 * @param {Object} twilioParams - Twilio webhook parameters
 * @returns {Promise<Object>} Result
 */
async function handleForwardResult (twilioParams) {
  const callStatus = twilioParams.DialCallStatus || 'unknown'

  console.log(`[MissedCall] Forward result: ${callStatus} for call ${twilioParams.CallSid}`)

  if (callStatus === 'no-answer' || callStatus === 'busy' || callStatus === 'failed') {
    // The call was missed — trigger text-back
    return await handleMissedCall({
      callerNumber: twilioParams.From,
      callerName: twilioParams.CallerName || '',
      traderId: twilioParams.traderId || 'unknown',
      traderName: twilioParams.traderName || 'Your Trader',
      bookingLink: twilioParams.bookingLink || 'https://trademateapp.uk/book'
    })
  }

  // Call was answered — nothing to do
  return { answered: true, status: callStatus }
}

module.exports = {
  handleMissedCall,
  buildForwardingTwiML,
  buildVapiForwardingTwiML,
  handleForwardResult
}