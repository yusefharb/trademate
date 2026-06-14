/**
 * Google Business Profile (GMB) Service
 *
 * Integrates with the Google My Business API to:
 * - Auto-sync business hours, contact info
 * - Post offers, updates to GBP
 * - Respond to reviews (public reply)
 * - Track review analytics
 * - Send review collection links
 *
 * Uses OAuth 2.0 with refresh tokens for authentication.
 */
const axios = require('axios')
const { config } = require('../config')
const { store } = require('../models/data-models')
const { v4: uuidv4 } = require('uuid')

const GMB_API_BASE = 'https://mybusiness.googleapis.com/v4'
const GMB_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token'

let accessToken = null
let tokenExpiresAt = null

/**
 * Get a valid access token using the stored refresh token.
 */
async function getAccessToken () {
  // Return cached token if still valid
  if (accessToken && tokenExpiresAt && Date.now() < tokenExpiresAt) {
    return accessToken
  }

  if (!config.gmb.refreshToken) {
    console.warn('[GMB] No refresh token configured — GMB sync disabled')
    return null
  }

  try {
    const response = await axios.post(GMB_OAUTH_TOKEN_URL, {
      client_id: config.gmb.clientId,
      client_secret: config.gmb.clientSecret,
      refresh_token: config.gmb.refreshToken,
      grant_type: 'refresh_token'
    })

    accessToken = response.data.access_token
    tokenExpiresAt = Date.now() + (response.data.expires_in * 1000) - 60000 // 1 min buffer

    console.log('[GMB] Access token refreshed')
    return accessToken
  } catch (err) {
    console.error('[GMB] Token refresh failed:', err.response?.data || err.message)
    return null
  }
}

/**
 * Make an authenticated request to the GMB API.
 */
async function gmbRequest ({ method = 'GET', path, params = {}, data = null }) {
  const token = await getAccessToken()
  if (!token) {
    throw new Error('[GMB] No valid access token')
  }

  try {
    const response = await axios({
      method,
      url: `${GMB_API_BASE}/${path}`,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      params,
      data
    })

    return response.data
  } catch (err) {
    console.error(`[GMB] API error (${method} ${path}):`, err.response?.data || err.message)
    throw err
  }
}

// ─── Account & Location ──────────────────────────────────────────────────────────

/**
 * List all Google Business Profile accounts for the authenticated user.
 */
async function listAccounts () {
  return gmbRequest({ path: 'accounts' })
}

/**
 * List all locations for a given account.
 *
 * @param {string} accountId - e.g., 'accounts/123456789'
 */
async function listLocations (accountId) {
  return gmbRequest({ path: `${accountId}/locations` })
}

/**
 * Get detailed info for a location.
 *
 * @param {string} name - e.g., 'accounts/123456789/locations/987654321'
 */
async function getLocation (name) {
  return gmbRequest({ path: name, params: { readMask: 'name,title,storefrontAddress,regularHours,phoneNumbers,categories,metadata,profile' } })
}

// ─── Business Hours Sync ─────────────────────────────────────────────────────────

/**
 * Update the regular business hours for a location.
 *
 * @param {string} locationName - Full location resource name
 * @param {Object} regularHours - GMB regularHours format
 */
async function updateBusinessHours (locationName, regularHours) {
  return gmbRequest({
    method: 'PATCH',
    path: `${locationName}`,
    params: { updateMask: 'regularHours' },
    data: { regularHours }
  })
}

/**
 * Build a regularHours object from a simple schedule format.
 *
 * @param {Object} schedule - { monday: { open: '09:00', close: '17:00' }, ... }
 * @returns {Object} GMB-compatible regularHours
 */
function buildRegularHours (schedule) {
  const dayMap = {
    monday: 'MONDAY',
    tuesday: 'TUESDAY',
    wednesday: 'WEDNESDAY',
    thursday: 'THURSDAY',
    friday: 'FRIDAY',
    saturday: 'SATURDAY',
    sunday: 'SUNDAY'
  }

  const periods = []

  for (const [day, hours] of Object.entries(schedule)) {
    const dayOfWeek = dayMap[day]
    if (!dayOfWeek || !hours || !hours.open) continue

    periods.push({
      openDay: dayOfWeek,
      openTime: hours.open.replace(':', ''),
      closeDay: dayOfWeek,
      closeTime: hours.close.replace(':', '')
    })
  }

  return { periods }
}

