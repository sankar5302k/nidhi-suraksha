import * as jose from 'jose';
import { getEnv } from '../../src/config/env.js';

export async function createTestToken(payload: {
  sub: string;
  email?: string;
  role?: string;
  aal?: 'aal1' | 'aal2';
  exp?: number;
}): Promise<string> {
  const env = getEnv();
  const secret = new TextEncoder().encode(env.SUPABASE_JWT_SECRET);

  const jwt = new jose.SignJWT({
    sub: payload.sub,
    email: payload.email || 'user@example.com',
    role: payload.role || 'authenticated',
    aal: payload.aal || 'aal1'
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime(payload.exp ? `${payload.exp}s` : '1h');

  return await jwt.sign(secret);
}

export async function createForgedToken(payload: { sub: string }): Promise<string> {
  // Signed with an invalid/forged secret
  const forgedSecret = new TextEncoder().encode('attacker-forged-secret-not-matching-supabase');
  const jwt = new jose.SignJWT({ sub: payload.sub, aal: 'aal1' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('1h');

  return await jwt.sign(forgedSecret);
}
