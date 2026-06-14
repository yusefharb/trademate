/**
 * Review Management Service
 *
 * Orchestrates the post-job review collection flow:
 * 1. When a booking is marked 'completed', trigger a review request
 * 2. Send an SMS with a Google review link
 * 3. Track if the customer clicked and left a review
 * 4. Report review analytics back to the trader
 */
const { store } = require('../models/data-models')
const { v4: uuidv4 } = require('uuid')
const smsService = require('./sms-service')
const gmbService = require('./gmb-service')

/**
 * Trigger a review request after a job is completed.
 *
 * @param {Object} params
 * @param {string} params.bookingId
 * @param {string} params.leadId
 * @param {string} params.traderId
 * @param {string} params.customerName
 * @param {string} params.customerPhone
 * @param {string|null} params.placeId - Google Place ID (from GMB service)
 * @returns {Promise<Object>} The review request record
 */
async function requestReview ({ bookingId, leadId, traderId, customerName, customerPhone, placeId }) {
  // Generate Google review link
  const reviewLink = placeId
    ? `https://search.google.com/local/writereview?placeid=${placeId}`
    : `https://search.google.com/local/writereview?placeid=PLACEHOLDER`

  // Create a review request record
  const reviewRequest = {
    id: uuidv4(),
    bookingId,
    leadId,
    traderId,
    phoneNumber: customerPhone,
    reviewLink,
    status: 'sent',
    sentAt: new Date().toISOString(),
    reviewedAt: null
  }

  store.reviewRequests.push(reviewRequest)

  // Send the SMS
  const result = await smsService.sendReviewRequest({
    to: customerPhone,
    customerName,
    traderName: 'Your Trader', // Would come from trader profile
    reviewLink
  })

  if (!result.success) {
    reviewRequest.status = 'failed'
  }

  console.log(`[Reviews] 📝 Review request ${reviewRequest.id}: ${result.success ? 'sent' : 'failed'}`)
  return reviewRequest
}

/**
 * Track when a customer clicks the review link.
 * This should be called via the review link tracking endpoint.
 *
 * @param {string} reviewRequestId
 */
async function trackClick (reviewRequestId) {
  const req = store.reviewRequests.find(r => r.id === reviewRequestId)
  if (!req) {
    throw new Error(`Review request not found: ${reviewRequestId}`)
  }

  if (req.status === 'sent') {
    req.status = 'clicked'
  }

  console.log(`[Reviews] 👆 Click tracked for ${reviewRequestId}`)
  return req
}

/**
 * Check if a new review has appeared on GBP and link it back.
 *
 * @param {string} locationName - GMB location resource name
 * @returns {Promise<Array>} New reviews found
 */
async function checkForNewReviews (locationName) {
  try {
    const reviews = await gmbService.listReviews(locationName)
    const allReviews = reviews.reviews || []

    // Filter for reviews that came after review requests
    const recentReviews = allReviews.filter(review => {
      const createTime = new Date(review.createTime)
      const oneWeekAgo = new Date()
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
      return createTime > oneWeekAgo
    })

    // TODO: Match review authors to sent review requests by comparing
    // review author name/email with customer data in review requests

    return recentReviews
  } catch (err) {
    console.error('[Reviews] Failed to check for new reviews:', err.message)
    return []
  }
}

/**
 * Get review request statistics for a trader.
 *
 * @param {string} traderId
 * @returns {Object} Stats
 */
function getTraderReviewStats (traderId) {
  const traderRequests = store.reviewRequests.filter(r => r.traderId === traderId)

  return {
    total: traderRequests.length,
    sent: traderRequests.filter(r => r.status === 'sent').length,
    clicked: traderRequests.filter(r => r.status === 'clicked').length,
    reviewed: traderRequests.filter(r => r.status === 'reviewed').length,
    failed: traderRequests.filter(r => r.status === 'failed').length,
    conversionRate: traderRequests.length > 0
      ? (traderRequests.filter(r => r.status === 'reviewed').length / traderRequests.length * 100).toFixed(1) + '%'
      : '0%'
  }
}

/**
 * Generate a tracking URL for a review request.
 * This URL should redirect through the Trademate platform first to track the click.
 *
 * @param {string} reviewRequestId
 * @param {string} baseUrl - Trademate platform base URL
 * @returns {string} Tracking URL
 */
function getTrackingUrl (reviewRequestId, baseUrl = 'http://localhost:4000') {
  return `${baseUrl}/api/reviews/track/${reviewRequestId}`
}

module.exports = {
  requestReview,
  trackClick,
  checkForNewReviews,
  getTraderReviewStats,
  getTrackingUrl
}