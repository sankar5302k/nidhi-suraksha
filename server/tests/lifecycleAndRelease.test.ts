import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { setupTestDb, teardownTestDb, clearTestDb } from './helpers/testDb.js';
import { createTestToken } from './helpers/jwtHelper.js';
import { cacheUserProfile, clearProfileCache } from '../src/services/userService.js';
import { cacheInstitution } from '../src/services/institutionService.js';
import { Fdr } from '../src/models/fdr.js';
import { ReleaseRequest } from '../src/models/releaseRequest.js';
import { encryptField, computeBlindIndex } from '../src/utils/crypto.js';

describe('FDR Lifecycle State Machine & Multi-Tier Release Separation of Duties', () => {
  const app = createApp();

  const INST_ID = '66666666-6666-6666-6666-666666666666';
  const INSTITUTION_USER_ID = 'user-inst-6';
  const OFFICER_USER_ID = 'officer-user-6';
  const AUTHORITY_USER_ID = 'authority-user-6';

  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
    clearProfileCache();

    cacheInstitution(INST_ID, 'Kolkata Institute of Technology');

    cacheUserProfile({
      id: INSTITUTION_USER_ID,
      fullName: 'Institute Representative',
      role: 'INSTITUTION',
      institutionId: INST_ID,
      isActive: true,
      createdAt: new Date().toISOString()
    });

    cacheUserProfile({
      id: OFFICER_USER_ID,
      fullName: 'Scrutiny Officer Mukherjee',
      role: 'SCRUTINY_OFFICER',
      isActive: true,
      createdAt: new Date().toISOString()
    });

    cacheUserProfile({
      id: AUTHORITY_USER_ID,
      fullName: 'Approving Authority Dr. Sen',
      role: 'APPROVING_AUTHORITY',
      isActive: true,
      createdAt: new Date().toISOString()
    });
  });

  async function createDraftFdr(): Promise<string> {
    const fdr = new Fdr({
      institutionId: INST_ID,
      fdrNumberEnc: encryptField('PNB000776655'),
      fdrNumberHash: computeBlindIndex('PNB000776655'),
      last4: '6655',
      bankName: 'Punjab National Bank',
      branch: 'Park Street, Kolkata',
      amount: 1500000,
      issueDate: new Date('2024-01-01'),
      maturityDate: new Date('2029-01-01'),
      lienInFavourOfAicte: true,
      status: 'DRAFT',
      verificationStatus: 'SUBMITTED_UNVERIFIED',
      createdBy: INSTITUTION_USER_ID
    });
    await fdr.save();
    return fdr.id;
  }

  it('enforces state machine transition: DRAFT -> SUBMITTED -> UNDER_SCRUTINY', async () => {
    const fdrId = await createDraftFdr();
    const instToken = await createTestToken({ sub: INSTITUTION_USER_ID });
    const officerToken = await createTestToken({ sub: OFFICER_USER_ID, aal: 'aal2' });

    // 1. Institution submits draft
    const submitRes = await request(app)
      .post(`/fdrs/${fdrId}/submit`)
      .set('Authorization', `Bearer ${instToken}`);

    expect(submitRes.status).toBe(200);
    expect(submitRes.body.data.status).toBe('SUBMITTED');

    // 2. Scrutiny officer takes into review
    const scrutinyRes = await request(app)
      .post(`/fdrs/${fdrId}/scrutiny`)
      .set('Authorization', `Bearer ${officerToken}`);

    expect(scrutinyRes.status).toBe(200);
    expect(scrutinyRes.body.data.status).toBe('UNDER_SCRUTINY');
  });

  it('rejects illegal state transition with 409 Conflict', async () => {
    const fdrId = await createDraftFdr();
    const officerToken = await createTestToken({ sub: OFFICER_USER_ID, aal: 'aal2' });

    // Trying to take DRAFT directly into UNDER_SCRUTINY without being SUBMITTED must return 409
    const res = await request(app)
      .post(`/fdrs/${fdrId}/scrutiny`)
      .set('Authorization', `Bearer ${officerToken}`);

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/Illegal state transition from 'DRAFT' to 'UNDER_SCRUTINY'/);
  });

  it('enforces Separation of Duties: Approving Authority CANNOT approve release they processed as Officer', async () => {
    // 1. Create an ACTIVE deposit
    const fdr = new Fdr({
      institutionId: INST_ID,
      fdrNumberEnc: encryptField('ICIC000889900'),
      fdrNumberHash: computeBlindIndex('ICIC000889900'),
      last4: '9900',
      bankName: 'ICICI Bank',
      branch: 'Salt Lake, Kolkata',
      amount: 2500000,
      issueDate: new Date('2020-01-01'),
      maturityDate: new Date('2025-01-01'),
      lienInFavourOfAicte: true,
      status: 'ACTIVE',
      verificationStatus: 'BANK_VERIFIED',
      createdBy: INSTITUTION_USER_ID
    });
    await fdr.save();

    // 2. Institution requests release
    const instToken = await createTestToken({ sub: INSTITUTION_USER_ID });
    const reqRes = await request(app)
      .post(`/fdrs/${fdr.id}/release-request`)
      .set('Authorization', `Bearer ${instToken}`)
      .send({ reason: 'Course tenure completed with zero pending deficiencies.' });

    expect(reqRes.status).toBe(201);
    const requestId = reqRes.body.data.releaseRequest._id || reqRes.body.data.releaseRequest.id;

    // 3. User with dual privilege (officer who processed it)
    const dualUserId = 'dual-privileged-user';
    cacheUserProfile({
      id: dualUserId,
      fullName: 'Dual Role Officer Authority',
      role: 'SCRUTINY_OFFICER',
      isActive: true,
      createdAt: new Date().toISOString()
    });

    const officerToken = await createTestToken({ sub: dualUserId, aal: 'aal2' });
    const processRes = await request(app)
      .post(`/release-requests/${requestId}/process`)
      .set('Authorization', `Bearer ${officerToken}`)
      .send({ decision: 'RECOMMEND', notes: 'All criteria satisfied.' });

    expect(processRes.status).toBe(200);

    // Now promote same user to APPROVING_AUTHORITY and attempt final decision
    cacheUserProfile({
      id: dualUserId,
      fullName: 'Dual Role Officer Authority',
      role: 'APPROVING_AUTHORITY',
      isActive: true,
      createdAt: new Date().toISOString()
    });

    const authorityToken = await createTestToken({ sub: dualUserId, aal: 'aal2' });
    const decisionRes = await request(app)
      .post(`/release-requests/${requestId}/decision`)
      .set('Authorization', `Bearer ${authorityToken}`)
      .send({ decision: 'APPROVE', notes: 'Final signoff' });

    // CRITICAL: Separation of duties violation must return 403 Forbidden!
    expect(decisionRes.status).toBe(403);
    expect(decisionRes.body.message).toMatch(/Separation of Duties violation/);
  });

  it('allows distinct Approving Authority to approve release and transitions FDR to RELEASED', async () => {
    // 1. Create an ACTIVE deposit
    const fdr = new Fdr({
      institutionId: INST_ID,
      fdrNumberEnc: encryptField('AXIS000112233'),
      fdrNumberHash: computeBlindIndex('AXIS000112233'),
      last4: '2233',
      bankName: 'Axis Bank',
      branch: 'Sector 5, Kolkata',
      amount: 1200000,
      issueDate: new Date('2020-02-01'),
      maturityDate: new Date('2025-02-01'),
      lienInFavourOfAicte: true,
      status: 'ACTIVE',
      verificationStatus: 'BANK_VERIFIED',
      createdBy: INSTITUTION_USER_ID
    });
    await fdr.save();

    const instToken = await createTestToken({ sub: INSTITUTION_USER_ID });
    const reqRes = await request(app)
      .post(`/fdrs/${fdr.id}/release-request`)
      .set('Authorization', `Bearer ${instToken}`)
      .send({ reason: 'Compliance completed.' });

    const requestId = reqRes.body.data.releaseRequest._id || reqRes.body.data.releaseRequest.id;

    // 2. Scrutiny Officer processes
    const officerToken = await createTestToken({ sub: OFFICER_USER_ID, aal: 'aal2' });
    await request(app)
      .post(`/release-requests/${requestId}/process`)
      .set('Authorization', `Bearer ${officerToken}`)
      .send({ decision: 'RECOMMEND' });

    // 3. Different Approving Authority approves
    const authorityToken = await createTestToken({ sub: AUTHORITY_USER_ID, aal: 'aal2' });
    const decisionRes = await request(app)
      .post(`/release-requests/${requestId}/decision`)
      .set('Authorization', `Bearer ${authorityToken}`)
      .send({ decision: 'APPROVE', notes: 'Authorized for refund and lien removal.' });

    expect(decisionRes.status).toBe(200);
    expect(decisionRes.body.data.fdr.status).toBe('RELEASED');
    expect(decisionRes.body.data.releaseRequest.status).toBe('APPROVED');

    const updatedFdr = await Fdr.findById(fdr.id);
    expect(updatedFdr!.status).toBe('RELEASED');
  });
});
