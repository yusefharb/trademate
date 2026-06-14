import { Router, Request, Response } from 'express';
import { getAllSubscriptions, getSubscriptionStats } from '../services/subscriptions';
import { getDb } from '../db/connection';

const router = Router();

/**
 * GET /api/admin/stats
 * Dashboard statistics
 */
router.get('/stats', (_req: Request, res: Response) => {
  const db = getDb();

  const totalUsers = (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;
  const activeSubs = (db.prepare("SELECT COUNT(*) as count FROM subscriptions WHERE status IN ('active', 'trialing')").get() as { count: number }).count;
  const onboarded = (db.prepare('SELECT COUNT(*) as count FROM users WHERE onboarding_completed = 1').get() as { count: number }).count;
  const totalLeads = (db.prepare('SELECT COUNT(*) as count FROM leads').get() as { count: number }).count;
  const tierStats = getSubscriptionStats();

  res.json({
    success: true,
    data: {
      total_users: totalUsers,
      active_subscriptions: activeSubs,
      onboarding_completed: onboarded,
      total_leads: totalLeads,
      subscriptions_by_tier: tierStats,
      pending_onboarding: totalUsers - onboarded
    }
  });
});

/**
 * GET /api/admin/users
 * List all users with subscriptions
 */
router.get('/users', (_req: Request, res: Response) => {
  const db = getDb();
  const users = db.prepare(`
    SELECT u.id, u.email, u.name, u.business_name, u.onboarding_status, u.onboarding_completed,
           u.created_at, s.tier, s.status as subscription_status
    FROM users u
    LEFT JOIN subscriptions s ON s.user_id = u.id
    ORDER BY u.created_at DESC
    LIMIT 100
  `).all();

  res.json({ success: true, data: users });
});

/**
 * GET /api/admin/subscriptions
 * All subscriptions
 */
router.get('/subscriptions', (_req: Request, res: Response) => {
  const subs = getAllSubscriptions();
  res.json({ success: true, data: subs });
});

export default router;