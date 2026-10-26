import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../types/auth.js';

/**
 * Middleware factory for Role-Based Access Control.
 * Denies access by default if user or role is missing.
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;

    if (!user) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required.'
      });
      return;
    }

    if (!allowedRoles.includes(user.role)) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to perform this action.'
      });
      return;
    }

    next();
  };
}
