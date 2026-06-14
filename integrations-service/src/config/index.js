/**
 * Trademate Integrations Service — Configuration
 *
 * Loads environment variables and provides a central config object.
 * All third-party API keys and endpoints are managed here.
 */
require('dotenv').config()

const config = {
  // Environment
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') === 'development',
  port: parseInt(process.env.PORT, 10) || 4000,

  // Twilio (SMS + Voice)
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER
  },

  // Calendar booking provider (calendly | calcom)
  booking: {
    provider: process.env.BOOKING_PROVIDER || 'calendly',
    calendly: {
      apiKey: process.env.CALENDLY_API_KEY,
      webhookSecret: process.env.CALENDLY_WEBHOOK_SECRET
    },
    calcom: {
      apiKey: process.env.CALCOM_API_KEY,
      baseUrl: process.env.CALCOM_BASE_URL || 'https://api.cal.com',
      eventTypeId: parseInt(process.env.CALCOM_EVENT_TYPE_ID, 10) || null
    }
  },

  // Google Business Profile
  gmb: {
    clientId: process.env.GMB_CLIENT_ID,
    clientSecret: process.env.GMB_CLIENT_SECRET,
    refreshToken: process.env.GMB_REFRESH_TOKEN
  },

  // Vapi.ai (voice agent)
  vapi: {
    apiKey: process.env.VAPI_API_KEY,
    agentId: process.env.VAPI_AGENT_ID
  },

  // Platform API (for pushing leads/bookings)
  platform: {
    baseUrl: process.env.PLATFORM_API_URL || 'http://localhost:3001',
    apiKey: process.env.PLATFORM_API_KEY
  }
}

/**
 * Validates that required config is present.
 * Throws on startup if critical keys are missing in production.
 */
function validate () {
  const missing = []

  if (!config.twilio.accountSid) missing.push('TWILIO_ACCOUNT_SID')
  if (!config.twilio.authToken) missing.push('TWILIO_AUTH_TOKEN')
  if (!config.twilio.phoneNumber) missing.push('TWILIO_PHONE_NUMBER')

  if (config.booking.provider === 'calendly' && !config.booking.calendly.apiKey) {
    missing.push('CALENDLY_API_KEY')
  }

  if (config.nodeEnv === 'production' && missing.length > 0) {
    throw new Error(
      `Missing required config: ${missing.join(', ')}. ` +
      'Set these in your .env file or environment variables.'
    )
  }

  return missing
}

module.exports = { config, validate }
