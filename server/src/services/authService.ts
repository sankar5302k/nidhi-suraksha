import * as jose from 'jose';
import { getEnv } from '../config/env.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { LoginAttempt } from '../models/loginAttempt.js';
import { hashEmail } from '../utils/crypto.js';
import { getUserProfile, cacheUserProfile } from './userService.js';
import { recordAuditLog } from './auditService.js';
import { AuthenticatedUser, UserRole } from '../types/auth.js';

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export interface DemoAccountConfig {
  email: string;
  allowedPasswords: string[];
  user: AuthenticatedUser;
}

export const DEMO_ACCOUNTS: Record<string, DemoAccountConfig> = {
  'registrar@diet-delhi.ac.in': {
    email: 'registrar@diet-delhi.ac.in',
    allowedPasswords: ['Institute@123', 'aicte@123', 'Password@123', '123456'],
    user: {
      id: '10000000-0000-0000-0000-000000000001',
      email: 'registrar@diet-delhi.ac.in',
      role: 'INSTITUTION',
      institutionId: '10000000-0000-0000-0000-000000000001',
      aal: 'aal1',
      isActive: true,
      fullName: 'Dr. Rajiv Malhotra (Delhi Institute)'
    }
  },
  'scrutiny.officer@aicte.gov.in': {
    email: 'scrutiny.officer@aicte.gov.in',
    allowedPasswords: ['Officer@123', 'aicte@123', 'Password@123', '123456'],
    user: {
      id: '20000000-0000-0000-0000-000000000002',
      email: 'scrutiny.officer@aicte.gov.in',
      role: 'SCRUTINY_OFFICER',
      aal: 'aal2',
      isActive: true,
      fullName: 'Shri A. K. Sharma (Scrutiny Officer)'
    }
  },
  'authority@aicte.gov.in': {
    email: 'authority@aicte.gov.in',
    allowedPasswords: ['Authority@123', 'aicte@123', 'Password@123', '123456'],
    user: {
      id: '30000000-0000-0000-0000-000000000003',
      email: 'authority@aicte.gov.in',
      role: 'APPROVING_AUTHORITY',
      aal: 'aal2',
      isActive: true,
      fullName: 'Prof. T. G. Sitharam (Approving Authority)'
    }
  },
  'admin@aicte.gov.in': {
    email: 'admin@aicte.gov.in',
    allowedPasswords: ['Admin@123', 'aicte@123', 'Password@123', '123456'],
    user: {
      id: '40000000-0000-0000-0000-000000000004',
      email: 'admin@aicte.gov.in',
      role: 'ADMIN',
      aal: 'aal2',
      isActive: true,
      fullName: 'System Administrator (AICTE Cell)'
    }
  },
  'auditor@aicte.gov.in': {
    email: 'auditor@aicte.gov.in',
    allowedPasswords: ['Auditor@123', 'aicte@123', 'Password@123', '123456'],
    user: {
      id: '50000000-0000-0000-0000-000000000005',
      email: 'auditor@aicte.gov.in',
      role: 'AUDITOR',
      aal: 'aal2',
      isActive: true,
      fullName: 'Chief Vigilance Auditor'
    }
  }
};

