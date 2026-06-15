/**
 * Tendd Platform — Integration Bridge
 *
 * Wires the Platform API (SQLite backend) to the Integrations Service
 * (SMS, calendar, GMB, reviews, missed-call handling).
 *
 * Architecture:
 *   Platform API (port 3001)  ←→  Integrations Service (port 4000)
 *     - Leads flow bidirectionally
 *     - Platform is source of truth for persisted data
 *     - Integrations service handles third-party API calls
 */

const INTEGRATIONS_URL = process.env.INTEGRATIONS_URL || 'http://localhost:4000';

/**
 * Forward a new lead from Platform API to Integrations Service
 * so it can trigger SMS follow-ups, reminders, etc.
 */
export async function syncLeadToIntegrations(lead: {
  id: string;
  user_id: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  service_interest: string | null;
  description: string | null;
  source: string;
}): Promise<boolean> {
  try {
    const res = await fetch(`${INTEGRATIONS_URL}/api/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        traderId: lead.user_id,
        source: mapSource(lead.source),
        name: lead.customer_name,
        phone: lead.customer_phone || '',
        email: lead.customer_email || '',
        postcode: '',
        serviceRequired: lead.service_interest || '',
        description: lead.description || '',
        metadata: { platformLeadId: lead.id }
      })
    });
    return res.ok;
  } catch (err) {
    console.warn('[Bridge] Failed to sync lead to integrations:', (err as Error).message);
    return false;
  }
}

/**
 * Sync lead status update to integrations service
 */
export async function syncLeadStatusToIntegrations(
  leadId: string,
  traderId: string,
  status: string,
  quoteAmount?: number
): Promise<boolean> {
  try {
    const res = await fetch(`${INTEGRATIONS_URL}/api/leads/${traderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leadId,
        status: mapStatus(status),
        quoteAmount
      })
    });
    return res.ok;
  } catch (err) {
    console.warn('[Bridge] Failed to sync lead status:', (err as Error).message);
    return false;
  }
}

/**
 * Request available time slots from the calendar service
 */
export async function getAvailability(traderId: string, daysAhead = 14): Promise<any[]> {
  try {
    const res = await fetch(
      `${INTEGRATIONS_URL}/api/availability?traderId=${traderId}&daysAhead=${daysAhead}`
    );
    const data = await res.json();
    return data.slots || [];
  } catch (err) {
    console.warn('[Bridge] Failed to get availability:', (err as Error).message);
    return [];
  }
}

/**
 * Trigger sending reminders for upcoming bookings
 */
export async function triggerReminders(): Promise<boolean> {
  try {
    const res = await fetch(`${INTEGRATIONS_URL}/api/reminders/trigger`, { method: 'POST' });
    return res.ok;
  } catch (err) {
    console.warn('[Bridge] Failed to trigger reminders:', (err as Error).message);
    return false;
  }
}

/**
 * Sync trader business hours to Google Business Profile
 */
export async function syncGMBHours(
  locationName: string,
  schedule: Record<string, { open: string; close: string }>
): Promise<boolean> {
  try {
    const res = await fetch(`${INTEGRATIONS_URL}/api/gmb/sync-hours`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locationName, schedule })
    });
    return res.ok;
  } catch (err) {
    console.warn('[Bridge] Failed to sync GMB hours:', (err as Error).message);
    return false;
  }
}

/**
 * Send a manual SMS via the integrations service
 */
export async function sendSMS(to: string, message: string): Promise<boolean> {
  try {
    const res = await fetch(`${INTEGRATIONS_URL}/api/sms/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, message })
    });
    return res.ok;
  } catch (err) {
    console.warn('[Bridge] Failed to send SMS:', (err as Error).message);
    return false;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────

function mapSource(source: string): string {
  const map: Record<string, string> = {
    call: 'voice',
    website_chat: 'chatbot',
    website_form: 'website',
    facebook_dm: 'social_dm',
    instagram_dm: 'social_dm',
    sms: 'missed_call',
    manual: 'manual'
  };
  return map[source] || source;
}

function mapStatus(status: string): string {
  return status;
}

export default {
  syncLeadToIntegrations,
  syncLeadStatusToIntegrations,
  getAvailability,
  triggerReminders,
  syncGMBHours,
  sendSMS
};