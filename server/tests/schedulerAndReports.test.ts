import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { setupTestDb, teardownTestDb, clearTestDb } from './helpers/testDb.js';
import { createTestToken } from './helpers/jwtHelper.js';
import { cacheUserProfile, clearProfileCache } from '../src/services/userService.js';
import { cacheInstitution } from '../src/services/institutionService.js';
import { Fdr } from '../src/models/fdr.js';
import { ReminderLog } from '../src/models/reminderLog.js';
import { encryptField, computeBlindIndex } from '../src/utils/crypto.js';
import { runMaturityScheduler } from '../src/services/schedulerService.js';
import { sanitizeCsvCell } from '../src/services/reportService.js';

describe('Scheduler, Date Simulation, Reports & CSV Injection Defense', () => {
  const app = createApp();

  const INST_A = '77777777-7777-7777-7777-777777777777';
  const INST_B = '88888888-8888-8888-8888-888888888888';
  const USER_A = 'user-inst-a-reports';
  const ADMIN_USER = 'user-admin-reports';

  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
    clearProfileCache();

    cacheInstitution(INST_A, 'Institute A');
    cacheInstitution(INST_B, 'Institute B');

    cacheUserProfile({
      id: USER_A,
      fullName: 'Inst A Rep',
      role: 'INSTITUTION',
      institutionId: INST_A,
      isActive: true,
      createdAt: new Date().toISOString()
    });

    cacheUserProfile({
      id: ADMIN_USER,
      fullName: 'System Administrator',
      role: 'ADMIN',
      isActive: true,
      createdAt: new Date().toISOString()
    });
  });

  it('scheduler identifies approaching maturity, transitions ACTIVE -> EXPIRING and logs reminders', async () => {
    // 1. Create an FDR that matures on 2026-11-01
    const fdr = new Fdr({
      institutionId: INST_A,
      fdrNumberEnc: encryptField('SBIN00088811'),
      fdrNumberHash: computeBlindIndex('SBIN00088811'),
      last4: '8811',
      bankName: 'State Bank of India',
      branch: 'Main Branch',
      amount: 1000000,
      issueDate: new Date('2021-11-01'),
      maturityDate: new Date('2026-11-01'), // 6 days from simulated date 2026-10-26
      lienInFavourOfAicte: true,
      status: 'ACTIVE',
      verificationStatus: 'BANK_VERIFIED',
      createdBy: USER_A
    });
    await fdr.save();

    // 2. Run scheduler with simulated date 2026-10-26 (6 days to maturity)
    const result = await runMaturityScheduler(new Date('2026-10-26T00:00:00Z'));

    expect(result.evaluatedCount).toBe(1);
    expect(result.markedExpiringCount).toBe(1);
    expect(result.remindersSentCount).toBe(1);

    // Verify FDR state is now EXPIRING
    const updatedFdr = await Fdr.findById(fdr.id);
    expect(updatedFdr!.status).toBe('EXPIRING');

    // Verify ReminderLog was persisted
    const logs = await ReminderLog.find({ fdrId: fdr.id });
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0].triggerDays).toBe(7);
  });

  it('scheduler marks FDR as MATURED once maturity date is reached or passed', async () => {
    const fdr = new Fdr({
      institutionId: INST_A,
      fdrNumberEnc: encryptField('HDFC00022334'),
      fdrNumberHash: computeBlindIndex('HDFC00022334'),
      last4: '2334',
      bankName: 'HDFC Bank',
      branch: 'Main Branch',
      amount: 1500000,
      issueDate: new Date('2021-01-01'),
      maturityDate: new Date('2026-01-01'), // Already in the past
      lienInFavourOfAicte: true,
      status: 'EXPIRING',
      verificationStatus: 'BANK_VERIFIED',
      createdBy: USER_A
    });
    await fdr.save();

    const result = await runMaturityScheduler(new Date('2026-10-26T00:00:00Z'));
    expect(result.markedMaturedCount).toBe(1);

    const updatedFdr = await Fdr.findById(fdr.id);
    expect(updatedFdr!.status).toBe('MATURED');
  });

  it('prevents CSV Injection by prefixing formula triggers (=, +, -, @) with single quote', () => {
    expect(sanitizeCsvCell('=SUM(A1:A10)')).toBe('"\'=SUM(A1:A10)"');
    expect(sanitizeCsvCell('@cmd|/c calc')).toBe('"\'@cmd|/c calc"');
    expect(sanitizeCsvCell('+12345')).toBe('"\' +12345"'.replace(' ', ''));
    expect(sanitizeCsvCell('-1000')).toBe('"\' -1000"'.replace(' ', ''));
    expect(sanitizeCsvCell('Normal Bank Name')).toBe('"Normal Bank Name"');
  });

  it('prevents Copilot from widening access beyond caller role (IDOR isolation)', async () => {
    // Create FDR for Inst A
    const fdrA = new Fdr({
      institutionId: INST_A,
      fdrNumberEnc: encryptField('FDR_A_111'),
      fdrNumberHash: computeBlindIndex('FDR_A_111'),
      last4: 'A111',
      bankName: 'State Bank of India',
      branch: 'Delhi',
      amount: 1000000,
      issueDate: new Date('2024-01-01'),
      maturityDate: new Date('2029-01-01'),
      lienInFavourOfAicte: true,
      status: 'ACTIVE',
      verificationStatus: 'BANK_VERIFIED',
      createdBy: USER_A
    });
    await fdrA.save();

    // Create FDR for Inst B
    const fdrB = new Fdr({
      institutionId: INST_B,
      fdrNumberEnc: encryptField('FDR_B_222'),
      fdrNumberHash: computeBlindIndex('FDR_B_222'),
      last4: 'B222',
      bankName: 'State Bank of India',
      branch: 'Mumbai',
      amount: 5000000,
      issueDate: new Date('2024-01-01'),
      maturityDate: new Date('2029-01-01'),
      lienInFavourOfAicte: true,
      status: 'ACTIVE',
      verificationStatus: 'BANK_VERIFIED',
      createdBy: 'user-b'
    });
    await fdrB.save();

    // User A queries copilot for "all active State Bank of India FDRs"
    const tokenA = await createTestToken({ sub: USER_A });
    const res = await request(app)
      .post('/copilot/query')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ question: 'Show me active State Bank of India FDRs' });

    expect(res.status).toBe(200);
    // User A MUST ONLY see Inst A's record, NEVER Inst B's record
    const results = res.body.data.results;
    expect(results).toHaveLength(1);
    expect(results[0].last4).toBe('A111');
    expect(results[0].institutionId).toBe(INST_A);
  });
});
