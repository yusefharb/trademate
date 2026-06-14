import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import dotenv from 'dotenv';

// Load env vars
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

import { runMigrations } from './db/connection';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import subRoutes from './routes/subscriptions';
import leadRoutes from './routes/leads';
import adminRoutes from './routes/admin';
import webhookRoutes from './routes/webhooks';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';

// ============================================================
// Middleware
// ============================================================

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Request logging
app.use((req, _res, next) => {
  const start = Date.now();
  _res.on('finish', () => {
    const duration = Date.now() - start;
    if (process.env.NODE_ENV !== 'test') {
      console.log(`${req.method} ${req.path} ${_res.statusCode} ${duration}ms`);
    }
  });
  next();
});

// ============================================================
// Health Check
// ============================================================

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.1.0', timestamp: new Date().toISOString() });
});

// ============================================================
// Routes
// ============================================================

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/subscriptions', subRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/webhooks', webhookRoutes);

// ============================================================
// Static: Admin Dashboard
// ============================================================
app.use('/admin', express.static(path.resolve(__dirname, '../admin')));

// ============================================================
// Static: Onboarding Wizard
// ============================================================
app.use('/onboarding', express.static(path.resolve(__dirname, '../onboarding')));

// ============================================================
// 404 Handler
// ============================================================

app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// ============================================================
// Error Handler
// ============================================================

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ============================================================
// Start
// ============================================================

async function start() {
  try {
    console.log('Running database migrations...');
    runMigrations();
    console.log('✓ Database ready');

    app.listen(PORT, HOST, () => {
      console.log(`\n  🏗️  Trademate API v0.1.0`);
      console.log(`  📡 Listening on http://${HOST}:${PORT}`);
      console.log(`  🩺 Health: http://${HOST}:${PORT}/api/health`);
      console.log(`  🌍 Environment: ${process.env.NODE_ENV || 'development'}\n`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
