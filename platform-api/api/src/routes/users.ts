import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import * as userService from '../services/users';

const router = Router();

// All routes require authentication
router.use(requireAuth);

/**
 * GET /api/users/profile
 * Get the current user's profile with full details
 */
router.get('/profile', (req: Request, res: Response) => {
  res.json({ success: true, data: req.user!.dbUser });
});

/**
 * PUT /api/users/profile
 * Update business profile
 */
router.put('/profile', (req: Request, res: Response) => {
  const { business_name, business_phone, business_address, business_description, logo_url, name } = req.body;
  
  const user = userService.updateBusinessProfile(req.user!.user_id, {
    business_name, business_phone, business_address, business_description, logo_url, name
  });

  res.json({ success: true, data: user });
});

/**
 * GET /api/users/services
 * Get all services for the current trader
 */
router.get('/services', (req: Request, res: Response) => {
  const services = userService.getServices(req.user!.user_id);
  res.json({ success: true, data: services });
});

/**
 * POST /api/users/services
 * Add a new service
 */
router.post('/services', (req: Request, res: Response) => {
  const { name, description, price_type, min_price, max_price, price_currency, estimated_duration_minutes } = req.body;

  if (!name) {
    res.status(400).json({ success: false, error: 'Service name is required' });
    return;
  }

  const service = userService.addService(req.user!.user_id, {
    name,
    description: description || null,
    price_type: price_type || 'estimate',
    min_price: min_price || null,
    max_price: max_price || null,
    price_currency: price_currency || 'GBP',
    estimated_duration_minutes: estimated_duration_minutes || null,
    is_active: true,
    sort_order: 0
  });

  // Auto-advance onboarding
  userService.advanceOnboarding(req.user!.user_id, 'services_added');

  res.status(201).json({ success: true, data: service });
});

/**
 * PUT /api/users/services/:id
 * Update a service
 */
router.put('/services/:id', (req: Request, res: Response) => {
  const service = userService.updateService(req.params.id, req.user!.user_id, req.body);
  if (!service) {
    res.status(404).json({ success: false, error: 'Service not found' });
    return;
  }
  res.json({ success: true, data: service });
});

/**
 * DELETE /api/users/services/:id
 * Delete a service
 */
router.delete('/services/:id', (req: Request, res: Response) => {
  const deleted = userService.deleteService(req.params.id, req.user!.user_id);
  if (!deleted) {
    res.status(404).json({ success: false, error: 'Service not found' });
    return;
  }
  res.json({ success: true, message: 'Service deleted' });
});

/**
 * GET /api/users/service-areas
 * Get all service areas
 */
router.get('/service-areas', (req: Request, res: Response) => {
  const areas = userService.getServiceAreas(req.user!.user_id);
  res.json({ success: true, data: areas });
});

/**
 * POST /api/users/service-areas
 * Add a service area
 */
router.post('/service-areas', (req: Request, res: Response) => {
  const { city, state, postcode, radius_miles } = req.body;

  if (!city) {
    res.status(400).json({ success: false, error: 'City is required' });
    return;
  }

  const area = userService.addServiceArea(req.user!.user_id, {
    city, state: state || null, postcode: postcode || null, radius_miles: radius_miles || null
  });

  // Auto-advance onboarding
  userService.advanceOnboarding(req.user!.user_id, 'service_areas');

  res.status(201).json({ success: true, data: area });
});

/**
 * DELETE /api/users/service-areas/:id
 * Delete a service area
 */
router.delete('/service-areas/:id', (req: Request, res: Response) => {
  const deleted = userService.deleteServiceArea(req.params.id, req.user!.user_id);
  if (!deleted) {
    res.status(404).json({ success: false, error: 'Service area not found' });
    return;
  }
  res.json({ success: true, message: 'Service area deleted' });
});

/**
 * GET /api/users/onboarding
 * Get onboarding progress
 */
router.get('/onboarding', (req: Request, res: Response) => {
  const progress = userService.getOnboardingProgress(req.user!.user_id);
  res.json({ success: true, data: progress });
});

/**
 * POST /api/users/onboarding/advance
 * Advance onboarding to a specific step
 */
router.post('/onboarding/advance', (req: Request, res: Response) => {
  const { step } = req.body;
  if (!step) {
    res.status(400).json({ success: false, error: 'Step is required' });
    return;
  }

  const advanced = userService.advanceOnboarding(req.user!.user_id, step);
  if (!advanced) {
    res.status(400).json({ success: false, error: 'Could not advance onboarding' });
    return;
  }

  res.json({ success: true, message: `Onboarding advanced to ${step}` });
});

/**
 * POST /api/users/website-subdomain
 * Set website subdomain (used by Website Builder team member)
 */
router.post('/website-subdomain', (req: Request, res: Response) => {
  const { subdomain } = req.body;
  if (!subdomain) {
    res.status(400).json({ success: false, error: 'Subdomain is required' });
    return;
  }

  // Validate subdomain format
  if (!/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(subdomain)) {
    res.status(400).json({ success: false, error: 'Invalid subdomain format' });
    return;
  }

  const success = userService.setWebsiteSubdomain(req.user!.user_id, subdomain);
  if (!success) {
    res.status(409).json({ success: false, error: 'Subdomain already taken' });
    return;
  }

  res.json({ success: true, data: { subdomain, url: `https://${subdomain}.tenddapp.uk` } });
});

export default router;