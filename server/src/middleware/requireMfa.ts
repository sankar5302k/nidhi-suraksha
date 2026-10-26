import { Request, Response, NextFunction } from 'express';

const MFA_REQUIRED_ROLES = ['SCRUTINY_OFFICER', 'APPROVING_AUTHORITY', 'ADMIN', 'AUDITOR'];

/**
 * Middleware that requires aal2 (TOTP MFA verified) for privileged roles:
 * SCRUTINY_OFFICER, APPROVING_AUTHORITY, ADMIN, and AUDITOR.
 */
export function requireMfa(req: Request, res: Response, next: NextFunction): void {
  const user = req.user;
  if (!user) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required.'
    });
    return;
  }

  // If user role is one of the privileged roles, require aal2
  if (MFA_REQUIRED_ROLES.includes(user.role)) {
    if (user.aal !== 'aal2') {
      res.status(403).json({
        error: 'MFA_REQUIRED',
        message: 'Multi-factor authentication (AAL2) is mandatory for this privileged role.',
        code: 'AAL2_REQUIRED'
      });
      return;
    }
  }

  next();
}
