import { Router, Request, Response } from 'express';
import { createMagicLink, verifyMagicLink } from '../services/auth';
import { createLead } from '../services/leads';

const router = Router();

/**
 * POST /api/auth/magic-link
 * Request a magic link to be sent via email
 */
router.post('/magic-link', (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email || typeof email !== 'string') {
    res.status(400).json({ success: false, error: 'Email is required' });
    return;
  }

  const token = createMagicLink(email);

  // In development, return the magic link directly (for testing)
  // In production, this would trigger an email via nodemailer
  const magicLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/verify?token=${token}`;

  console.log(`[DEV] Magic link for ${email}: ${magicLink}`);

  // TODO: In production, send email via nodemailer
  // await sendMagicLinkEmail(email, magicLink);

  res.json({
    success: true,
    message: 'Magic link sent',
    // Only include link in development mode
    ...(process.env.NODE_ENV === 'development' ? { magic_link: magicLink } : {})
  });
});

/**
 * POST /api/auth/verify
 * Verify a magic link token and return a JWT
 */
router.post('/verify', (req: Request, res: Response) => {
  const { token } = req.body;

  if (!token || typeof token !== 'string') {
    res.status(400).json({ success: false, error: 'Token is required' });
    return;
  }

  const result = verifyMagicLink(token);

  if (!result.success) {
    res.status(401).json(result);
    return;
  }

  res.json({
    success: true,
    data: {
      user: result.user,
      token: result.token
    }
  });
});

/**
 * GET /api/auth/me
 * Get the current user's profile (from JWT)
 */
router.get('/me', (req: Request, res: Response) => {
  // This route is protected by requireAuth in the main router
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  res.json({
    success: true,
    data: req.user.dbUser
  });
});

/**
 * POST /api/auth/register-lead
 * Public endpoint for chatbot/website to register a lead
 */
router.post('/register-lead', (req: Request, res: Response) => {
  const { user_id, source, customer_name, customer_email, customer_phone, service_interest, description } = req.body;

  if (!user_id || !customer_name) {
    res.status(400).json({ success: false, error: 'user_id and customer_name are required' });
    return;
  }

  const lead = createLead({
    user_id,
    source: source || 'website_chat',
    customer_name,
    customer_email: customer_email || null,
    customer_phone: customer_phone || null,
    service_interest: service_interest || null,
    description: description || null,
    status: 'new'
  });

  res.status(201).json({ success: true, data: lead });
});

export default router;