async function generateSignedTokens(user: AuthenticatedUser): Promise<{ accessToken: string; refreshToken: string }> {
  const env = getEnv();
  const secret = new TextEncoder().encode(env.SUPABASE_JWT_SECRET);

  const accessToken = await new jose.SignJWT({
    sub: user.id,
    email: user.email,
    role: 'authenticated',
    aal: user.aal
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret);

  const refreshToken = await new jose.SignJWT({
    sub: user.id,
    email: user.email,
    token_type: 'refresh'
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret);

  return { accessToken, refreshToken };
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: AuthenticatedUser;
}

export class AuthenticationError extends Error {
  statusCode: number;
  code?: string;
  constructor(message: string, statusCode = 401, code?: string) {
    super(message);
    this.name = 'AuthenticationError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Checks if the email/IP combination is currently locked out
 */
export async function checkLockout(email: string, ip: string): Promise<void> {
  const emailH = hashEmail(email);
  const key = `${emailH}_${ip}`;

  const attempt = await LoginAttempt.findOne({ key });
  if (attempt && attempt.lockedUntil) {
    if (attempt.lockedUntil.getTime() > Date.now()) {
      const remainingMinutes = Math.ceil((attempt.lockedUntil.getTime() - Date.now()) / 60000);
      throw new AuthenticationError(
        `Account temporarily locked due to excessive failed attempts. Please try again in ${remainingMinutes} minute(s).`,
        429,
        'ACCOUNT_LOCKED'
      );
    }
  }
}

/**
 * Increments failed login count and triggers 15-minute lock upon 5 failures
 */
export async function recordFailedAttempt(email: string, ip: string, userAgent = 'unknown'): Promise<void> {
  const emailH = hashEmail(email);
  const key = `${emailH}_${ip}`;

  const attempt = await LoginAttempt.findOneAndUpdate(
    { key },
    {
      $inc: { failedAttempts: 1 },
      $setOnInsert: { emailHash: emailH, ip }
    },
    { new: true, upsert: true }
  );

  let locked = false;
  if (attempt.failedAttempts >= MAX_FAILED_ATTEMPTS) {
    attempt.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
    await attempt.save();
    locked = true;
  }

  // Audit log failed attempt without logging plaintext email
  try {
    await recordAuditLog({
      actorId: `unauth_${emailH.slice(0, 8)}`,
      actorRole: 'ANONYMOUS',
      action: locked ? 'AUTH_ACCOUNT_LOCKED' : 'AUTH_LOGIN_FAILED',
      entityType: 'AUTH',
      entityId: emailH.slice(0, 16),
      ip,
      userAgent,
      after: {
        failedCount: attempt.failedAttempts,
        locked
      }
    });
  } catch {
    // Prevent audit failure from masking auth error
  }
}

/**
 * Resets failed login count upon successful authentication
 */
export async function resetFailedAttempts(email: string, ip: string): Promise<void> {
  const emailH = hashEmail(email);
  const key = `${emailH}_${ip}`;
  await LoginAttempt.deleteOne({ key });
}

/**
 * Authenticates user through pre-configured demo credentials or Supabase Auth
 */
export async function loginUser(
  email: string,
  pass: string,
  ip: string,
  userAgent = 'unknown',
  gatewayRole?: string
): Promise<LoginResult> {
  const normalizedEmail = email.trim().toLowerCase();

  // 1. Check for lockout
  await checkLockout(normalizedEmail, ip);

  // 2. Check if this is a pre-configured demo account
  const demoAccount = DEMO_ACCOUNTS[normalizedEmail];
  if (demoAccount) {
    const isPasswordValid = demoAccount.allowedPasswords.includes(pass);
    if (!isPasswordValid) {
      await recordFailedAttempt(normalizedEmail, ip, userAgent);
      throw new AuthenticationError('Invalid password. Check the preset password list for this role.', 401, 'INVALID_CREDENTIALS');
    }

    // Enforce gateway match if gatewayRole is provided
    if (gatewayRole && demoAccount.user.role !== gatewayRole) {
      throw new AuthenticationError(
        `Access denied for this gateway. Your account role is ${demoAccount.user.role}, but this gateway is designated for ${gatewayRole}.`,
        403,
        'GATEWAY_ROLE_MISMATCH'
      );
    }

    // Reset failed attempts
    await resetFailedAttempts(normalizedEmail, ip);

    // Cache user profile
    cacheUserProfile({
      id: demoAccount.user.id,
      fullName: demoAccount.user.fullName || '',
      role: demoAccount.user.role,
      institutionId: demoAccount.user.institutionId,
      isActive: true,
      createdAt: new Date().toISOString()
    });

    // Generate signed JWTs
    const { accessToken, refreshToken } = await generateSignedTokens(demoAccount.user);

    // Record audit log
    try {
      await recordAuditLog({
        actorId: demoAccount.user.id,
        actorRole: demoAccount.user.role,
        action: 'AUTH_LOGIN_SUCCESS',
        entityType: 'AUTH',
        entityId: demoAccount.user.id,
        ip,
        userAgent,
        after: {
          role: demoAccount.user.role,
          aal: demoAccount.user.aal,
          type: 'DEMO_PORTAL_LOGIN'
        }
      });
    } catch {
      // Non-fatal
    }

    return {
      accessToken,
      refreshToken,
      user: demoAccount.user
    };
  }

  // 3. Authenticate credentials via Supabase Auth
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password: pass
    });

    if (error || !data.session || !data.user) {
      await recordFailedAttempt(normalizedEmail, ip, userAgent);
      throw new AuthenticationError(error?.message || 'Invalid credentials.', 401, 'INVALID_CREDENTIALS');
    }

    // Verify user profile and active status
    const profile = await getUserProfile(data.user.id);
    if (!profile) {
      await recordFailedAttempt(normalizedEmail, ip, userAgent);
      throw new AuthenticationError('User profile not found.', 401, 'PROFILE_NOT_FOUND');
    }

    if (!profile.isActive) {
      throw new AuthenticationError(
        'Account is inactive or pending approval. Contact the AICTE administrator.',
        403,
        'ACCOUNT_INACTIVE'
      );
    }

    // Enforce gateway match if gatewayRole is provided
    if (gatewayRole && profile.role !== gatewayRole) {
      throw new AuthenticationError(
        `Access denied for this gateway. Your account role is ${profile.role}, but this gateway is designated for ${gatewayRole}.`,
        403,
        'GATEWAY_ROLE_MISMATCH'
      );
    }

    // Reset failed attempts
    await resetFailedAttempts(normalizedEmail, ip);

    const aal = (data.session.user.app_metadata?.aal as 'aal1' | 'aal2') || 'aal1';

    const user: AuthenticatedUser = {
      id: profile.id,
      email: data.user.email,
      role: profile.role,
      institutionId: profile.institutionId,
      aal,
      isActive: profile.isActive,
      fullName: profile.fullName
    };

    try {
      await recordAuditLog({
        actorId: user.id,
        actorRole: user.role,
        action: 'AUTH_LOGIN_SUCCESS',
        entityType: 'AUTH',
        entityId: user.id,
        ip,
        userAgent,
        after: {
          role: user.role,
          aal: user.aal
        }
      });
    } catch {
      // Non-fatal
    }

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      user
    };
  } catch (err: any) {
    if (err instanceof AuthenticationError) {
      throw err;
    }
    await recordFailedAttempt(normalizedEmail, ip, userAgent);
    throw new AuthenticationError(
      err?.message?.includes('fetch failed')
        ? 'Authentication provider connection failed. Please use one of the demo portal accounts below.'
        : 'Authentication failed.',
      401,
      'AUTH_ERROR'
    );
  }
}

