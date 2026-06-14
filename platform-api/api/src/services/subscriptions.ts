import { v4 as uuid } from 'uuid';
import { getDb } from '../db/connection';
import type { Subscription, SubscriptionTier } from '../../../shared/types';

/**
 * Get a trader's subscription
 */
export function getSubscription(userId: string): Subscription | null {
  const db = getDb();
  return db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(userId) as Subscription | null;
}

/**
 * Update subscription tier
 */
export function updateSubscriptionTier(userId: string, tier: SubscriptionTier): Subscription | null {
  const db = getDb();
  db.prepare(
    'UPDATE subscriptions SET tier = ?, updated_at = datetime(\'now\') WHERE user_id = ?'
  ).run(tier, userId);
  return getSubscription(userId);
}

/**
 * Update subscription status (e.g., from Stripe webhook)
 */
export function updateSubscriptionStatus(
  userId: string,
  status: Subscription['status'],
  stripeSubscriptionId?: string
): Subscription | null {
  const db = getDb();
  
  if (stripeSubscriptionId) {
    db.prepare(
      'UPDATE subscriptions SET status = ?, stripe_subscription_id = ?, updated_at = datetime(\'now\') WHERE user_id = ?'
    ).run(status, stripeSubscriptionId, userId);
  } else {
    db.prepare(
      'UPDATE subscriptions SET status = ?, updated_at = datetime(\'now\') WHERE user_id = ?'
    ).run(status, userId);
  }
  
  return getSubscription(userId);
}

/**
 * Get all subscriptions (admin)
 */
export function getAllSubscriptions(): any[] {
  const db = getDb();
  return db.prepare(`
    SELECT s.*, u.email, u.name, u.business_name, u.onboarding_completed
    FROM subscriptions s
    JOIN users u ON u.id = s.user_id
    ORDER BY s.created_at DESC
  `).all() as any[];
}

/**
 * Get subscription counts by tier (admin stats)
 */
export function getSubscriptionStats(): { tier: string; count: number }[] {
  const db = getDb();
  return db.prepare(
    'SELECT tier, COUNT(*) as count FROM subscriptions GROUP BY tier'
  ).all() as any[];
}