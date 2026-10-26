import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { setupTestDb, teardownTestDb, clearTestDb } from './helpers/testDb.js';
import { createTestToken } from './helpers/jwtHelper.js';
import { cacheUserProfile, clearProfileCache } from '../src/services/userService.js';
import { cacheInstitution, clearInstitutionCache } from '../src/services/institutionService.js';
import { Fdr } from '../src/models/fdr.js';
import { encryptField, computeBlindIndex } from '../src/utils/crypto.js';

describe('Object-Level Authorization, IDOR Prevention & Tenant Isolation', () => {
  const app = createApp();

  const INST_A_ID = '11111111-aaaa-aaaa-aaaa-111111111111';
  const INST_B_ID = '22222222-bbbb-bbbb-bbbb-222222222222';

  const USER_A_ID = 'user-inst-a';
  const USER_B_ID = 'user-inst-b';
  const OFFICER_USER_ID = 'user-officer';

  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
    clearProfileCache();
    clearInstitutionCache();

    // Cache institutions in memory
    cacheInstitution(INST_A_ID, 'Delhi Institute of Technology');
    cacheInstitution(INST_B_ID, 'Mumbai College of Engineering');

    // Cache user profiles
    cacheUserProfile({
      id: USER_A_ID,
      fullName: 'Inst A Registrar',
      role: 'INSTITUTION',
      institutionId: INST_A_ID,
      isActive: true,
      createdAt: new Date().toISOString()
    });

    cacheUserProfile({
      id: USER_B_ID,
      fullName: 'Inst B Registrar',
      role: 'INSTITUTION',
      institutionId: INST_B_ID,
      isActive: true,
      createdAt: new Date().toISOString()
    });

    cacheUserProfile({
      id: OFFICER_USER_ID,
      fullName: 'AICTE Scrutiny Officer',
      role: 'SCRUTINY_OFFICER',
      isActive: true,
      createdAt: new Date().toISOString()
    });
  });

  it('prevents IDOR: Institution A accessing Institution B FDR returns 404 (not 403)', async () => {
    // 1. Create FDR belonging to Institution B
    const fdrB = new Fdr({
      institutionId: INST_B_ID,
      fdrNumberEnc: encryptField('SBIN00012345'),
      fdrNumberHash: computeBlindIndex('SBIN00012345'),
      last4: '2345',
      bankName: 'State Bank of India',
      branch: 'Nariman Point, Mumbai',
      amount: 1500000,
      issueDate: new Date('2024-01-01'),
      maturityDate: new Date('2029-01-01'),
      lienInFavourOfAicte: true,
      status: 'SUBMITTED',
      verificationStatus: 'SUBMITTED_UNVERIFIED',
      createdBy: USER_B_ID
    });
    await fdrB.save();

    // 2. User A attempts to view FDR belonging to B via URL manipulation
    const tokenA = await createTestToken({ sub: USER_A_ID });

    const res = await request(app)
      .get(`/fdrs/${fdrB.id}`)
      .set('Authorization', `Bearer ${tokenA}`);

    // Must return 404 (Not Found), NOT 403, to conceal the existence of Institution B's FDR
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/FDR record not found/);
  });

  it('allows Institution A to view its own FDR', async () => {
    const fdrA = new Fdr({
      institutionId: INST_A_ID,
      fdrNumberEnc: encryptField('HDFC00098765'),
      fdrNumberHash: computeBlindIndex('HDFC00098765'),
      last4: '8765',
      bankName: 'HDFC Bank',
      branch: 'Connaught Place, New Delhi',
      amount: 2500000,
      issueDate: new Date('2024-02-01'),
      maturityDate: new Date('2029-02-01'),
      lienInFavourOfAicte: true,
      status: 'DRAFT',
      verificationStatus: 'SUBMITTED_UNVERIFIED',
      createdBy: USER_A_ID
    });
    await fdrA.save();

    const tokenA = await createTestToken({ sub: USER_A_ID });

    const res = await request(app)
      .get(`/fdrs/${fdrA.id}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id || res.body.data._id).toBe(fdrA.id);
    expect(res.body.data.last4).toBe('8765');
    // Ensure raw encryption ciphertext is NEVER sent in response
    expect(res.body.data.fdrNumberEnc).toBeUndefined();
  });

  it('allows Scrutiny Officer to view FDRs across institutions', async () => {
    const fdrB = new Fdr({
      institutionId: INST_B_ID,
      fdrNumberEnc: encryptField('PNB00055555'),
      fdrNumberHash: computeBlindIndex('PNB00055555'),
      last4: '5555',
      bankName: 'Punjab National Bank',
      branch: 'Bandra, Mumbai',
      amount: 1000000,
      issueDate: new Date('2024-03-01'),
      maturityDate: new Date('2029-03-01'),
      lienInFavourOfAicte: true,
      status: 'SUBMITTED',
      verificationStatus: 'SUBMITTED_UNVERIFIED',
      createdBy: USER_B_ID
    });
    await fdrB.save();

    const officerToken = await createTestToken({ sub: OFFICER_USER_ID });

    const res = await request(app)
      .get(`/fdrs/${fdrB.id}`)
      .set('Authorization', `Bearer ${officerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.last4).toBe('5555');
  });

  it('automatically derives institutionId from authenticated profile on FDR creation (ignores client input)', async () => {
    const tokenA = await createTestToken({ sub: USER_A_ID });

    // Attacker tries to inject Institution B's ID in request body
    const res = await request(app)
      .post('/fdrs')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        fdrNumber: 'ICIC000443322',
        bankName: 'ICICI Bank',
        branch: 'Green Park, New Delhi',
        amount: 2000000,
        issueDate: '2024-04-01',
        maturityDate: '2029-04-01',
        lienInFavourOfAicte: true,
        institutionId: INST_B_ID // Attacker attempt to create for Institution B
      });

    expect(res.status).toBe(201);
    // Server must have overridden institutionId to INST_A_ID derived from profile
    expect(res.body.data.institutionId).toBe(INST_A_ID);
    expect(res.body.data.last4).toBe('3322');
  });

  it('rejects duplicate FDR submission for the same bank via blind index', async () => {
    const tokenA = await createTestToken({ sub: USER_A_ID });

    // 1st submission succeeds
    const res1 = await request(app)
      .post('/fdrs')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        fdrNumber: 'DUPLICATE_NUMBER_123',
        bankName: 'Canara Bank',
        branch: 'Kasturba Gandhi Marg',
        amount: 1200000,
        issueDate: '2024-05-01',
        maturityDate: '2029-05-01',
        lienInFavourOfAicte: true
      });
    expect(res1.status).toBe(201);

    // 2nd submission with duplicate number and bank returns 409 Conflict
    const res2 = await request(app)
      .post('/fdrs')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        fdrNumber: 'DUPLICATE_NUMBER_123',
        bankName: 'Canara Bank',
        branch: 'Another Branch',
        amount: 1200000,
        issueDate: '2024-05-01',
        maturityDate: '2029-05-01',
        lienInFavourOfAicte: true
      });

    expect(res2.status).toBe(409);
    expect(res2.body.error).toBe('Conflict');
    expect(res2.body.message).toMatch(/already exists for this bank/);
  });
});
