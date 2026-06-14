import { Router, Request, Response } from 'express';
import { requireAuth, requireTier } from '../middleware/auth';
import * as subService from '../services/subscriptions';

const router = Router();

// All routes require authentication
router.use(requireAuth);

/**
 * GET /api/subscriptions
 * Get current user's subscription
 */
router.get('/', (req: Request, res: Response) => {
  const sub = subService.getSubscription(req.user!.user_id);
  res.json({ success: true, data: sub });
});

/**
 * PUT /api/subscriptions/tier
 * Update subscription tier (for testing / admin)
 * In production, this would be handled by Stripe webhooks
 */
router.put('/tier', (req: Request, res: Response) => {
  const { tier } = req.body;

  if (!['starter', 'growth', 'pro'].includes(tier)) {
    res.status(400).json({ success: false, error: 'Invalid tier. Must be starter, growth, or pro' });
    return;
  }

  const sub = subService.updateSubscriptionTier(req.user!.user_id, tier);
  res.json({ success: true, data: sub });
});

export default router;