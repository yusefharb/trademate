/**
 * Meta Send API — Send replies via Messenger / Instagram
 *
 * Used by the webhook router to respond to DMs.
 * Integrates with the Chatbot specialist's AI prompt for auto-replies.
 */
const axios = require('axios')

const META_GRAPH_BASE = 'https://graph.facebook.com/v21.0'

/**
 * Send a message reply via Facebook Messenger.
 *
 * @param {Object} params
 * @param {string} params.recipientId - PSID of the message sender
 * @param {string} params.text - Message text to send
 * @param {string} params.pageAccessToken - Facebook Page Access Token
 * @returns {Promise<Object>}
 */
async function sendMessengerReply ({ recipientId, text, pageAccessToken }) {
  if (!pageAccessToken) {
    console.warn('[MetaSend] No page access token configured — reply not sent')
    return { success: false, reason: 'no_token' }
  }

  try {
    const response = await axios.post(
      `${META_GRAPH_BASE}/me/messages`,
      {
        recipient: { id: recipientId },
        message: { text }
      },
      {
        params: { access_token: pageAccessToken }
      }
    )

    console.log(`[MetaSend] ✅ Reply sent to ${recipientId}: "${text.substring(0, 60)}..."`)
    return { success: true, messageId: response.data.message_id }
  } catch (err) {
    console.error('[MetaSend] ❌ Failed to send reply:', err.response?.data || err.message)
    return { success: false, error: err.response?.data || err.message }
  }
}

/**
 * Send a message reply via Instagram.
 * Instagram uses IG User IDs, not PSIDs.
 *
 * @param {Object} params
 * @param {string} params.recipientId - IG user ID
 * @param {string} params.text - Message text
 * @param {string} params.pageAccessToken - Facebook Page Access Token
 * @returns {Promise<Object>}
 */
async function sendInstagramReply ({ recipientId, text, pageAccessToken }) {
  if (!pageAccessToken) {
    console.warn('[MetaSend] No page access token configured — Instagram reply not sent')
    return { success: false, reason: 'no_token' }
  }

  try {
    const response = await axios.post(
      `${META_GRAPH_BASE}/me/messages`,
      {
        recipient: { id: recipientId },
        message: { text }
      },
      {
        params: {
          access_token: pageAccessToken,
          platform: 'instagram'
        }
      }
    )

    console.log(`[MetaSend] 📸 Instagram reply sent to ${recipientId}`)
    return { success: true, messageId: response.data.message_id }
  } catch (err) {
    console.error('[MetaSend] ❌ Instagram reply failed:', err.response?.data || err.message)
    return { success: false, error: err.response?.data || err.message }
  }
}

module.exports = { sendMessengerReply, sendInstagramReply }