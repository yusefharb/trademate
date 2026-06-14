/**
 * Trademate — Integrations Client
 *
 * Shared HTTP client for the Platform API to communicate
 * with the Integrations Service (SMS, calendar, GMB, reviews, etc.).
 *
 * Configurable via INTEGRATIONS_SERVICE_URL env var.
 *
 * Usage (in Platform API routes):
 *   import integrations from './integrations-client';
 *   await integrations.syncLead(leadData);
 *   await integrations.sendBookingConfirmation(bookingData);
 *   await integrations.triggerReviewFlow(completionData);
 */

const BASE_URL = typeof process !== 'undefined' && process.env?.INTEGRATIONS_SERVICE_URL
  ? process.env.INTEGRATIONS_SERVICE_URL
  : 'http://localhost:4000';

interface RequestOptions {
  method?: string;
  body?: unknown;
  params?: Record<string, string>;
}

async function request(path: string, opts: RequestOptions = {}) {
  const url = new URL(`${BASE_URL}${path}`);
  if (opts.params) {
    Object.entries(opts.params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  try {
    const res = await fetch(url.toString(), {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (!res.ok) {
      console.warn(`[IntegrationClient] ${opts.method || 'GET'} ${path} → ${res.status}`);
      return null;
    }
    return res.json();
  } catch (err) {
    console.warn(`[IntegrationClient] Request failed: ${(err as Error).message}`);
    return null;
  }
}

// ─── Leads ───────────────────────────────────────────────────────

/**
 * Forward a captured lead to the Integrations Service.
 * This triggers SMS follow-ups, lead scoring, and pipeline tracking.
 */
export async function syncLead(data: {
  traderId: string;
  source: string;
  name: string;
  phone: string;
  email?: string;
  postcode?: string;
  serviceRequired?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}) {
  return request('/api/leads', { method: 'POST', body: data });
}

/**
 * Notify integrations service of a lead status change.
 */
export async function syncLeadStatus(
  traderId: string,
  leadId: string,
  status: string,
  quoteAmount?: number
) {
  return request(`/api/leads/${traderId}/status`, {
    method: 'PATCH',
    body: { leadId, status, quoteAmount },
  });
}

/**
 * Fetch lead stats from integrations service.
 */
export async function getLeadStats(traderId: string) {
  return request(`/api/leads/${traderId}/stats`);
}

// ─── Bookings ────────────────────────────────────────────────────

/**
 * Create a booking and send confirmation SMS via integrations service.
 */
export async function createBooking(data: {
  traderId: string;
  leadId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  scheduledFor: string;
  duration: string;
  serviceType: string;
  address?: string;
  postcode?: string;
  notes?: string;
}) {
  return request('/api/bookings', { method: 'POST', body: data });
}

/**
 * Send a booking confirmation SMS.
 */
export async function sendBookingConfirmation(data: {
  to: string;
  customerName: string;
  traderName: string;
  scheduledFor?: string;
  serviceType?: string;
}) {
  return request('/api/sms/send-confirmation', { method: 'POST', body: data });
}

/**
 * Send a 24-hour booking reminder SMS.
 */
export async function sendReminder(data: {
  to: string;
  customerName: string;
  traderName: string;
  scheduledFor: string;
  serviceType: string;
}) {
  return request('/api/sms/send-reminder', { method: 'POST', body: data });
}

// ─── Review Flow ─────────────────────────────────────────────────

/**
 * Trigger the post-completion review request flow.
 * Called when a job is marked as completed.
 */
export async function triggerReviewFlow(data: {
  bookingId: string;
  leadId: string;
  traderId: string;
  customerName: string;
  customerPhone: string;
  placeId?: string;
}) {
  return request(`/api/bookings/${data.bookingId}/complete`, {
    method: 'POST',
    body: { placeId: data.placeId, leadId: data.leadId, traderId: data.traderId },
  });
}

// ─── SMS ─────────────────────────────────────────────────────────

/**
 * Send a custom SMS message.
 */
export async function sendSMS(data: { to: string; message: string; traderName?: string }) {
  return request('/api/sms/send', { method: 'POST', body: data });
}

/**
 * Handle a missed call (trigger text-back).
 */
export async function handleMissedCall(data: {
  callerNumber: string;
  callerName?: string;
  traderId: string;
  traderName?: string;
  bookingLink?: string;
}) {
  return request('/api/missed-call', { method: 'POST', body: data });
}

// ─── Calendar / Availability ─────────────────────────────────────

/**
 * Get available time slots for booking.
 */
export async function getAvailability(traderId: string, daysAhead = 14) {
  const result = await request('/api/availability', {
    params: { traderId, daysAhead: String(daysAhead) },
  });
  return result?.slots || [];
}

/**
 * Cancel a booking.
 */
export async function cancelBooking(bookingId: string) {
  return request(`/api/bookings/${bookingId}/cancel`, { method: 'POST' });
}

// ─── Google Business Profile ─────────────────────────────────────

/**
 * Sync business hours to Google Business Profile.
 */
export async function syncGMBHours(
  locationName: string,
  schedule: Record<string, { open: string; close: string }>
) {
  return request('/api/gmb/sync-hours', {
    method: 'POST',
    body: { locationName, schedule },
  });
}

/**
 * Create a post on Google Business Profile.
 */
export async function createGMBPost(locationName: string, post: { summary: string; topicType?: string }) {
  return request('/api/gmb/create-post', {
    method: 'POST',
    body: { locationName, post },
  });
}

// ─── Reminders ───────────────────────────────────────────────────

/**
 * Trigger sending 24h reminders for all upcoming bookings.
 */
export async function triggerReminders() {
  return request('/api/reminders/trigger', { method: 'POST' });
}

export default {
  syncLead,
  syncLeadStatus,
  getLeadStats,
  createBooking,
  sendBookingConfirmation,
  sendReminder,
  triggerReviewFlow,
  sendSMS,
  handleMissedCall,
  getAvailability,
  cancelBooking,
  syncGMBHours,
  createGMBPost,
  triggerReminders,
};