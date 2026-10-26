import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express, { Request, Response } from 'express';
import { createApp } from '../src/app.js';
import { setupTestDb, teardownTestDb, clearTestDb } from './helpers/testDb.js';
import { createTestToken } from './helpers/jwtHelper.js';
import { cacheUserProfile, clearProfileCache } from '../src/services/userService.js';
import { authenticateToken } from '../src/middleware/auth.js';
import { requireMfa } from '../src/middleware/requireMfa.js';
import { requireRole } from '../src/middleware/rbac.js';

describe('RBAC & Multi-Factor Authentication (AAL2) Enforcement', () => {
  const app = createApp();

  // Create isolated express app for testing the officer-action middleware pipeline
  const mfaTestApp = express();
  mfaTestApp.use(express.json());
  mfaTestApp.get(
    '/test/officer-action',
    authenticateToken,
    requireRole('SCRUTINY_OFFICER'),
    requireMfa,
    (req: Request, res: Response) => {
      res.status(200).json({ message: 'Officer action executed' });
    }
  );

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

  it('rejects INSTITUTION role accessing restricted auditor endpoint (/audit/verify-chain) with 403', async () => {
    const instUserId = 'inst-user-1';
    cacheUserProfile({
      id: instUserId,
      fullName: 'Institute Representative',
      role: 'INSTITUTION',
      institutionId: 'inst-1',
      isActive: true,
      createdAt: new Date().toISOString()
    });

    const token = await createTestToken({ sub: instUserId });

    const res = await request(app)
      .get('/audit/verify-chain')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/do not have permission/);
  });

  it('rejects AUDITOR role with aal1 session (requires AAL2 TOTP) from /audit/verify-chain with 403', async () => {
    const auditorId = 'auditor-aal1';
    cacheUserProfile({
      id: auditorId,
      fullName: 'Internal Auditor',
      role: 'AUDITOR',
      isActive: true,
      createdAt: new Date().toISOString()
    });

    const token = await createTestToken({ sub: auditorId, aal: 'aal1' });

    const res = await request(app)
      .get('/audit/verify-chain')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('MFA_REQUIRED');
    expect(res.body.code).toBe('AAL2_REQUIRED');
  });

  it('allows AUDITOR role with verified aal2 session to access /audit/verify-chain', async () => {
    const auditorId = 'auditor-1';
    cacheUserProfile({
      id: auditorId,
      fullName: 'Internal Auditor',
      role: 'AUDITOR',
      isActive: true,
      createdAt: new Date().toISOString()
    });

    const token = await createTestToken({ sub: auditorId, aal: 'aal2' });

    const res = await request(app)
      .get('/audit/verify-chain')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.valid).toBe(true);
  });

  it('rejects privileged SCRUTINY_OFFICER with aal1 session (requires AAL2 TOTP) with 403', async () => {
    const officerId = 'officer-1';
    cacheUserProfile({
      id: officerId,
      fullName: 'Shri Verma (Scrutiny Officer)',
      role: 'SCRUTINY_OFFICER',
      isActive: true,
      createdAt: new Date().toISOString()
    });

    // Session has only aal1
    const aal1Token = await createTestToken({ sub: officerId, aal: 'aal1' });

    const res = await request(mfaTestApp)
      .get('/test/officer-action')
      .set('Authorization', `Bearer ${aal1Token}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('MFA_REQUIRED');
    expect(res.body.code).toBe('AAL2_REQUIRED');
  });

  it('accepts privileged SCRUTINY_OFFICER with verified aal2 session', async () => {
    const officerId = 'officer-2';
    cacheUserProfile({
      id: officerId,
      fullName: 'Smt Patel (Scrutiny Officer)',
      role: 'SCRUTINY_OFFICER',
      isActive: true,
      createdAt: new Date().toISOString()
    });

    // Session has aal2
    const aal2Token = await createTestToken({ sub: officerId, aal: 'aal2' });

    const res = await request(mfaTestApp)
      .get('/test/officer-action')
      .set('Authorization', `Bearer ${aal2Token}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Officer action executed');
  });
});