// ─── Post News/Offers ────────────────────────────────────────────────────────────

/**
 * Create a post on the Google Business Profile.
 *
 * Post types: 'ALERT', 'OFFER', 'PRODUCT', 'WHATSNEW', 'EVENT'
 *
 * @param {string} locationName
 * @param {Object} post - { summary, callToAction { actionType, url }, event, offer }
 */
async function createPost (locationName, post) {
  return gmbRequest({
    method: 'POST',
    path: `${locationName}/localPosts`,
    data: {
      languageCode: 'en-GB',
      summary: post.summary,
      callToAction: post.callToAction || null,
      event: post.event || null,
      offer: post.offer || null
    }
  })
}

/**
 * List posts for a location.
 */
async function listPosts (locationName) {
  return gmbRequest({ path: `${locationName}/localPosts` })
}

// ─── Review Management ──────────────────────────────────────────────────────────

/**
 * List reviews for a location.
 */
async function listReviews (locationName, pageSize = 50) {
  return gmbRequest({ path: `${locationName}/reviews`, params: { pageSize } })
}

/**
 * Reply to a review.
 *
 * @param {string} reviewName - Full review resource name
 * @param {string} replyText - The public reply text
 */
async function replyToReview (reviewName, replyText) {
  return gmbRequest({
    method: 'POST',
    path: `${reviewName}/reply`,
    data: { comment: replyText }
  })
}

/**
 * Delete a review reply.
 */
async function deleteReviewReply (reviewName) {
  return gmbRequest({
    method: 'DELETE',
    path: `${reviewName}/reply`
  })
}

// ─── Review Link Generation ──────────────────────────────────────────────────────

/**
 * Generate a Google review link for a location.
 *
 * @param {string} placeId - Google Place ID of the business
 * @returns {string} Direct review URL
 */
function getReviewLink (placeId) {
  return `https://search.google.com/local/writereview?placeid=${placeId}`
}

/**
 * Build the Place ID lookup URL from a location name.
 */
function getPlaceIdFromLocation (location) {
  if (location.metadata && location.metadata.placeId) {
    return location.metadata.placeId
  }
  return null
}

// ─── Insights / Analytics ────────────────────────────────────────────────────────

/**
 * Request insights/reporting data for a location.
 *
 * @param {Object} params
 * @param {string} params.locationName
 * @param {Object} params.timeRange - { startTime, endTime } ISO strings
 * @param {string[]} params.metrics - e.g., ['QUERIES_DIRECT', 'QUERIES_INDIRECT', 'VIEWS_MAPS', 'VIEWS_SEARCH']
 */
async function getInsights ({ locationName, timeRange, metrics }) {
  return gmbRequest({
    method: 'POST',
    path: `${locationName}/reportInsights`,
    data: {
      locationNames: [locationName],
      basicRequest: {
        metricRequests: metrics.map(m => ({ metric: m })),
        timeRange
      }
    }
  })
}

// ─── Service Initialization ──────────────────────────────────────────────────────

/**
 * Initialise the GMB service. Tests the connection by fetching accounts.
 */
async function init () {
  if (!config.gmb.clientId || !config.gmb.refreshToken) {
    console.warn('[GMB] GMB not fully configured. Set GMB_CLIENT_ID, GMB_CLIENT_SECRET, GMB_REFRESH_TOKEN')
    return false
  }

  try {
    const accounts = await listAccounts()
    console.log(`[GMB] Connected. Found ${accounts.accounts?.length || 0} account(s)`)
    return accounts.accounts?.length > 0
  } catch (err) {
    console.error('[GMB] Init failed:', err.message)
    return false
  }
}

module.exports = {
  init,
  getAccessToken,
  listAccounts,
  listLocations,
  getLocation,
  updateBusinessHours,
  buildRegularHours,
  createPost,
  listPosts,
  listReviews,
  replyToReview,
  deleteReviewReply,
  getReviewLink,
  getPlaceIdFromLocation,
  getInsights
}