/**
 * Refreshes session using refresh token cookie with built-in token rotation
 */
export async function refreshSession(
  refreshTokenString: string,
  ip: string,
  userAgent = 'unknown'
): Promise<{ accessToken: string; refreshToken: string; user: AuthenticatedUser }> {
  // First try verifying if it's a locally signed demo refresh token
  try {
    const env = getEnv();
    const secret = new TextEncoder().encode(env.SUPABASE_JWT_SECRET);
    const { payload } = await jose.jwtVerify(refreshTokenString, secret);
    const userId = payload.sub;
    if (userId) {
      const profile = await getUserProfile(userId);
      if (profile && profile.isActive) {
        const user: AuthenticatedUser = {
          id: profile.id,
          email: (payload.email as string) || '',
          role: profile.role,
          institutionId: profile.institutionId,
          aal: (payload.aal as 'aal1' | 'aal2') || 'aal1',
          isActive: profile.isActive,
          fullName: profile.fullName
        };
        const tokens = await generateSignedTokens(user);
        return {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          user
        };
      }
    }
  } catch {
    // Continue to Supabase refresh
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: refreshTokenString
  });

  if (error || !data.session || !data.user) {
    throw new AuthenticationError('Invalid or expired refresh token.', 401, 'INVALID_REFRESH_TOKEN');
  }

  const profile = await getUserProfile(data.user.id);
  if (!profile || !profile.isActive) {
    throw new AuthenticationError('User profile is inactive.', 403, 'ACCOUNT_INACTIVE');
  }

  const aal = (data.session.user.app_metadata?.aal as 'aal1' | 'aal2') || 'aal1';

  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    user: {
      id: profile.id,
      email: data.user.email,
      role: profile.role,
      institutionId: profile.institutionId,
      aal,
      isActive: profile.isActive,
      fullName: profile.fullName
    }
  };
}
