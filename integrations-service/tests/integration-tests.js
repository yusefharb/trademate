/**
 * Integration service tests using Node.js built-in test runner.
 *
 * Run: node --test tests/integration-tests.js
 */
const { describe, it, before, after } = require('node:test')
const assert = require('node:assert')
const express = require('express')

// ─── Lead Pipeline Tests ─────────────────────────────────────────────────────────

describe('Lead Pipeline', () => {
  const leadPipeline = require('../src/services/lead-pipeline')
  const { store } = require('../src/models/data-models')

  // Reset store before tests
  before(() => {
    store.leads = []
    store.bookings = []
    store.communications = []
    store.reviewRequests = []
  })

  it('should capture a new lead', () => {
    const lead = leadPipeline.captureLead({
      traderId: 'trader-1',
      source: 'chatbot',
      name: 'John Smith',
      phone: '+447700900001',
      email: 'john@example.com',
      postcode: 'SW1A 1AA',
      serviceRequired: 'Boiler repair',
      description: 'Boiler stopped working this morning',
      metadata: { chatTranscript: '...' }
    })

    assert.equal(lead.name, 'John Smith')
    assert.equal(lead.phone, '+447700900001')
    assert.equal(lead.source, 'chatbot')
    assert.equal(lead.status, 'new')
    assert.ok(lead.id)
    assert.equal(store.leads.length, 1)
  })

  it('should deduplicate leads by phone number', () => {
    const lead2 = leadPipeline.captureLead({
      traderId: 'trader-1',
      source: 'voice',
      name: 'John S.',
      phone: '+447700900001',
      description: 'Urgent!'
    })

    // Should have same ID as first lead
    assert.equal(lead2.id, store.leads[0].id)
    assert.equal(store.leads.length, 1)
    // Name should be updated
    assert.equal(lead2.name, 'John S.')
    // Description should be appended
    assert.ok(lead2.description.includes('Urgent!'))
  })

  it('should create separate leads for different phones', () => {
    const lead3 = leadPipeline.captureLead({
      traderId: 'trader-1',
      source: 'website',
      name: 'Jane Doe',
      phone: '+447700900002'
    })

    assert.equal(store.leads.length, 2)
    assert.notEqual(lead3.id, store.leads[0].id)
  })

  it('should filter and sort leads', () => {
    const leads = leadPipeline.getLeads('trader-1')
    assert.equal(leads.length, 2)
    assert.equal(leads[0].phone, '+447700900002') // newest first
  })

  it('should return stats', () => {
    const stats = leadPipeline.getLeadStats('trader-1')
    assert.equal(stats.total, 2)
    // First lead had source updated from 'chatbot' to 'voice' by dedup
    assert.ok(stats.bySource.voice || stats.bySource.chatbot)
    assert.ok(stats.bySource.website)
  })

  it('should calculate conversion metrics', () => {
    const metrics = leadPipeline.getConversionMetrics('trader-1')
    assert.equal(metrics.total, 2)
    assert.equal(metrics.quoted, 0)
    assert.equal(metrics.bookingRate, '0.0%')
  })
})

// ─── SMS Service Tests ───────────────────────────────────────────────────────────

describe('SMS Service', () => {
  const smsService = require('../src/services/sms-service')

  it('should log SMS when Twilio is not configured', async () => {
    const result = await smsService.sendSMS({
      to: '+447700900001',
      body: 'Test message',
      leadId: 'test-lead',
      traderId: 'test-trader',
      template: 'test'
    })

    assert.equal(result.success, true)
    assert.equal(result.status, 'logged_only')
    assert.ok(result.messageId)
  })

  it('should generate booking confirmation message', async () => {
    const result = await smsService.sendBookingConfirmation({
      to: '+447700900001',
      customerName: 'John',
      traderName: 'Ace Plumbing',
      scheduledFor: new Date(Date.now() + 86400000).toISOString(),
      serviceType: 'Boiler repair'
    })

    assert.equal(result.success, true)
    assert.ok(result.messageId)
  })

  it('should generate missed-call text-back', async () => {
    const result = await smsService.sendMissedCallTextBack({
      to: '+447700900001',
      customerName: 'John',
      traderName: 'Ace Plumbing',
      bookingLink: 'https://plumber.tenddapp.uk/book'
    })

    assert.equal(result.success, true)
    assert.ok(result.status) // 'logged_only' since no Twilio configured
  })

  it('should handle inbound C (confirm) reply', async () => {
    const result = await smsService.handleInboundSMS({
      From: '+447700900001',
      Body: 'C',
      MessageSid: 'SM123'
    })

    assert.equal(result.action, 'confirmed')
  })

  it('should handle inbound R (reschedule) reply', async () => {
    const result = await smsService.handleInboundSMS({
      From: '+447700900001',
      Body: 'R',
      MessageSid: 'SM456'
    })

    assert.equal(result.action, 'reschedule_requested')
  })
})

// ─── Missed Call Service Tests ───────────────────────────────────────────────────

