/**
 * Calendar Booking Service
 *
 * Integrates with Calendly or Cal.com to:
 * - Fetch available time slots
 * - Create bookings from accepted quotes
 * - Handle booking webhooks (created, cancelled)
 * - Sync bookings to the Trademate platform
 *
 * Supports both Calendly (managed) and Cal.com (self-hosted) as providers.
 */
const axios = require('axios')
const { config } = require('../config')
const { store } = require('../models/data-models')
const { v4: uuidv4 } = require('uuid')
const smsService = require('./sms-service')

// ─── Provider Detection ──────────────────────────────────────────────────────────

function getProvider () {
  return config.booking.provider || 'calendly'
}

function isCalendly () {
  return getProvider() === 'calendly'
}

function isCalcom () {
  return getProvider() === 'calcom'
}

// ─── Calendly API ────────────────────────────────────────────────────────────────

/**
 * Get Calendly API headers.
 */
function calendlyHeaders () {
  return {
    Authorization: `Bearer ${config.booking.calendly.apiKey}`,
    'Content-Type': 'application/json'
  }
}

/**
 * Fetch available time slots from a Calendly event type.
 *
 * @param {string} eventTypeUri - Calendly event type URI (e.g., https://api.calendly.com/event_types/xxxx)
 * @param {string} startTime - ISO start of query range
 * @param {string} endTime - ISO end of query range
 * @returns {Promise<Array>} Available slots
 */
async function calendlyGetAvailability (eventTypeUri, startTime, endTime) {
  try {
    const response = await axios.get(
      `https://api.calendly.com/event_type_available_times`,
      {
        headers: calendlyHeaders(),
        params: {
          event_type: eventTypeUri,
          start_time: startTime,
          end_time: endTime
        }
      }
    )

    return response.data.collection.map(slot => ({
      startTime: slot.start_time,
      endTime: slot.end_time,
      status: slot.status
    }))
  } catch (err) {
    console.error('[Calendar] Calendly availability error:', err.response?.data || err.message)
    throw err
  }
}

/**
 * Create a Calendly booking (scheduling link).
 * In practice, we send the customer to the scheduling page.
 *
 * @param {string} eventTypeUri
 * @param {Object} invitee - { name, email, phone }
 * @returns {Promise<Object>}
 */
async function calendlyCreateBooking (eventTypeUri, invitee) {
  try {
    const response = await axios.post(
      `https://api.calendly.com/scheduling_links`,
      {
        max_event_count: 1,
        owner: eventTypeUri,
        owner_type: 'EventType',
        invitee: {
          name: invitee.name,
          email: invitee.email || `${invitee.phone}@trademate.app`
        }
      },
      { headers: calendlyHeaders() }
    )

    return {
      bookingUrl: response.data.resource.booking_url,
      status: 'pending'
    }
  } catch (err) {
    console.error('[Calendar] Calendly booking error:', err.response?.data || err.message)
    throw err
  }
}

// ─── Cal.com API ─────────────────────────────────────────────────────────────────

function calcomHeaders () {
  return {
    Authorization: `Bearer ${config.booking.calcom.apiKey}`,
    'Content-Type': 'application/json'
  }
}

/**
 * Get available slots from Cal.com.
 *
 * @param {number} eventTypeId
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @returns {Promise<Object>} Slots keyed by date
 */
async function calcomGetAvailability (eventTypeId, startDate, endDate) {
  try {
    const response = await axios.get(
      `${config.booking.calcom.baseUrl}/v1/slots`,
      {
        headers: calcomHeaders(),
        params: {
          eventTypeId,
          startTime: startDate,
          endTime: endDate
        }
      }
    )

    return response.data.slots
  } catch (err) {
    console.error('[Calendar] Cal.com availability error:', err.response?.data || err.message)
    throw err
  }
}

/**
 * Create a booking in Cal.com.
 *
 * @param {Object} params
 * @param {number} params.eventTypeId
 * @param {string} params.start - ISO datetime
 * @param {Object} params.attendee - { name, email, timeZone }
 * @param {Object} params.metadata - Optional custom fields
 * @returns {Promise<Object>}
 */
async function calcomCreateBooking ({ eventTypeId, start, attendee, metadata }) {
  try {
    const response = await axios.post(
      `${config.booking.calcom.baseUrl}/v1/bookings`,
      {
        eventTypeId,
        start,
        attendee,
        metadataFields: metadata || {},
        responses: {
          name: attendee.name,
          email: attendee.email
        }
      },
      { headers: calcomHeaders() }
    )

    return {
      bookingId: response.data.booking.id,
      status: response.data.booking.status,
      startTime: response.data.booking.startTime,
      endTime: response.data.booking.endTime
    }
  } catch (err) {
    console.error('[Calendar] Cal.com booking error:', err.response?.data || err.message)
    throw err
  }
}

// ─── Unified Booking Service ─────────────────────────────────────────────────────

/**
 * Get available time slots.
 *
 * @param {Object} params
 * @param {string} params.traderId
 * @param {number} params.daysAhead - How many days to look ahead (default 14)
 * @returns {Promise<Array>} Available slots
 */
async function getAvailableSlots ({ traderId, daysAhead = 14 }) {
  const now = new Date()
  const end = new Date(now)
  end.setDate(end.getDate() + daysAhead)

  if (isCalendly()) {
    // For Calendly, we'd need the event type URI per trader
    // This would be stored per-trader in the database
    console.log('[Calendar] Calendly: availability lookup requires event_type_uri per trader')
    return []
  }

  if (isCalcom()) {
    const startDate = now.toISOString().split('T')[0]
    const endDate = end.toISOString().split('T')[0]
    const eventTypeId = config.booking.calcom.eventTypeId

    if (!eventTypeId) {
      console.warn('[Calendar] Cal.com eventTypeId not configured')
      return []
    }

    const slots = await calcomGetAvailability(eventTypeId, startDate, endDate)
    return slots
  }

  return []
}

