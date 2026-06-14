import { Router, Request, Response } from 'express';
import { getDb } from '../db/connection';
import { v4 as uuid } from 'uuid';

/**
 * Webhook endpoints for the Integrations Service.
 * Receives leads, bookings, and events captured by integrations
 * (Twilio, Vapi, Meta, Calendly, etc.) and persists them to SQLite.
 */
const router = Router();

/**
 * POST /api/webhooks/leads
 *
 * Receive a lead from the integrations service (captured via
 * webhooks: Twilio SMS, Vapi voice, Meta DMs, missed calls, etc.)
 */
router.post('/leads', (req: Request, res: Response) => {
  try {
    const { id, traderId, source, name, phone, email, postcode, serviceRequired, description, status, metadata } = req.body;

    if (!traderId || !name) {
      res.status(400).json({ success: false, error: 'traderId and name required' });
      return;
    }

    const db = getDb();

    // Check if this lead already exists (by external ID or phone dedup)
    let existingLead: any = null;
    if (id) {
      existingLead = db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
    }

    if (existingLead) {
      // Update existing
      db.prepare(`
        UPDATE leads SET 
          customer_name = ?, customer_email = ?, customer_phone = ?,
          service_interest = ?, description = ?, status = ?,
          updated_at = datetime('now')
        WHERE id = ?
      `).run(
        name || existingLead.customer_name,
        email || existingLead.customer_email,
        phone || existingLead.customer_phone,
        serviceRequired || existingLead.service_interest,
        description || existingLead.description,
        status || existingLead.status,
        id
      );

      res.json({ success: true, data: db.prepare('SELECT * FROM leads WHERE id = ?').get(id) });
    } else {
      // Create new lead
      const leadId = id || uuid();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO leads (id, user_id, source, customer_name, customer_email, customer_phone, service_interest, description, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        leadId,
        traderId,
        mapSource(source || 'manual'),
        name,
        email || null,
        phone || null,
        serviceRequired || null,
        description || null,
        mapStatus(status || 'new'),
        now,
        now
      );

      res.status(201).json({
        success: true,
        data: db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId)
      });
    }
  } catch (err) {
    console.error('[Webhook] Lead webhook error:', err);
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

/**
 * POST /api/webhooks/bookings
 *
 * Receive a booking from integrations service (Calendly/Cal.com sync)
 */
router.post('/bookings', (req: Request, res: Response) => {
  try {
    const { id, traderId, leadId, customerName, customerPhone, customerEmail, scheduledFor, duration, serviceType, notes, status } = req.body;

    if (!traderId) {
      res.status(400).json({ success: false, error: 'traderId required' });
      return;
    }

    const db = getDb();
    const bookingId = id || uuid();
    const now = new Date().toISOString();

    // Check if booking already exists
    const existing = db.prepare('SELECT id FROM leads WHERE id = ?').get(bookingId);
    
    if (existing) {
      res.json({ success: true, message: 'Booking already exists' });
      return;
    }

    // Create a lead with booked status to represent the booking
    db.prepare(`
      INSERT INTO leads (id, user_id, source, customer_name, customer_email, customer_phone, service_interest, description, status, created_at, updated_at)
      VALUES (?, ?, 'website', ?, ?, ?, ?, ?, 'booked', ?, ?)
    `).run(
      bookingId,
      traderId,
      customerName || 'Booking',
      customerEmail || null,
      customerPhone || null,
      serviceType || null,
      notes || null,
      now,
      now
    );

    // Also update the integrated structure: in future, bookings go to a separate table
    res.status(201).json({ success: true, data: { id: bookingId, status: 'booked' } });
  } catch (err) {
    console.error('[Webhook] Booking webhook error:', err);
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

/**
 * POST /api/webhooks/sync
 *
 * Full data sync from integrations service (batch)
 */
router.post('/sync', (req: Request, res: Response) => {
  const { leads, bookings } = req.body;
  const db = getDb();
  const results = { leadsSynced: 0, bookingsSynced: 0 };

  if (Array.isArray(leads)) {
    const upsertLead = db.prepare(`
      INSERT INTO leads (id, user_id, source, customer_name, customer_email, customer_phone, service_interest, description, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        customer_name = excluded.customer_name,
        customer_email = excluded.customer_email,
        customer_phone = excluded.customer_phone,
        service_interest = excluded.service_interest,
        description = excluded.description,
        status = excluded.status,
        updated_at = excluded.updated_at
    `);

    for (const lead of leads) {
      upsertLead.run(
        lead.id, lead.traderId, mapSource(lead.source || 'manual'),
        lead.name, lead.email || null, lead.phone || null,
        lead.serviceRequired || null, lead.description || null,
        mapStatus(lead.status || 'new'),
        lead.createdAt || new Date().toISOString(),
        lead.updatedAt || new Date().toISOString()
      );
      results.leadsSynced++;
    }
  }

  res.json({ success: true, data: results });
});

function mapSource(source: string): string {
  const map: Record<string, string> = {
    chatbot: 'website_chat',
    voice: 'call',
    social_dm: 'facebook_dm',
    gmb: 'website_form',
    website: 'website_form',
    missed_call: 'sms',
    manual: 'manual'
  };
  return map[source] || 'manual';
}

function mapStatus(status: string): string {
  return status;
}

export default router;