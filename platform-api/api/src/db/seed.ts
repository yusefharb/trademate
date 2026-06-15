import { v4 as uuid } from 'uuid';
import { getDb, runMigrations, closeDb } from './connection';

console.log('Seeding database...');
runMigrations();

const db = getDb();

const now = new Date().toISOString();
const demoUserId = uuid();

// Create demo trader user
db.prepare(`
  INSERT INTO users (id, email, name, business_name, business_phone, business_address, business_description, onboarding_status, onboarding_completed, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  demoUserId,
  'demo@tenddapp.uk',
  'Dave Smith',
  'Smith & Sons Plumbing',
  '+44 7700 900123',
  '42 High Street, London, EC1A 1BB',
  'Family-run plumbing business serving Greater London. Specialising in emergency repairs, boiler installations, and bathroom renovations.',
  'pricing_set',
  0,
  now,
  now
);

// Create subscription
db.prepare(`
  INSERT INTO subscriptions (id, user_id, tier, status, current_period_start, current_period_end, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run(uuid(), demoUserId, 'growth', 'trialing', now, new Date(Date.now() + 14 * 86400000).toISOString(), now, now);

// Create services
const services = [
  { name: 'Emergency Plumbing Repair', price_type: 'fixed', min_price: 95, max_price: 195, desc: '24/7 emergency call-out for burst pipes, leaks, and blocked drains' },
  { name: 'Boiler Installation', price_type: 'range', min_price: 1500, max_price: 4500, desc: 'Full boiler replacement including removal of old unit' },
  { name: 'Bathroom Renovation', price_type: 'estimate', min_price: 5000, max_price: 15000, desc: 'Complete bathroom redesign and installation' },
  { name: 'Radiator Repair', price_type: 'fixed', min_price: 80, max_price: 250, desc: 'Bleeding, valve replacement, and leak repairs' },
];

services.forEach((svc, i) => {
  db.prepare(`
    INSERT INTO services (id, user_id, name, description, price_type, min_price, max_price, price_currency, is_active, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(uuid(), demoUserId, svc.name, svc.desc, svc.price_type, svc.min_price, svc.max_price, 'GBP', 1, i, now, now);
});

// Create service areas
const areas = ['London', 'Manchester', 'Birmingham', 'Leeds'];
areas.forEach(city => {
  db.prepare(`
    INSERT INTO service_areas (id, user_id, city, state, postcode, radius_miles, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(uuid(), demoUserId, city, 'England', null, 15, now);
});

// Create sample leads
const sampleLeads = [
  { name: 'Sarah Johnson', email: 'sarah@example.com', phone: '+44 7700 800111', service: 'Emergency Plumbing Repair', desc: 'Burst pipe under kitchen sink, need immediate help', status: 'new' },
  { name: 'Mark Williams', email: 'mark@example.com', phone: '+44 7700 800222', service: 'Boiler Installation', desc: 'Old boiler keeps breaking down, want a quote for replacement', status: 'quoted', amount: 3200 },
  { name: 'Emma Brown', email: 'emma@example.com', phone: '+44 7700 800333', service: 'Bathroom Renovation', desc: 'Want to renovate main bathroom, modern style', status: 'contacted' },
  { name: 'James Taylor', email: 'james@example.com', phone: '+44 7700 800444', service: 'Radiator Repair', desc: 'One radiator not heating up', status: 'booked' },
];

sampleLeads.forEach((lead, i) => {
  db.prepare(`
    INSERT INTO leads (id, user_id, source, customer_name, customer_email, customer_phone, service_interest, description, status, quote_amount, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    uuid(), demoUserId, 'website_chat', lead.name, lead.email, lead.phone,
    lead.service, lead.desc, lead.status, lead.amount || null,
    new Date(Date.now() - (i * 3600000)).toISOString(), now
  );
});

// Create onboarding progress
const steps = ['account_created', 'business_info', 'services_added', 'service_areas', 'pricing_set', 'booking_connected', 'website_generated', 'voice_setup', 'social_connected', 'complete'];
steps.forEach((step, i) => {
  const completed = i <= 4 ? 1 : 0;
  db.prepare(`
    INSERT INTO onboarding_tasks (id, user_id, step, completed, completed_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(uuid(), demoUserId, step, completed, completed ? now : null);
});

console.log('✓ Seed data created!');
console.log(`  Demo user email: demo@tenddapp.uk`);
console.log(`  Demo user ID: ${demoUserId}`);
console.log(`  Passwordless login via magic link.`);

closeDb();