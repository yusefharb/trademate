import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import * as leadService from '../services/leads';
import { syncLeadToIntegrations, syncLeadStatusToIntegrations } from '../services/integration-bridge';

const router = Router();

// All routes require authentication
router.use(requireAuth);

/**
 * GET /api/leads
 * Get leads for the current trader
 * Query params: status, limit, page
 */
router.get('/', (req: Request, res: Response) => {
  const { status, limit, page } = req.query;
  const l = Math.min(parseInt(limit as string) || 50, 100);
  const p = Math.max(parseInt(page as string) || 1, 1);
  const offset = (p - 1) * l;

  const result = leadService.getLeads(
    req.user!.user_id,
    status as string || undefined,
    l,
    offset
  );

  res.json({
    success: true,
    data: result.leads,
    total: result.total,
    page: p,
    limit: l,
    total_pages: Math.ceil(result.total / l)
  });
});

/**
 * POST /api/leads
 * Create a new lead manually
 */
router.post('/', async (req: Request, res: Response) => {
  const { customer_name, customer_email, customer_phone, service_interest, description, source } = req.body;

  if (!customer_name) {
    res.status(400).json({ success: false, error: 'Customer name is required' });
    return;
  }

  const lead = leadService.createLead({
    user_id: req.user!.user_id,
    source: source || 'manual',
    customer_name,
    customer_email: customer_email || null,
    customer_phone: customer_phone || null,
    service_interest: service_interest || null,
    description: description || null,
    status: 'new'
  });

  // Forward to integrations service (non-blocking, fire-and-forget)
  syncLeadToIntegrations(lead).then(synced => {
    if (synced) console.log(`[Bridge] Lead ${lead.id} synced to integrations`);
  });

  res.status(201).json({ success: true, data: lead });
});

/**
 * PATCH /api/leads/:id/status
 * Update lead status
 */
router.patch('/:id/status', async (req: Request, res: Response) => {
  const { status, quote_amount } = req.body;

  if (!status) {
    res.status(400).json({ success: false, error: 'Status is required' });
    return;
  }

  const lead = leadService.updateLeadStatus(req.params.id, req.user!.user_id, status, quote_amount);
  if (!lead) {
    res.status(404).json({ success: false, error: 'Lead not found' });
    return;
  }

  // Notify integrations service of status change (non-blocking)
  syncLeadStatusToIntegrations(lead.id, req.user!.user_id, status, quote_amount).then(synced => {
    if (synced) console.log(`[Bridge] Lead ${lead.id} status synced to integrations`);
  });

  res.json({ success: true, data: lead });
});

/**
 * GET /api/leads/stats
 * Get lead stats by status
 */
router.get('/stats', (req: Request, res: Response) => {
  const stats = leadService.getLeadStats(req.user!.user_id);
  res.json({ success: true, data: stats });
});

export default router;

