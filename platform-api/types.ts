// ============================================================
// Tendd Shared Types
// Shared across all Tendd services (API, Integrations, Chatbot, Website)
// ============================================================

/** Subscription tiers */
export type SubscriptionTier = 'starter' | 'growth' | 'pro';
export type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'trialing' | 'incomplete';

/** Onboarding progress steps */
export type OnboardingStep = 
  | 'account_created'
  | 'business_info'
  | 'services_added'
  | 'service_areas'
  | 'pricing_set'
  | 'booking_connected'
  | 'website_generated'
  | 'voice_setup'
  | 'social_connected'
  | 'complete';

/** User (trader) record */
export interface User {
  id: string;
  email: string;
  name: string;
  business_name: string | null;
  business_phone: string | null;
  business_address: string | null;
  business_description: string | null;
  logo_url: string | null;
  website_subdomain: string | null;
  onboarding_status: OnboardingStep;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

/** Subscription record */
export interface Subscription {
  id: string;
  user_id: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_start: string;
  current_period_end: string;
  created_at: string;
  updated_at: string;
}

/** Service a trader offers */
export interface Service {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  price_type: 'fixed' | 'hourly' | 'estimate' | 'range';
  min_price: number | null;
  max_price: number | null;
  price_currency: string;
  estimated_duration_minutes: number | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** Service area a trader covers */
export interface ServiceArea {
  id: string;
  user_id: string;
  city: string;
  state: string | null;
  postcode: string | null;
  radius_miles: number | null;
  created_at: string;
}

/** Lead captured from any channel */
export interface Lead {
  id: string;
  user_id: string;
  source: 'call' | 'website_chat' | 'website_form' | 'facebook_dm' | 'instagram_dm' | 'sms' | 'manual';
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  service_interest: string | null;
  description: string | null;
  status: 'new' | 'contacted' | 'quoted' | 'booked' | 'lost' | 'completed';
  quote_amount: number | null;
  created_at: string;
  updated_at: string;
}

/** Onboarding task checklist */
export interface OnboardingTask {
  id: string;
  user_id: string;
  step: OnboardingStep;
  completed: boolean;
  completed_at: string | null;
  metadata: string | null; // JSON blob for step-specific data
}

/** API response wrapper */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/** Pagination */
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

/** Auth payload for JWT */
export interface AuthPayload {
  user_id: string;
  email: string;
  tier: SubscriptionTier;
}