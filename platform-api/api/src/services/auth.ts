import { v4 as uuid } from 'uuid';
import jwt from 'jsonwebtoken';
import { getDb } from '../db/connection';
import type { User, AuthPayload } from '../../../shared/types';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const TOKEN_EXPIRY_HOURS = 24;

export interface AuthResult {
  success: boolean;
  user?: User;
  token?: string;
  error?: string;
}

/**
 * Generate a magic link token and store it in the database
 */
export function createMagicLink(email: string): string {
  const db = getDb();
  const token = uuid();
  const id = uuid();
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();

  db.prepare(
    'INSERT INTO auth_tokens (id, email, token, expires_at) VALUES (?, ?, ?, ?)'
  ).run(id, email.toLowerCase().trim(), token, expiresAt);

  return token;
}

/**
 * Verify a magic link token and create/return a JWT
 */
export function verifyMagicLink(token: string): AuthResult {
  const db = getDb();

  const row = db.prepare(
    'SELECT * FROM auth_tokens WHERE token = ? AND used = 0 AND expires_at > datetime(\'now\')'
  ).get(token) as { id: string; email: string } | undefined;

  if (!row) {
    return { success: false, error: 'Invalid or expired token' };
  }

  // Mark token as used
  db.prepare('UPDATE auth_tokens SET used = 1 WHERE id = ?').run(row.id);

  // Find or create user
  let user = db.prepare('SELECT * FROM users WHERE email = ?').get(row.email) as User | undefined;

  if (!user) {
    // Create new user
    const userId = uuid();
    const now = new Date().toISOString();

    db.prepare(
      'INSERT INTO users (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).run(userId, row.email, row.email.split('@')[0], now, now);

    // Create a trial subscription
    const subId = uuid();
    const periodEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(); // 14-day trial
    db.prepare(
      'INSERT INTO subscriptions (id, user_id, tier, status, current_period_start, current_period_end) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(subId, userId, 'starter', 'trialing', now, periodEnd);

    // Create onboarding tasks
    const steps = [
      'account_created', 'business_info', 'services_added',
      'service_areas', 'pricing_set', 'booking_connected',
      'website_generated', 'voice_setup', 'social_connected', 'complete'
    ];
    for (const step of steps) {
      const taskId = uuid();
      const completed = step === 'account_created' ? 1 : 0;
      db.prepare(
        'INSERT INTO onboarding_tasks (id, user_id, step, completed) VALUES (?, ?, ?, ?)'
      ).run(taskId, userId, step, completed);
    }

    user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as User;
  }

  // Get the user's subscription tier for JWT
  const sub = db.prepare('SELECT tier FROM subscriptions WHERE user_id = ?').get(user.id) as { tier: string } | undefined;

  // Generate JWT
  const payload: AuthPayload = {
    user_id: user.id,
    email: user.email,
    tier: (sub?.tier as any) || 'starter',
  };

  const jwtToken = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

  return { success: true, user, token: jwtToken };
}

/**
 * Verify a JWT token and return the payload
 */
export function verifyToken(token: string): AuthPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthPayload;
  } catch {
    return null;
  }
}

/**
 * Get user by ID
 */
export function getUserById(userId: string): User | null {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as User | undefined;
  return user || null;
}

