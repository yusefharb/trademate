/**
 * Lead Capture Pipeline
 *
 * Central funnel that collects leads from ALL sources:
 * - Website chatbot (via platform API)
 * - Voice calls / Vapi.ai (via missed-call service)
 * - Social DMs (Meta/Facebook/Instagram)
 * - Google Business Profile
 * - Missed-call text-back
 * - Manual entry (trader adds directly)
 *
 * Every lead is normalised into the standard Lead format
 * and pushed through the same funnel.
 */
const { store } = require('../models/data-models')
const { v4: uuidv4 } = require('uuid')

/**
 * Capture a lead from any source.
 *
 * @param {Object} params
 * @param {string} params.traderId
 * @param {string} params.source - 'chatbot' | 'voice' | 'social_dm' | 'gmb' | 'website' | 'missed_call' | 'manual'
 * @param {string} params.name - Customer name
 * @param {string} params.phone - Customer phone (E.164)
 * @param {string} [params.email] - Customer email
 * @param {string} [params.postcode] - Customer postcode
 * @param {string} [params.serviceRequired] - What service they need
 * @param {string} [params.description] - Free-text job description
 * @param {Object} [params.metadata] - Source-specific extra data
 * @returns {Object} The captured lead
 */
function captureLead (params) {
  const {
    traderId, source, name, phone, email, postcode,
    serviceRequired, description, metadata = {}
  } = params

  // Validate required fields
  if (!traderId) throw new Error('traderId is required')
  if (!source) throw new Error('source is required')
  if (!phone) throw new Error('phone is required')

  // Check if this phone number already has a lead for this trader
  const existingLead = store.leads.find(
    l => l.traderId === traderId && l.phone === phone && l.status !== 'completed'
  )

  if (existingLead) {
    // Update existing lead with new info
    if (name) existingLead.name = name
    if (email) existingLead.email = email
    if (postcode) existingLead.postcode = postcode
    if (serviceRequired) existingLead.serviceRequired = serviceRequired
    if (description) existingLead.description = (existingLead.description + ' | ' + description).trim()
    existingLead.metadata = { ...existingLead.metadata, ...metadata, lastContact: new Date().toISOString() }
    existingLead.updatedAt = new Date().toISOString()

    // Update source if it's more recent/intentional
    if (source !== 'missed_call') existingLead.source = source

    console.log(`[Pipeline] 🔄 Updated existing lead ${existingLead.id} from ${source}`)
    return existingLead
  }

  // Create new lead
  const lead = {
    id: uuidv4(),
    traderId,
    source,
    name: name || 'Unknown',
    phone,
    email: email || '',
    postcode: postcode || '',
    serviceRequired: serviceRequired || '',
    description: description || '',
    status: 'new',
    quoteId: null,
    bookingId: null,
    metadata: { ...metadata, capturedAt: new Date().toISOString() },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }

  store.leads.push(lead)
  console.log(`[Pipeline] 📥 New lead captured from ${source}: ${lead.id} — ${lead.name} (${lead.phone})`)
  return lead
}

/**
 * Get all leads for a trader.
 *
 * @param {string} traderId
 * @param {Object} [filters]
 * @param {string} [filters.status] - Filter by status
 * @param {string} [filters.source] - Filter by source
 * @param {number} [filters.limit] - Max results
 * @returns {Array} Leads
 */
function getLeads (traderId, filters = {}) {
  let results = store.leads.filter(l => l.traderId === traderId)

  if (filters.status) {
    results = results.filter(l => l.status === filters.status)
  }

  if (filters.source) {
    results = results.filter(l => l.source === filters.source)
  }

  // Sort by newest first
  results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

  if (filters.limit) {
    results = results.slice(0, filters.limit)
  }

  return results
}

/**
 * Get lead statistics for a trader.
 *
 * @param {string} traderId
 * @returns {Object} Lead stats by source and status
 */
function getLeadStats (traderId) {
  const traderLeads = store.leads.filter(l => l.traderId === traderId)

  const bySource = {}
  const byStatus = {}
  const byDay = {}

  for (const lead of traderLeads) {
    // By source
    bySource[lead.source] = (bySource[lead.source] || 0) + 1

    // By status
    byStatus[lead.status] = (byStatus[lead.status] || 0) + 1

    // By day
    const day = lead.createdAt.split('T')[0]
    byDay[day] = (byDay[day] || 0) + 1
  }

  return {
    total: traderLeads.length,
    bySource,
    byStatus,
    byDay
  }
}

/**
 * Calculate conversion metrics for a trader.
 *
 * @param {string} traderId
 * @returns {Object} Conversion metrics
 */
function getConversionMetrics (traderId) {
  const traderLeads = store.leads.filter(l => l.traderId === traderId)
  const total = traderLeads.length

  if (total === 0) {
    return { total: 0, quoted: 0, booked: 0, completed: 0, conversionRate: '0%' }
  }

  const quoted = traderLeads.filter(l => l.status === 'quoted' || l.status === 'booked' || l.status === 'completed').length
  const booked = traderLeads.filter(l => l.status === 'booked' || l.status === 'completed').length
  const completed = traderLeads.filter(l => l.status === 'completed').length

  return {
    total,
    quoted,
    booked,
    completed,
    quoteRate: ((quoted / total) * 100).toFixed(1) + '%',
    bookingRate: ((booked / total) * 100).toFixed(1) + '%',
    completionRate: ((completed / total) * 100).toFixed(1) + '%'
  }
}

module.exports = {
  captureLead,
  getLeads,
  getLeadStats,
  getConversionMetrics
}