import { v4 as uuid } from 'uuid';
import { getDb } from '../db/connection';
import type { Lead } from '../../../shared/types';

/**
 * Create a new lead from any channel
 */
export function createLead(data: Omit<Lead, 'id' | 'created_at' | 'updated_at'>): Lead {
  const db = getDb();
  const id = uuid();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO leads (id, user_id, source, customer_name, customer_email, customer_phone, service_interest, description, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, data.user_id, data.source, data.customer_name,
    data.customer_email || null, data.customer_phone || null,
    data.service_interest || null, data.description || null,
    data.status || 'new', now, now
  );

  return db.prepare('SELECT * FROM leads WHERE id = ?').get(id) as Lead;
}

/**
 * Get leads for a trader
 */
export function getLeads(userId: string, status?: string, limit = 50, offset = 0): { leads: Lead[]; total: number } {
  const db = getDb();
  
  let whereClause = 'WHERE user_id = ?';
  const params: any[] = [userId];

  if (status) {
    whereClause += ' AND status = ?';
    params.push(status);
  }

  const total = (db.prepare(`SELECT COUNT(*) as count FROM leads ${whereClause}`).get(...params) as { count: number }).count;

  const leads = db.prepare(
    `SELECT * FROM leads ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset) as Lead[];

  return { leads, total };
}

/**
 * Update lead status
 */
export function updateLeadStatus(leadId: string, userId: string, status: Lead['status'], quoteAmount?: number): Lead | null {
  const db = getDb();
  
  if (quoteAmount !== undefined) {
    db.prepare(
      'UPDATE leads SET status = ?, quote_amount = ?, updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?'
    ).run(status, quoteAmount, leadId, userId);
  } else {
    db.prepare(
      'UPDATE leads SET status = ?, updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?'
    ).run(status, leadId, userId);
  }

  return db.prepare('SELECT * FROM leads WHERE id = ? AND user_id = ?').get(leadId, userId) as Lead | null;
}

/**
 * Get lead counts by status (for dashboard)
 */
export function getLeadStats(userId: string): { status: string; count: number }[] {
  const db = getDb();
  return db.prepare(
    'SELECT status, COUNT(*) as count FROM leads WHERE user_id = ? GROUP BY status'
  ).all(userId) as any[];
}