describe('Missed Call Service', () => {
  const missedCallService = require('../src/services/missed-call-service')
  const { store } = require('../src/models/data-models')

  before(() => {
    store.leads = []
    store.communications = []
  })

  it('should handle a missed call and create lead', async () => {
    const result = await missedCallService.handleMissedCall({
      callerNumber: '+447700900001',
      callerName: 'John Smith',
      traderId: 'trader-1',
      traderName: 'Ace Plumbing',
      bookingLink: 'https://plumber.tenddapp.uk/book'
    })

    assert.ok(result.leadId)
    assert.equal(result.smsSent, true)
    assert.equal(store.leads.length, 1)
    assert.equal(store.leads[0].source, 'missed_call')
  })

  it('should generate TwiML for call forwarding', () => {
    const twiml = missedCallService.buildForwardingTwiML({
      traderPhone: '+447700900100',
      webhookBaseUrl: 'https://integrations.tenddapp.uk'
    })

    assert.ok(twiml.includes('<Dial'))
    assert.ok(twiml.includes('+447700900100'))
    assert.ok(twiml.includes('/api/missed-call/forward-result'))
  })

  it('should generate Vapi forwarding TwiML', () => {
    const twiml = missedCallService.buildVapiForwardingTwiML()
    assert.ok(twiml.includes('vapi.ai'))
    assert.ok(twiml.includes('<Connect>'))
  })
})

// ─── Calendar Service Tests ──────────────────────────────────────────────────────

describe('Calendar Service', () => {
  const calendarService = require('../src/services/calendar-service')
  const { store } = require('../src/models/data-models')

  before(() => {
    store.bookings = []
    store.leads = []
  })

  it('should create a booking record', async () => {
    // First create a lead
    const leadPipeline = require('../src/services/lead-pipeline')
    leadPipeline.captureLead({
      traderId: 'trader-1',
      source: 'chatbot',
      name: 'John Smith',
      phone: '+447700900001',
      serviceRequired: 'Boiler repair'
    })

    const booking = await calendarService.createBooking({
      leadId: store.leads[0].id,
      traderId: 'trader-1',
      customerName: 'John Smith',
      customerPhone: '+447700900001',
      customerEmail: 'john@example.com',
      scheduledFor: new Date(Date.now() + 86400000 * 3).toISOString(),
      serviceType: 'Boiler repair',
      address: '10 Downing St',
      postcode: 'SW1A 1AA',
      notes: 'Back boiler'
    })

    assert.ok(booking.id)
    // Without Calendly configured, booking is confirmed locally
    assert.ok(['confirmed', 'confirmed_local_only'].includes(booking.status))
    assert.equal(booking.leadId, store.leads[0].id)

    // Lead should be updated
    assert.equal(store.leads[0].status, 'booked')
    assert.equal(store.leads[0].bookingId, booking.id)
  })

  it('should complete a booking', async () => {
    const booking = await calendarService.completeBooking(store.bookings[0].id)
    assert.equal(booking.status, 'completed')
  })

  it('should cancel a booking', async () => {
    const leadPipeline = require('../src/services/lead-pipeline')
    leadPipeline.captureLead({
      traderId: 'trader-1',
      source: 'chatbot',
      name: 'Jane Doe',
      phone: '+447700900002'
    })

    const booking = await calendarService.createBooking({
      leadId: store.leads[1].id,
      traderId: 'trader-1',
      customerName: 'Jane Doe',
      customerPhone: '+447700900002',
      scheduledFor: new Date(Date.now() + 86400000).toISOString(),
      serviceType: 'Gas check'
    })

    const cancelled = await calendarService.cancelBooking(booking.id)
    assert.equal(cancelled.status, 'cancelled')
  })
})

// ─── Review Service Tests ────────────────────────────────────────────────────────

describe('Review Management', () => {
  const reviewService = require('../src/services/review-service')
  const { store } = require('../src/models/data-models')

  before(() => {
    store.reviewRequests = []
    store.leads = []
    store.bookings = []
  })

  it('should create a review request', async () => {
    const request = await reviewService.requestReview({
      bookingId: 'booking-1',
      leadId: 'lead-1',
      traderId: 'trader-1',
      customerName: 'John Smith',
      customerPhone: '+447700900001',
      placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4'
    })

    assert.ok(request.id)
    assert.equal(request.status, 'sent')
    assert.ok(request.reviewLink.includes('google.com'))
    assert.equal(store.reviewRequests.length, 1)
  })

  it('should track a click', async () => {
    const tracked = await reviewService.trackClick(store.reviewRequests[0].id)
    assert.equal(tracked.status, 'clicked')
  })

  it('should return stats for a trader', () => {
    const stats = reviewService.getTraderReviewStats('trader-1')
    assert.equal(stats.total, 1)
    assert.equal(stats.sent, 0)
    assert.equal(stats.clicked, 1)
  })

  it('should generate tracking URL', () => {
    const url = reviewService.getTrackingUrl('req-123', 'https://integrations.tenddapp.uk')
    assert.ok(url.includes('/api/reviews/track/req-123'))
  })
})