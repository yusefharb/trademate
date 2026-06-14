import { v4 as uuid } from 'uuid';
import { getDb } from '../db/connection';
import type { User, Service, ServiceArea, OnboardingStep } from '../../../shared/types';

/**
 * Update a trader's business profile
 */
export function updateBusinessProfile(
  userId: string,
  data: Partial<Pick<User, 'business_name' | 'business_phone' | 'business_address' | 'business_description' | 'logo_url' | 'name'>>
): User | null {
  const db = getDb();
  const fields: string[] = [];
  const values: any[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (fields.length === 0) return getUserByIdDirect(userId);

  fields.push('updated_at = datetime(\'now\')');
  values.push(userId);

  db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  // Auto-advance onboarding if business_info step not completed
  const stepTasks = db.prepare(
    'SELECT * FROM onboarding_tasks WHERE user_id = ? AND step = ?'
  ).get(userId, 'business_info') as any;

  if (stepTasks && !stepTasks.completed) {
    db.prepare(
      'UPDATE onboarding_tasks SET completed = 1, completed_at = datetime(\'now\') WHERE id = ?'
    ).run(stepTasks.id);
  }

  return getUserByIdDirect(userId);
}

/**
 * Add a service for a trader
 */
export function addService(userId: string, data: Omit<Service, 'id' | 'user_id' | 'created_at' | 'updated_at'>): Service {
  const db = getDb();
  const id = uuid();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO services (id, user_id, name, description, price_type, min_price, max_price, price_currency, estimated_duration_minutes, is_active, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, userId, data.name, data.description || null, data.price_type,
    data.min_price || null, data.max_price || null, data.price_currency || 'GBP',
    data.estimated_duration_minutes || null, data.is_active ? 1 : 0, data.sort_order || 0,
    now, now
  );

  return db.prepare('SELECT * FROM services WHERE id = ?').get(id) as Service;
}

/**
 * Get all services for a trader
 */
export function getServices(userId: string): Service[] {
  const db = getDb();
  return db.prepare('SELECT * FROM services WHERE user_id = ? ORDER BY sort_order ASC').all(userId) as Service[];
}

/**
 * Update a service
 */
export function updateService(serviceId: string, userId: string, data: Partial<Service>): Service | null {
  const db = getDb();
  const fields: string[] = [];
  const values: any[] = [];

  const allowedFields = ['name', 'description', 'price_type', 'min_price', 'max_price', 'price_currency', 'estimated_duration_minutes', 'is_active', 'sort_order'];
  
  for (const key of allowedFields) {
    if (data[key as keyof Service] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(data[key as keyof Service]);
    }
  }

  if (fields.length === 0) {
    return db.prepare('SELECT * FROM services WHERE id = ? AND user_id = ?').get(serviceId, userId) as Service | null;
  }

  fields.push('updated_at = datetime(\'now\')');
  values.push(serviceId, userId);

  db.prepare(`UPDATE services SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(...values);
  return db.prepare('SELECT * FROM services WHERE id = ? AND user_id = ?').get(serviceId, userId) as Service | null;
}

/**
 * Delete a service
 */
export function deleteService(serviceId: string, userId: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM services WHERE id = ? AND user_id = ?').run(serviceId, userId);
  return result.changes > 0;
}

/**
 * Add a service area
 */
export function addServiceArea(userId: string, data: Omit<ServiceArea, 'id' | 'user_id' | 'created_at'>): ServiceArea {
  const db = getDb();
  const id = uuid();
  const now = new Date().toISOString();

  db.prepare(
    'INSERT INTO service_areas (id, user_id, city, state, postcode, radius_miles, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, userId, data.city, data.state || null, data.postcode || null, data.radius_miles || null, now);

  return db.prepare('SELECT * FROM service_areas WHERE id = ?').get(id) as ServiceArea;
}

/**
 * Get all service areas for a trader
 */
export function getServiceAreas(userId: string): ServiceArea[] {
  const db = getDb();
  return db.prepare('SELECT * FROM service_areas WHERE user_id = ? ORDER BY city ASC').all(userId) as ServiceArea[];
}

/**
 * Delete a service area
 */
export function deleteServiceArea(areaId: string, userId: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM service_areas WHERE id = ? AND user_id = ?').run(areaId, userId);
  return result.changes > 0;
}

/**
 * Get onboarding progress
 */
export function getOnboardingProgress(userId: string): { step: OnboardingStep; completed: boolean }[] {
  const db = getDb();
  return db.prepare(
    'SELECT step, completed FROM onboarding_tasks WHERE user_id = ? ORDER BY rowid ASC'
  ).all(userId) as any;
}

/**
 * Advance onboarding to the next step
 */
export function advanceOnboarding(userId: string, step: OnboardingStep): boolean {
  const db = getDb();
  const result = db.prepare(
    'UPDATE onboarding_tasks SET completed = 1, completed_at = datetime(\'now\') WHERE user_id = ? AND step = ?'
  ).run(userId, step);

  if (result.changes > 0) {
    // Check if all steps are completed
    const incomplete = db.prepare(
      'SELECT COUNT(*) as count FROM onboarding_tasks WHERE user_id = ? AND completed = 0'
    ).get(userId) as { count: number };

    if (incomplete.count === 0) {
      db.prepare('UPDATE users SET onboarding_completed = 1, updated_at = datetime(\'now\') WHERE id = ?').run(userId);
    }

    // Update the user's current onboarding status
    db.prepare('UPDATE users SET onboarding_status = ?, updated_at = datetime(\'now\') WHERE id = ?').run(step, userId);
    
    return true;
  }
  return false;
}

/**
 * Set the website subdomain for a trader (called by Website Builder)
 */
export function setWebsiteSubdomain(userId: string, subdomain: string): boolean {
  const db = getDb();
  // Check if subdomain is available
  const existing = db.prepare('SELECT id FROM users WHERE website_subdomain = ? AND id != ?').get(subdomain, userId);
  if (existing) return false;

  db.prepare('UPDATE users SET website_subdomain = ?, updated_at = datetime(\'now\') WHERE id = ?').run(subdomain, userId);
  return true;
}

function getUserByIdDirect(userId: string): User | null {
  const db = getDb();
  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as User | null;
}