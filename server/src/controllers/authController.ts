import { Request, Response } from 'express';
import { z } from 'zod';
import { loginUser, refreshSession, AuthenticationError } from '../services/authService.js';
import { getEnv } from '../config/env.js';
import { getSupabaseAdmin } from '../db/supabase.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  gatewayRole: z.enum(['INSTITUTION', 'SCRUTINY_OFFICER', 'APPROVING_AUTHORITY', 'ADMIN', 'AUDITOR']).optional()
});

const isProduction = process.env.NODE_ENV === 'production';
const COOKIE_OPTIONS_BASE = {
  httpOnly: true,
  secure: isProduction,
  sameSite: (isProduction ? 'none' : 'lax') as 'none' | 'lax',
  path: '/'
};

export async function loginHandler(req: Request, res: Response): Promise<void> {
  const parseResult = loginSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'Invalid email or password format.',
      details: parseResult.error.flatten().fieldErrors
    });
    return;
  }

  const { email, password, gatewayRole } = parseResult.data;
  const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const userAgent = req.headers['user-agent'] || 'unknown';

  try {
    const result = await loginUser(email, password, ip, userAgent, gatewayRole);

    // Set httpOnly, Secure, SameSite=Strict cookies
    res.cookie('access_token', result.accessToken, {
      ...COOKIE_OPTIONS_BASE,
      maxAge: 60 * 60 * 1000 // 1 hour
    });

    res.cookie('refresh_token', result.refreshToken, {
      ...COOKIE_OPTIONS_BASE,
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Return only the sanitized user profile (NO tokens in JSON body)
    res.status(200).json({
      message: 'Login successful',
      user: result.user
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      res.status(error.statusCode).json({
        error: error.code || (error.statusCode === 403 ? 'Forbidden' : error.statusCode === 429 ? 'Too Many Requests' : 'Unauthorized'),
        message: error.message,
        code: error.code
      });
      return;
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Authentication failed.'
    });
  }
}

export async function refreshHandler(req: Request, res: Response): Promise<void> {
  const refreshToken = req.cookies?.refresh_token;
  if (!refreshToken) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Refresh token cookie missing.'
    });
    return;
  }

  const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const userAgent = req.headers['user-agent'] || 'unknown';

  try {
    const result = await refreshSession(refreshToken, ip, userAgent);

    res.cookie('access_token', result.accessToken, {
      ...COOKIE_OPTIONS_BASE,
      maxAge: 60 * 60 * 1000
    });

    res.cookie('refresh_token', result.refreshToken, {
      ...COOKIE_OPTIONS_BASE,
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.status(200).json({
      message: 'Session refreshed successfully',
      user: result.user
    });
  } catch (error) {
    // Clear cookies on invalid refresh token
    res.clearCookie('access_token', COOKIE_OPTIONS_BASE);
    res.clearCookie('refresh_token', COOKIE_OPTIONS_BASE);

    if (error instanceof AuthenticationError) {
      res.status(error.statusCode).json({
        error: 'Unauthorized',
        message: error.message,
        code: error.code
      });
      return;
    }

    res.status(401).json({
      error: 'Unauthorized',
      message: 'Failed to refresh authentication session.'
    });
  }
}

export async function logoutHandler(req: Request, res: Response): Promise<void> {
  try {
    const refreshToken = req.cookies?.refresh_token;
    if (refreshToken) {
      const supabase = getSupabaseAdmin();
      await supabase.auth.admin.signOut(refreshToken).catch(() => {});
    }
  } catch {
    // Silently continue clearing client cookies
  }

  res.clearCookie('access_token', COOKIE_OPTIONS_BASE);
  res.clearCookie('refresh_token', COOKIE_OPTIONS_BASE);

  res.status(200).json({
    message: 'Logged out successfully'
  });
}

export function meHandler(req: Request, res: Response): void {
  if (!req.user) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Not authenticated.'
    });
    return;
  }

  res.status(200).json({
    user: req.user
  });
}
