import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { setupTestDb, teardownTestDb, clearTestDb } from './helpers/testDb.js';
import { createTestToken, createForgedToken } from './helpers/jwtHelper.js';
import { cacheUserProfile, clearProfileCache } from '../src/services/userService.js';
import { recordFailedAttempt, checkLockout } from '../src/services/authService.js';

describe('Authentication & Session Management', () => {
  const app = createApp();

  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
    clearProfileCache();
  });

  it('rejects access to protected routes without a token (401)', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  it('rejects forged JWT signed with an untrusted secret (401)', async () => {
    const forgedToken = await createForgedToken({ sub: 'user-hacker-123' });

    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${forgedToken}`);

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/Invalid or expired token/);
  });

  it('authenticates valid JWT and returns profile via cookie or Bearer header', async () => {
    const userId = '11111111-1111-1111-1111-111111111111';
    cacheUserProfile({
      id: userId,
      fullName: 'Dr. Ramesh Sharma',
      role: 'INSTITUTION',
      institutionId: 'inst-999',
      isActive: true,
      createdAt: new Date().toISOString()
    });

    const validToken = await createTestToken({ sub: userId });

    const res = await request(app)
      .get('/auth/me')
      .set('Cookie', [`access_token=${validToken}`]);

    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.id).toBe(userId);
    expect(res.body.user.role).toBe('INSTITUTION');
    expect(res.body.user.institutionId).toBe('inst-999');
  });

  it('rejects authenticated users whose profiles are inactive (403)', async () => {
    const userId = '22222222-2222-2222-2222-222222222222';
    cacheUserProfile({
      id: userId,
      fullName: 'Suspended Institution Officer',
      role: 'INSTITUTION',
      institutionId: 'inst-888',
      isActive: false, // Inactive account
      createdAt: new Date().toISOString()
    });

    const token = await createTestToken({ sub: userId });

    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Account is deactivated/);
  });

  it('enforces 15-minute account lockout after 5 consecutive failed attempts', async () => {
    const targetEmail = 'target.user@aicte.gov.in';
    const testIp = '192.168.1.100';

    // Simulate 4 failed attempts
    for (let i = 0; i < 4; i++) {
      await recordFailedAttempt(targetEmail, testIp);
    }

    // Still not locked
    await expect(checkLockout(targetEmail, testIp)).resolves.not.toThrow();

    // 5th failed attempt triggers lock
    await recordFailedAttempt(targetEmail, testIp);

    // Now lockout check throws 429
    await expect(checkLockout(targetEmail, testIp)).rejects.toThrow(/temporarily locked/);
  });

  it('clears access and refresh token cookies on logout', async () => {
    const res = await request(app).post('/auth/logout');
    expect(res.status).toBe(200);

    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies).toBeDefined();

    // Ensure cookies are cleared (max-age=0 or expires in past)
    const accessCookie = cookies.find(c => c.startsWith('access_token='));
    const refreshCookie = cookies.find(c => c.startsWith('refresh_token='));
    expect(accessCookie).toMatch(/access_token=;/);
    expect(refreshCookie).toMatch(/refresh_token=;/);
  });
});
