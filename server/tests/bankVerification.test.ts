import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { setupTestDb, teardownTestDb, clearTestDb } from './helpers/testDb.js';
import { createTestToken } from './helpers/jwtHelper.js';
import { cacheUserProfile, clearProfileCache } from '../src/services/userService.js';
import { cacheInstitution } from '../src/services/institutionService.js';
import { Fdr } from '../src/models/fdr.js';
import { encryptField, computeBlindIndex } from '../src/utils/crypto.js';

describe('Bank Verification Provider Adapter & State Transitions', () => {
  const app = createApp();

  const INST_ID = '55555555-5555-5555-5555-555555555555';
  const OFFICER_USER_ID = 'user-officer-verifier';

  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
    clearProfileCache();

    cacheInstitution(INST_ID, 'IIT Roorkee Affiliate');
    cacheUserProfile({
      id: OFFICER_USER_ID,
      fullName: 'Chief Scrutiny Officer',
      role: 'SCRUTINY_OFFICER',
      isActive: true,
      createdAt: new Date().toISOString()
    });
  });

  it('sets BANK_VERIFIED and ACTIVE when bank provider confirms matching records', async () => {
    // Seeded record in MockBankProvider: State Bank of India, SBIN00012345, 1500000, 2029-01-01
    const fdr = new Fdr({
      institutionId: INST_ID,
      fdrNumberEnc: encryptField('SBIN00012345'),
      fdrNumberHash: computeBlindIndex('SBIN00012345'),
      last4: '2345',
      bankName: 'State Bank of India',
      branch: 'Nariman Point, Mumbai',
      amount: 1500000,
      issueDate: new Date('2024-01-01'),
      maturityDate: new Date('2029-01-01'),
      lienInFavourOfAicte: true,
      status: 'UNDER_SCRUTINY',
      verificationStatus: 'SUBMITTED_UNVERIFIED',
      createdBy: 'inst-user'
    });
    await fdr.save();

    const officerToken = await createTestToken({ sub: OFFICER_USER_ID, aal: 'aal2' });

    const res = await request(app)
      .post(`/fdrs/${fdr.id}/verify`)
      .set('Authorization', `Bearer ${officerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.verificationStatus).toBe('BANK_VERIFIED');
    expect(res.body.data.status).toBe('ACTIVE');
    expect(res.body.data.bankResponse.status).toBe('VERIFIED');
    expect(res.body.data.bankResponse.verificationReference).toBeDefined();

    // Verify DB state
    const verifiedFdr = await Fdr.findById(fdr.id);
    expect(verifiedFdr!.verificationStatus).toBe('BANK_VERIFIED');
    expect(verifiedFdr!.status).toBe('ACTIVE');
  });

  it('sets DISCREPANCY_FLAGGED when bank reports mismatching amount or date', async () => {
    // Bank of Baroda record in MockBankProvider has 1,000,000, but institution claims 1,500,000
    const fdr = new Fdr({
      institutionId: INST_ID,
      fdrNumberEnc: encryptField('BOB00077711'),
      fdrNumberHash: computeBlindIndex('BOB00077711'),
      last4: '7711',
      bankName: 'Bank of Baroda',
      branch: 'Alkapuri, Vadodara',
      amount: 1500000, // Discrepancy!
      issueDate: new Date('2024-01-01'),
      maturityDate: new Date('2028-12-31'),
      lienInFavourOfAicte: true,
      status: 'UNDER_SCRUTINY',
      verificationStatus: 'SUBMITTED_UNVERIFIED',
      createdBy: 'inst-user'
    });
    await fdr.save();

    const officerToken = await createTestToken({ sub: OFFICER_USER_ID, aal: 'aal2' });

    const res = await request(app)
      .post(`/fdrs/${fdr.id}/verify`)
      .set('Authorization', `Bearer ${officerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.verificationStatus).toBe('DISCREPANCY_FLAGGED');
    expect(res.body.data.bankResponse.status).toBe('MISMATCH');

    const updatedFdr = await Fdr.findById(fdr.id);
    expect(updatedFdr!.verificationStatus).toBe('DISCREPANCY_FLAGGED');
    expect(updatedFdr!.riskReasons.some(r => r.includes('BANK_MISMATCH'))).toBe(true);
  });

  it('sets VERIFICATION_FAILED when bank reports NOT_FOUND for unknown receipt number', async () => {
    const fdr = new Fdr({
      institutionId: INST_ID,
      fdrNumberEnc: encryptField('UNKNOWN_FAKE_FDR'),
      fdrNumberHash: computeBlindIndex('UNKNOWN_FAKE_FDR'),
      last4: 'FAKE',
      bankName: 'State Bank of India',
      branch: 'Non-Existent Branch',
      amount: 1000000,
      issueDate: new Date('2024-01-01'),
      maturityDate: new Date('2029-01-01'),
      lienInFavourOfAicte: true,
      status: 'UNDER_SCRUTINY',
      verificationStatus: 'SUBMITTED_UNVERIFIED',
      createdBy: 'inst-user'
    });
    await fdr.save();

    const officerToken = await createTestToken({ sub: OFFICER_USER_ID, aal: 'aal2' });

    const res = await request(app)
      .post(`/fdrs/${fdr.id}/verify`)
      .set('Authorization', `Bearer ${officerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.verificationStatus).toBe('VERIFICATION_FAILED');
    expect(res.body.data.bankResponse.status).toBe('NOT_FOUND');
  });

  it('rejects bank verification request if officer does not have AAL2 MFA (403)', async () => {
    const fdr = new Fdr({
      institutionId: INST_ID,
      fdrNumberEnc: encryptField('SBIN00012345'),
      fdrNumberHash: computeBlindIndex('SBIN00012345'),
      last4: '2345',
      bankName: 'State Bank of India',
      branch: 'Nariman Point, Mumbai',
      amount: 1500000,
      issueDate: new Date('2024-01-01'),
      maturityDate: new Date('2029-01-01'),
      lienInFavourOfAicte: true,
      status: 'UNDER_SCRUTINY',
      verificationStatus: 'SUBMITTED_UNVERIFIED',
      createdBy: 'inst-user'
    });
    await fdr.save();

    // Session has only AAL1
    const aal1Token = await createTestToken({ sub: OFFICER_USER_ID, aal: 'aal1' });

    const res = await request(app)
      .post(`/fdrs/${fdr.id}/verify`)
      .set('Authorization', `Bearer ${aal1Token}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('MFA_REQUIRED');
  });
});
