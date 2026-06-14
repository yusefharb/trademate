/**
 * Vapi.ai Webhook Signature Verification
 *
 * Vapi.ai signs webhook payloads using HMAC-SHA256.
 * Verifies that incoming webhooks are genuinely from Vapi.
 */
const crypto = require('crypto')

/**
 * Verify a Vapi.ai webhook signature.
 *
 * Vapi sends the signature in the `x-vapi-signature` header.
 * The signature is HMAC-SHA256 of the raw request body, using your webhook secret.
 *
 * @param {string} rawBody - Raw request body as string
 * @param {string} signature - Value of x-vapi-signature header
 * @param {string} secret - Your webhook secret (VAPI_WEBHOOK_SECRET)
 * @returns {boolean} Whether signature is valid
 */
function verifyVapiSignature (rawBody, signature, secret) {
  if (!signature || !secret) {
    return false
  }

  const computed = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex')

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature))
  } catch {
    return false
  }
}

module.exports = { verifyVapiSignature }