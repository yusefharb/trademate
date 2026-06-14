import { Request, Response, NextFunction } from 'express';
import { verifyToken, getUserById } from '../services/auth';
import type { AuthPayload } from '../../../shared/types';

// Extend Express Request to include user info
declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload & { dbUser?: any };
    }
  }
}

/**
 * Require a valid JWT token for a route
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.split(' ')[1];
  const payload = verifyToken(token);

  if (!payload) {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
    return;
  }

  req.user = payload;
  
  // Load full user record
  const user = getUserById(payload.user_id);
  if (!user) {
    res.status(401).json({ success: false, error: 'User not found' });
    return;
  }
  
  req.user.dbUser = user;
  next();
}

/**
 * Require a specific subscription tier
 */
export function requireTier(...tiers: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !tiers.includes(req.user.tier)) {
      res.status(403).json({
        success: false,
        error: `This feature requires a ${tiers.join(' or ')} subscription`
      });
      return;
    }
    next();
  };
}

/**
 * Optional auth (doesn't error if no token, but attaches user if present)
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const payload = verifyToken(token);
    if (payload) {
      req.user = payload;
      const user = getUserById(payload.user_id);
      if (user) {
        req.user.dbUser = user;
      }
    }
  }

  next();
}