/**
 * Create a booking when a customer accepts a quote from the chatbot.
 *
 * @param {Object} params
 * @param {string} params.leadId - Lead UUID
 * @param {string} params.traderId - Trader UUID
 * @param {string} params.customerName
 * @param {string} params.customerPhone
 * @param {string} params.customerEmail
 * @param {string} params.scheduledFor - ISO datetime
 * @param {string} params.serviceType
 * @param {string} params.address
 * @param {string} params.postcode
 * @param {string} params.notes
 * @returns {Promise<Object>} The created/confirmed Booking
 */
async function createBooking (params) {
  const {
    leadId, traderId, customerName, customerPhone, customerEmail,
    scheduledFor, serviceType, address, postcode, notes
  } = params

  // Create local booking record
  const booking = {
    id: uuidv4(),
    traderId,
    leadId,
    customerName,
    customerPhone,
    customerEmail: customerEmail || '',
    scheduledFor,
    duration: '120', // default 2h, adjustable
    serviceType,
    address: address || '',
    postcode: postcode || '',
    notes: notes || '',
    status: 'confirmed',
    calendarProvider: getProvider(),
    calendarEventId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }

  // Push to calendar provider
  try {
    if (isCalendly()) {
      // Get the trader's event type URI (from their config)
      const eventTypeUri = `https://api.calendly.com/event_types/${traderId}` // placeholder
      const result = await calendlyCreateBooking(eventTypeUri, {
        name: customerName,
        email: customerEmail || `${customerPhone}@trademate.app`
      })

      booking.calendarEventId = result.bookingUrl
      booking.status = 'confirmed'
    }

    if (isCalcom()) {
      const result = await calcomCreateBooking({
        eventTypeId: config.booking.calcom.eventTypeId,
        start: scheduledFor,
        attendee: {
          name: customerName,
          email: customerEmail || `${customerPhone}@trademate.app`,
          timeZone: 'Europe/London'
        },
        metadata: { leadId, traderId, serviceType }
      })

      booking.calendarEventId = result.bookingId.toString()
      booking.status = 'confirmed'
    }
  } catch (err) {
    console.error('[Calendar] Failed to sync booking to provider:', err.message)
    // Booking is still recorded locally
    booking.status = 'confirmed_local_only'
  }

  // Store locally
  store.bookings.push(booking)

  // Update the lead with booking reference
  const lead = store.leads.find(l => l.id === leadId)
  if (lead) {
    lead.bookingId = booking.id
    lead.status = 'booked'
    lead.updatedAt = new Date().toISOString()
  }

  // Send confirmation SMS
  await smsService.sendBookingConfirmation({
    to: customerPhone,
    customerName,
    traderName: 'Your Trader', // Will be replaced with actual trader name
    scheduledFor,
    serviceType
  })

  console.log('[Calendar] ✅ Booking created:', booking.id)
  return booking
}

/**
 * Cancel a booking.
 */
async function cancelBooking (bookingId) {
  const booking = store.bookings.find(b => b.id === bookingId)
  if (!booking) {
    throw new Error(`Booking not found: ${bookingId}`)
  }

  booking.status = 'cancelled'
  booking.updatedAt = new Date().toISOString()

  console.log('[Calendar] ❌ Booking cancelled:', bookingId)
  return booking
}

/**
 * Mark a booking as completed.
 */
async function completeBooking (bookingId) {
  const booking = store.bookings.find(b => b.id === bookingId)
  if (!booking) {
    throw new Error(`Booking not found: ${bookingId}`)
  }

  booking.status = 'completed'
  booking.updatedAt = new Date().toISOString()

  // Update the lead
  const lead = store.leads.find(l => l.id === booking.leadId)
  if (lead) {
    lead.status = 'completed'
    lead.updatedAt = new Date().toISOString()
  }

  console.log('[Calendar] ✅ Booking completed:', bookingId)

  return booking
}

// ─── Webhook Handlers ────────────────────────────────────────────────────────────

/**
 * Handle a Calendly webhook event.
 */
async function handleCalendlyWebhook (payload) {
  const event = payload.event
  console.log('[Calendar] Calendly webhook:', event)

  // Calendly sends: invitee.created, invitee.cancelled, etc.
  if (event === 'invitee.created') {
    const invitee = payload.payload.invitee
    const scheduledEvent = payload.payload.event

    const booking = {
      id: uuidv4(),
      traderId: null, // Would be resolved from the event type
      leadId: null,
      customerName: invitee.name,
      customerPhone: invitee.phone || '',
      customerEmail: invitee.email,
      scheduledFor: scheduledEvent.start_time,
      duration: String(scheduledEvent.duration || 120),
      serviceType: scheduledEvent.name || 'General',
      address: '',
      postcode: '',
      notes: invitee.notes || '',
      status: 'confirmed',
      calendarProvider: 'calendly',
      calendarEventId: scheduledEvent.uri,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    store.bookings.push(booking)
    return booking
  }

  if (event === 'invitee.cancelled') {
    const invitee = payload.payload.invitee
    const booking = store.bookings.find(b =>
      b.customerEmail === invitee.email && b.status === 'confirmed'
    )
    if (booking) {
      booking.status = 'cancelled'
      booking.updatedAt = new Date().toISOString()
    }
    return { cancelled: true }
  }

  return { event }
}

module.exports = {
  getProvider,
  getAvailableSlots,
  createBooking,
  cancelBooking,
  completeBooking,
  handleCalendlyWebhook,
  calendlyGetAvailability,
  calcomGetAvailability,
  calcomCreateBooking
}