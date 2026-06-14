/**
 * Trademate Integrations Service — Main Entry Point
 *
 * Express server that exposes:
 * - Webhook endpoints (Twilio, Calendly, Cal.com, Vapi, Meta)
 * - Internal API for lead/booking operations
 * - Review tracking endpoints
 *
 * The Platform team's API server communicates with this service
 * to trigger SMS, create bookings, and sync GMB.
 */
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const { config, validate } = require('./config')
const webhookRouter = require('./webhooks/router')
const leadPipeline = require('./services/lead-pipeline')
const calendarService = require('./services/calendar-service')
const quoteService = require('./services/quote-service')
const reviewService = require('./services/review-service')
const missedCallService = require('./services/missed-call-service')
const smsService = require('./services/sms-service')

const app = express()

// ─── Middleware ───────────────────────────────────────────────────────────────────

app.use(helmet())
app.use(cors())

// Raw body capture for Vapi.ai & Meta webhook signature verification
// Must be registered BEFORE the JSON/urlencoded parsers
app.use((req, res, next) => {
  if (req.path.startsWith('/api/webhooks/vapi') || req.path.startsWith('/api/webhooks/meta')) {
    let data = ''
    req.on('data', chunk => { data += chunk })
    req.on('end', () => {
      req.rawBody = data
      next()
    })
  } else {
    next()
  }
})

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Request logging
app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.path}`)
  next()
})

// ─── Webhook Routes ──────────────────────────────────────────────────────────────

app.use('/api/webhooks', webhookRouter)

// ─── Internal API Routes ─────────────────────────────────────────────────────────

/**
 * POST /api/leads
 *
 * Capture a new lead (used by platform API / chatbot).
 */
app.post('/api/leads', (req, res) => {
  try {
    const lead = leadPipeline.captureLead(req.body)
    res.status(201).json(lead)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

/**
 * POST /api/quote
 *
 * Generate a conversational quote using AI.
 */
app.post('/api/quote', async (req, res) => {
  try {
    const { jobDetails, pricingRules } = req.body
    const quote = await quoteService.generateQuote(jobDetails, pricingRules)
    res.json({ quote })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/leads/:traderId
 *
 * Get all leads for a trader.
 */
app.get('/api/leads/:traderId', (req, res) => {
  const { status, source, limit } = req.query
  const leads = leadPipeline.getLeads(req.params.traderId, { status, source, limit: limit ? parseInt(limit) : undefined })
  res.json({ leads, total: leads.length })
})

/**
 * GET /api/leads/:traderId/stats
 *
 * Get lead statistics for a trader.
 */
app.get('/api/leads/:traderId/stats', (req, res) => {
  const stats = leadPipeline.getLeadStats(req.params.traderId)
  const metrics = leadPipeline.getConversionMetrics(req.params.traderId)
  res.json({ stats, metrics })
})

/**
 * POST /api/bookings
 *
 * Create a booking from an accepted quote.
 */
app.post('/api/bookings', async (req, res) => {
  try {
    const booking = await calendarService.createBooking(req.body)
    res.status(201).json(booking)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

/**
 * POST /api/bookings/:id/complete
 *
 * Mark a booking as completed (triggers follow-up + review request).
 */
app.post('/api/bookings/:id/complete', async (req, res) => {
  try {
    const booking = await calendarService.completeBooking(req.params.id)

    // Send thank-you SMS
    await smsService.sendThankYou({
      to: booking.customerPhone,
      customerName: booking.customerName,
      traderName: 'Your Trader'
    })

    // Trigger review request
    const reviewRequest = await reviewService.requestReview({
      bookingId: booking.id,
      leadId: booking.leadId,
      traderId: booking.traderId,
      customerName: booking.customerName,
      customerPhone: booking.customerPhone,
      placeId: req.body.placeId || null
    })

    res.json({ booking, reviewRequest })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

/**
 * POST /api/bookings/:id/cancel
 *
 * Cancel a booking.
 */
app.post('/api/bookings/:id/cancel', async (req, res) => {
  try {
    const booking = await calendarService.cancelBooking(req.params.id)
    res.json(booking)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

/**
 * POST /api/sms/send
 *
 * Send a custom SMS.
 */
app.post('/api/sms/send', async (req, res) => {
  try {
    const result = await smsService.sendSMS(req.body)
    res.json(result)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

/**
 * POST /api/sms/send-confirmation
 *
 * Send a booking confirmation SMS.
 */
app.post('/api/sms/send-confirmation', async (req, res) => {
  try {
    const result = await smsService.sendBookingConfirmation(req.body)
    res.json(result)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

/**
 * POST /api/sms/send-reminder
 *
 * Send a 24h reminder SMS.
 */
app.post('/api/sms/send-reminder', async (req, res) => {
  try {
    const result = await smsService.sendReminder(req.body)
    res.json(result)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

/**
 * POST /api/missed-call
 *
 * Trigger a missed-call text-back (manual or automated).
 */
app.post('/api/missed-call', async (req, res) => {
  try {
    const result = await missedCallService.handleMissedCall(req.body)
    res.json(result)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

/**
 * GET /api/reviews/track/:requestId
 *
 * Track a review link click (redirects to Google review).
 */
app.get('/api/reviews/track/:requestId', async (req, res) => {
  try {
    const reviewRequest = await reviewService.trackClick(req.params.requestId)
    res.redirect(302, reviewRequest.reviewLink)
  } catch (err) {
    res.status(404).json({ error: err.message })
  }
})

/**
 * GET /api/reviews/trader/:traderId/stats
 *
 * Get review stats for a trader.
 */
app.get('/api/reviews/trader/:traderId/stats', (req, res) => {
  const stats = reviewService.getTraderReviewStats(req.params.traderId)
  res.json(stats)
})

/**
 * POST /api/gmb/sync-hours
 *
 * Sync business hours to Google Business Profile.
 */
app.post('/api/gmb/sync-hours', async (req, res) => {
  try {
    const gmbService = require('./services/gmb-service')
    const { locationName, schedule } = req.body
    const regularHours = gmbService.buildRegularHours(schedule)
    const result = await gmbService.updateBusinessHours(locationName, regularHours)
    res.json(result)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

/**
 * POST /api/gmb/create-post
 *
 * Create a post on Google Business Profile.
 */
app.post('/api/gmb/create-post', async (req, res) => {
  try {
    const gmbService = require('./services/gmb-service')
    const { locationName, post } = req.body
    const result = await gmbService.createPost(locationName, post)
    res.json(result)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// ─── Availability endpoint ───────────────────────────────────────────────────────

/**
 * GET /api/availability
 *
 * Get available time slots (for chatbot).
 */
app.get('/api/availability', async (req, res) => {
  try {
    const slots = await calendarService.getAvailableSlots({
      traderId: req.query.traderId,
      daysAhead: parseInt(req.query.daysAhead) || 14
    })
    res.json({ slots })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// ─── Reminder Cron (manual trigger) ──────────────────────────────────────────────

/**
 * POST /api/reminders/trigger
 *
 * Manually trigger sending 24h reminders for upcoming bookings.
 * In production, this runs on a cron schedule.
 */
app.post('/api/reminders/trigger', async (req, res) => {
  try {
    const now = new Date()
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const { store } = require('./models/data-models')
    const upcomingBookings = store.bookings.filter(b => {
      if (b.status !== 'confirmed') return false
      const bookingDate = new Date(b.scheduledFor)
      // Check if booking is roughly 24h from now
      const diffHours = (bookingDate - now) / (1000 * 60 * 60)
      return diffHours >= 20 && diffHours <= 28
    })

    const results = []
    for (const booking of upcomingBookings) {
      const result = await smsService.sendReminder({
        to: booking.customerPhone,
        customerName: booking.customerName,
        traderName: 'Your Trader',
        scheduledFor: booking.scheduledFor,
        serviceType: booking.serviceType
      })
      results.push({ bookingId: booking.id, result })
    }

    res.json({ remindersSent: results.length, results })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Start Server ────────────────────────────────────────────────────────────────

async function start () {
  // Validate config (warn but don't block in dev)
  const missing = validate()
  if (missing.length > 0) {
    console.warn(`[Startup] Missing config values: ${missing.join(', ')}. Some features will be disabled.`)
  }

  // Initialise services
  smsService.init()

  // Try to init GMB (non-blocking)
  try {
    const gmbService = require('./services/gmb-service')
    await gmbService.init()
  } catch (err) {
    console.warn('[Startup] GMB init skipped:', err.message)
  }

  app.listen(config.port, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════════╗
║        Trademate Integrations Service        ║
║──────────────────────────────────────────────║
║  Status:  ✅ Running                        ║
║  Port:    ${String(config.port).padEnd(33)}║
║  Env:     ${config.nodeEnv.padEnd(33)}║
║  Calendar: ${config.booking.provider.padEnd(31)}║
║  SMS:     ${config.twilio.accountSid ? '✅ Configured' : '⚠️  Not configured'.padEnd(23)}║
║  GMB:     ${config.gmb.clientId ? '✅ Configured' : '⚠️  Not configured'.padEnd(23)}║
╚══════════════════════════════════════════════╝
    `)
  })
}

start().catch(err => {
  console.error('[Startup] Fatal error:', err)
  process.exit(1)
})
