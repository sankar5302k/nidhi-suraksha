import { Request, Response, NextFunction } from 'express';
import * as jose from 'jose';
import { getEnv } from '../config/env.js';
import { getUserProfile } from '../services/userService.js';
import { AuthenticatedUser, UserRole } from '../types/auth.js';

export async function authenticateToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // 1. Extract token from httpOnly cookie, Authorization Bearer header, or query token param
    let token: string | undefined = req.cookies?.access_token;

    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.slice(7).trim();
    }

    if (!token && typeof req.query?.token === 'string') {
      token = req.query.token.trim();
    }

    if (!token) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication token missing.'
      });
      return;
    }

    // 2. Verify JWT with jose using SUPABASE_JWT_SECRET
    const env = getEnv();
    const secret = new TextEncoder().encode(env.SUPABASE_JWT_SECRET);

    let verifiedPayload: jose.JWTPayload;
    try {
      const { payload } = await jose.jwtVerify(token, secret);
      verifiedPayload = payload;
    } catch {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired token.'
      });
      return;
    }

    const userId = verifiedPayload.sub;
    if (!userId) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Token subject missing.'
      });
      return;
    }

    // 3. Load user profile from Supabase
    const profile = await getUserProfile(userId);
    if (!profile) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'User profile does not exist.'
      });
      return;
    }

    // 4. Reject inactive users
    if (!profile.isActive) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Account is deactivated. Contact AICTE administrator.'
      });
      return;
    }

    // 5. Determine MFA assurance level (aal1 vs aal2)
    const aal = (verifiedPayload.aal as 'aal1' | 'aal2') || 'aal1';

    // 6. Attach authenticated user to request
    const user: AuthenticatedUser = {
      id: profile.id,
      email: (verifiedPayload.email as string) || '',
      role: profile.role,
      institutionId: profile.institutionId,
      aal,
      isActive: profile.isActive,
      fullName: profile.fullName
    };

    req.user = user;
    next();
  } catch {
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Authentication failed due to an unexpected server error.'
    });
  }
}
