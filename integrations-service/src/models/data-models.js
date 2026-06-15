/**
 * Tendd Lead & Booking Data Models
 *
 * These are the canonical data structures used across all integration services.
 * They define the schema for leads, bookings, communications, and reviews.
 *
 * In production these map to database tables (PostgreSQL via the Platform API).
 * In development they use an in-memory store.
 */

/**
 * @typedef {Object} Lead
 * @property {string} id - UUID
 * @property {string} traderId - The trader/business this lead belongs to
 * @property {string} source - Where lead came from: 'chatbot' | 'voice' | 'social_dm' | 'gmb' | 'website' | 'missed_call' | 'manual'
 * @property {string} name - Customer name
 * @property {string} phone - Customer phone number
 * @property {string} email - Customer email (optional)
 * @property {string} postcode - Customer postcode
 * @property {string} serviceRequired - What service they need
 * @property {string} description - Free-text description of the job
 * @property {string} status - 'new' | 'contacted' | 'quoted' | 'booked' | 'completed' | 'lost'
 * @property {string|null} quoteId - Reference to generated quote
 * @property {string|null} bookingId - Reference to booking if booked
 * @property {object} metadata - Extra data from source (chat transcript, voice summary, etc.)
 * @property {string} createdAt - ISO timestamp
 * @property {string} updatedAt - ISO timestamp
 */

/**
 * @typedef {Object} Booking
 * @property {string} id - UUID
 * @property {string} traderId
 * @property {string} leadId
 * @property {string} customerName
 * @property {string} customerPhone
 * @property {string} customerEmail
 * @property {string} scheduledFor - ISO datetime string
 * @property {string} duration - Minutes (e.g., '120')
 * @property {string} serviceType
 * @property {string} address
 * @property {string} postcode
 * @property {string} notes
 * @property {string} status - 'confirmed' | 'reminded' | 'in_progress' | 'completed' | 'cancelled'
 * @property {string} calendarProvider - 'calendly' | 'calcom'
 * @property {string|null} calendarEventId - ID from the calendar provider
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} Communication
 * @property {string} id - UUID
 * @property {string} leadId
 * @property {string} traderId
 * @property {string} type - 'sms' | 'email' | 'call'
 * @property {string} direction - 'outbound' | 'inbound'
 * @property {string} template - Which template was used (e.g., 'confirmation', 'reminder', 'follow_up', 'missed_call')
 * @property {string} body - Message content
 * @property {string} status - 'sent' | 'delivered' | 'failed'
 * @property {string} createdAt
 */

/**
 * @typedef {Object} ReviewRequest
 * @property {string} id - UUID
 * @property {string} bookingId
 * @property {string} leadId
 * @property {string} traderId
 * @property {string} phoneNumber
 * @property {string} reviewLink - The Google review link sent
 * @property {string} status - 'sent' | 'clicked' | 'reviewed' | 'failed'
 * @property {string} sentAt
 * @property {string|null} reviewedAt
 */

// --- In-memory store for development ---
class MemoryStore {
  constructor () {
    this.leads = []
    this.bookings = []
    this.communications = []
    this.reviewRequests = []
  }
}

// Singleton store instance
const store = new MemoryStore()

module.exports = { store, MemoryStore }