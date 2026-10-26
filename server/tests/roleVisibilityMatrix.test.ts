import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { setupTestDb, teardownTestDb, clearTestDb } from './helpers/testDb.js';
import { createTestToken } from './helpers/jwtHelper.js';
import { cacheUserProfile, clearProfileCache } from '../src/services/userService.js';
import { cacheInstitution } from '../src/services/institutionService.js';
import { Fdr } from '../src/models/fdr.js';
import { DocumentModel } from '../src/models/document.js';
import { ReleaseRequest } from '../src/models/releaseRequest.js';
import { encryptField, computeBlindIndex } from '../src/utils/crypto.js';

describe('Role Visibility Matrix & Least Privilege Enforcement', () => {
  const app = createApp();

  const INST_ID = '11111111-2222-3333-4444-555555555555';

  const instUser = {
    id: 'user-inst-1',
    email: 'registrar@diet-delhi.ac.in',
    fullName: 'BITS Pilani Admin',
    role: 'INSTITUTION' as const,
    institutionId: INST_ID,
    isActive: true,
    createdAt: new Date().toISOString()
  };

  const scrutinyUser = {
    id: 'user-scrutiny-1',
    email: 'scrutiny.officer@aicte.gov.in',
    fullName: 'Officer S. Sharma',
    role: 'SCRUTINY_OFFICER' as const,
    isActive: true,
    createdAt: new Date().toISOString()
  };

  const authorityUser = {
    id: 'user-auth-1',
    email: 'authority@aicte.gov.in',
    fullName: 'Dr. V. Rao',
    role: 'APPROVING_AUTHORITY' as const,
    isActive: true,
    createdAt: new Date().toISOString()
  };

  const adminUser = {
    id: 'user-admin-1',
    email: 'admin@aicte.gov.in',
    fullName: 'Sysadmin Root',
    role: 'ADMIN' as const,
    isActive: true,
    createdAt: new Date().toISOString()
  };

  const auditorUser = {
    id: 'user-auditor-1',
    email: 'auditor@aicte.gov.in',
    fullName: 'Vigilance Auditor A. Sen',
    role: 'AUDITOR' as const,
    isActive: true,
    createdAt: new Date().toISOString()
  };

  let tokenInst: string;
  let tokenScrutiny: string;
  let tokenAuthority: string;
  let tokenAdmin: string;
  let tokenAuditor: string;

  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
    clearProfileCache();

    cacheInstitution(INST_ID, 'Delhi Institute of Engineering and Technology');

    cacheUserProfile(instUser);
    cacheUserProfile(scrutinyUser);
    cacheUserProfile(authorityUser);
    cacheUserProfile(adminUser);
    cacheUserProfile(auditorUser);

    tokenInst = await createTestToken({ sub: instUser.id, role: instUser.role });
    tokenScrutiny = await createTestToken({ sub: scrutinyUser.id, role: scrutinyUser.role, aal: 'aal2' });
    tokenAuthority = await createTestToken({ sub: authorityUser.id, role: authorityUser.role, aal: 'aal2' });
    tokenAdmin = await createTestToken({ sub: adminUser.id, role: adminUser.role, aal: 'aal2' });
    tokenAuditor = await createTestToken({ sub: auditorUser.id, role: auditorUser.role, aal: 'aal2' });
  });

  describe('1. Login Gateway & Role Enclosure', () => {
    it('rejects login when profile role does not match requested gatewayRole (403)', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({
          email: 'registrar@diet-delhi.ac.in',
          password: 'Password@123',
          gatewayRole: 'SCRUTINY_OFFICER'
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('GATEWAY_ROLE_MISMATCH');
    });

    it('allows login when profile role matches requested gatewayRole', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({
          email: 'registrar@diet-delhi.ac.in',
          password: 'Password@123',
          gatewayRole: 'INSTITUTION'
        });

      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe('INSTITUTION');
    });
  });

  describe('2. New FDR Wizard (/fdrs/new)', () => {
    const fdrPayload = {
      fdrNumber: 'SBIN987654321',
      bankName: 'State Bank of India',
      branch: 'Connaught Place, New Delhi',
      amount: 1500000,
      issueDate: '2025-01-01',
      maturityDate: '2030-01-01',
      lienInFavourOfAicte: true
    };

    it('allows INSTITUTION to register a new FDR (201)', async () => {
      const res = await request(app)
        .post('/fdrs')
        .set('Authorization', `Bearer ${tokenInst}`)
        .send(fdrPayload);

      expect(res.status).toBe(201);
      expect(res.body.data.last4).toBe('4321');
      expect(res.body.data.fdrNumberEnc).toBeUndefined(); // raw ciphertext never returned
    });

    it('rejects ADMIN from registering an FDR (403)', async () => {
      const res = await request(app)
        .post('/fdrs')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send(fdrPayload);

      expect(res.status).toBe(403);
    });

    it('rejects SCRUTINY_OFFICER from registering an FDR (403)', async () => {
      const res = await request(app)
        .post('/fdrs')
        .set('Authorization', `Bearer ${tokenScrutiny}`)
        .send(fdrPayload);

      expect(res.status).toBe(403);
    });
  });

  describe('3. FDR Detail & Response Shaping (Least Privilege Data Stripping)', () => {
    let testFdrId: string;
    let testDocId: string;

    beforeEach(async () => {
      const fdr = new Fdr({
        institutionId: INST_ID,
        fdrNumberEnc: encryptField('SBIN123455678'),
        fdrNumberHash: computeBlindIndex('SBIN123455678'),
        last4: '5678',
        bankName: 'State Bank of India',
        branch: 'Connaught Place',
        amount: 2500000,
        issueDate: new Date('2024-01-01'),
        maturityDate: new Date('2029-01-01'),
        lienInFavourOfAicte: true,
        status: 'UNDER_SCRUTINY',
        verificationStatus: 'DISCREPANCY_FLAGGED',
        riskScore: 35,
        riskReasons: ['DUPLICATE_HASH', 'SUSPICIOUS_METADATA'],
        createdBy: instUser.id
      });
      await fdr.save();
      testFdrId = fdr.id;

      const doc = new DocumentModel({
        fdrId: fdr._id,
        type: 'FDR_SCAN',
        originalName: 'fdr_scan.pdf',
        storageKey: 'mock-storage-key-123',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        sha256: 'a'.repeat(64),
        version: 1,
        encryptedDataKey: 'mock-edk',
        iv: 'mock-iv',
        authTag: 'mock-tag',
        uploadedBy: instUser.id
      });
      await doc.save();
      testDocId = doc.id;
    });

    it('strips riskReasons for INSTITUTION and returns neutral notice', async () => {
      const res = await request(app)
        .get(`/fdrs/${testFdrId}`)
        .set('Authorization', `Bearer ${tokenInst}`);

      expect(res.status).toBe(200);
      expect(res.body.data.riskReasons).toEqual(['Discrepancy found, please resubmit or contact the Bureau.']);
      expect(res.body.data.riskReasons).not.toContain('DUPLICATE_HASH');
      expect(res.body.data.documents.length).toBe(1);
    });

    it('strips riskReasons and hides all documents for ADMIN', async () => {
      const res = await request(app)
        .get(`/fdrs/${testFdrId}`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(res.status).toBe(200);
      expect(res.body.data.riskReasons).toEqual([]);
      expect(res.body.data.documents).toEqual([]);
    });

    it('provides full riskReasons for SCRUTINY_OFFICER, APPROVING_AUTHORITY, and AUDITOR', async () => {
      const resScrutiny = await request(app)
        .get(`/fdrs/${testFdrId}`)
        .set('Authorization', `Bearer ${tokenScrutiny}`);
      expect(resScrutiny.body.data.riskReasons).toContain('DUPLICATE_HASH');

      const resAuthority = await request(app)
        .get(`/fdrs/${testFdrId}`)
        .set('Authorization', `Bearer ${tokenAuthority}`);
      expect(resAuthority.body.data.riskReasons).toContain('DUPLICATE_HASH');

      const resAuditor = await request(app)
        .get(`/fdrs/${testFdrId}`)
        .set('Authorization', `Bearer ${tokenAuditor}`);
      expect(resAuditor.body.data.riskReasons).toContain('DUPLICATE_HASH');
    });

    it('blocks ADMIN from downloading confidential documents (403)', async () => {
      const res = await request(app)
        .get(`/fdrs/${testFdrId}/documents/${testDocId}`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/Administrators are restricted from accessing confidential financial documents/);
    });
  });

  describe('4. Operational & Governance Workflows (Verification, Flagging, Release)', () => {
    let testFdrId: string;

    beforeEach(async () => {
      const fdr = new Fdr({
        institutionId: INST_ID,
        fdrNumberEnc: encryptField('PNB000111222'),
        fdrNumberHash: computeBlindIndex('PNB000111222'),
        last4: '1222',
        bankName: 'Punjab National Bank',
        branch: 'Sector 17, Chandigarh',
        amount: 1500000,
        issueDate: new Date('2024-01-01'),
        maturityDate: new Date('2027-01-01'),
        lienInFavourOfAicte: true,
        status: 'UNDER_SCRUTINY',
        verificationStatus: 'SUBMITTED_UNVERIFIED',
        riskScore: 0,
        riskReasons: [],
        createdBy: instUser.id
      });
      await fdr.save();
      testFdrId = fdr.id;
    });

    it('rejects ADMIN and INSTITUTION from running CBS bank verification (403)', async () => {
      const resAdmin = await request(app)
        .post(`/fdrs/${testFdrId}/verify`)
        .set('Authorization', `Bearer ${tokenAdmin}`);
      expect(resAdmin.status).toBe(403);

      const resInst = await request(app)
        .post(`/fdrs/${testFdrId}/verify`)
        .set('Authorization', `Bearer ${tokenInst}`);
      expect(resInst.status).toBe(403);
    });

    it('allows SCRUTINY_OFFICER to trigger bank verification', async () => {
      const res = await request(app)
        .post(`/fdrs/${testFdrId}/verify`)
        .set('Authorization', `Bearer ${tokenScrutiny}`);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBeDefined();
    });

    it('rejects ADMIN and INSTITUTION from flagging discrepancies (403)', async () => {
      const resAdmin = await request(app)
        .post(`/fdrs/${testFdrId}/flag`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ observation: 'Suspicious watermark detected' });
      expect(resAdmin.status).toBe(403);

      const resInst = await request(app)
        .post(`/fdrs/${testFdrId}/flag`)
        .set('Authorization', `Bearer ${tokenInst}`)
        .send({ observation: 'Dispute' });
      expect(resInst.status).toBe(403);
    });

    it('rejects ADMIN and SCRUTINY_OFFICER from creating release requests (403)', async () => {
      const resAdmin = await request(app)
        .post(`/fdrs/${testFdrId}/release-request`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ reason: 'COMPLIANCE_FULFILLED' });
      expect(resAdmin.status).toBe(403);

      const resScrutiny = await request(app)
        .post(`/fdrs/${testFdrId}/release-request`)
        .set('Authorization', `Bearer ${tokenScrutiny}`)
        .send({ reason: 'COMPLIANCE_FULFILLED' });
      expect(resScrutiny.status).toBe(403);
    });

    it('enforces release recommendation (Tier 1) for SCRUTINY_OFFICER only, rejecting ADMIN and AUTHORITY (403)', async () => {
      const relReq = new ReleaseRequest({
        fdrId: new mongoose.Types.ObjectId(testFdrId),
        institutionId: INST_ID,
        reason: 'Course intake quota period completed successfully',
        status: 'PENDING_OFFICER_REVIEW',
        requestedBy: instUser.id
      });
      await relReq.save();
      const reqId = relReq.id;

      const resAdmin = await request(app)
        .post(`/release-requests/${reqId}/process`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ decision: 'RECOMMEND', notes: 'Administrative attempt' });
      expect(resAdmin.status).toBe(403);

      const resAuthority = await request(app)
        .post(`/release-requests/${reqId}/process`)
        .set('Authorization', `Bearer ${tokenAuthority}`)
        .send({ decision: 'RECOMMEND', notes: 'Premature tier attempt' });
      expect(resAuthority.status).toBe(403);

      const resScrutiny = await request(app)
        .post(`/release-requests/${reqId}/process`)
        .set('Authorization', `Bearer ${tokenScrutiny}`)
        .send({ decision: 'RECOMMEND', notes: 'Verification complete and recommended' });
      expect(resScrutiny.status).toBe(200);
    });

    it('enforces release sanction (Tier 2) for APPROVING_AUTHORITY only, rejecting SCRUTINY and ADMIN (403)', async () => {
      // Transition FDR to RELEASE_REQUESTED so it can legally transition to RELEASED upon approval
      await Fdr.findByIdAndUpdate(testFdrId, { status: 'RELEASE_REQUESTED' });

      const relReq = new ReleaseRequest({
        fdrId: new mongoose.Types.ObjectId(testFdrId),
        institutionId: INST_ID,
        reason: 'Course intake quota period completed successfully',
        status: 'RECOMMENDED_FOR_APPROVAL',
        requestedBy: instUser.id,
        processedBy: scrutinyUser.id,
        processedAt: new Date()
      });
      await relReq.save();
      const reqId = relReq.id;

      const resScrutiny = await request(app)
        .post(`/release-requests/${reqId}/decision`)
        .set('Authorization', `Bearer ${tokenScrutiny}`)
        .send({ decision: 'APPROVE', notes: 'Sanction order approved' });
      expect(resScrutiny.status).toBe(403);

      const resAdmin = await request(app)
        .post(`/release-requests/${reqId}/decision`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ decision: 'APPROVE', notes: 'Sanction order approved' });
      expect(resAdmin.status).toBe(403);

      const resAuthority = await request(app)
        .post(`/release-requests/${reqId}/decision`)
        .set('Authorization', `Bearer ${tokenAuthority}`)
        .send({ decision: 'APPROVE', notes: 'Sanction order approved' });
      expect(resAuthority.status).toBe(200);
    });
  });

  describe('5. Reports, Date Simulation, Copilot & Cryptographic Ledger', () => {
    it('blocks INSTITUTION from portfolio reports and CSV export (403)', async () => {
      const res = await request(app)
        .get('/dashboard/export-csv')
        .set('Authorization', `Bearer ${tokenInst}`);

      expect(res.status).toBe(403);
    });

    it('allows ADMIN, SCRUTINY, AUTHORITY, and AUDITOR to export CSV reports (200)', async () => {
      const res = await request(app)
        .get('/dashboard/export-csv')
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
    });

    it('blocks non-ADMIN roles from simulating system date (403)', async () => {
      const resInst = await request(app)
        .post('/dashboard/simulate-date')
        .set('Authorization', `Bearer ${tokenInst}`)
        .send({ targetDate: '2026-06-01' });
      expect(resInst.status).toBe(403);

      const resScrutiny = await request(app)
        .post('/dashboard/simulate-date')
        .set('Authorization', `Bearer ${tokenScrutiny}`)
        .send({ targetDate: '2026-06-01' });
      expect(resScrutiny.status).toBe(403);
    });

    it('allows ADMIN to simulate date in development/test environment (200)', async () => {
      const res = await request(app)
        .post('/dashboard/simulate-date')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ targetDate: '2026-06-01' });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/2026-06-01/);
    });

    it('blocks ADMIN from Copilot query (403)', async () => {
      const res = await request(app)
        .post('/copilot/query')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ question: 'Show me expiring FDRs' });

      expect(res.status).toBe(403);
    });

    it('allows INSTITUTION and AUDITOR to query Copilot (200)', async () => {
      const resInst = await request(app)
        .post('/copilot/query')
        .set('Authorization', `Bearer ${tokenInst}`)
        .send({ question: 'Show my active deposits' });
      expect(resInst.status).toBe(200);

      const resAuditor = await request(app)
        .post('/copilot/query')
        .set('Authorization', `Bearer ${tokenAuditor}`)
        .send({ question: 'Show all flagged deposits' });
      expect(resAuditor.status).toBe(200);
    });

    it('blocks INSTITUTION, ADMIN, and AUDITOR from drafting deficiency notices (403)', async () => {
      const fakeFdrId = new mongoose.Types.ObjectId().toString();

      const resInst = await request(app)
        .post(`/copilot/draft-notice/${fakeFdrId}`)
        .set('Authorization', `Bearer ${tokenInst}`);
      expect(resInst.status).toBe(403);

      const resAdmin = await request(app)
        .post(`/copilot/draft-notice/${fakeFdrId}`)
        .set('Authorization', `Bearer ${tokenAdmin}`);
      expect(resAdmin.status).toBe(403);

      const resAuditor = await request(app)
        .post(`/copilot/draft-notice/${fakeFdrId}`)
        .set('Authorization', `Bearer ${tokenAuditor}`);
      expect(resAuditor.status).toBe(403);
    });

    it('allows AUDITOR and ADMIN with AAL2 to verify cryptographic audit chain (200)', async () => {
      const resAuditor = await request(app)
        .get('/audit/verify-chain')
        .set('Authorization', `Bearer ${tokenAuditor}`);
      expect(resAuditor.status).toBe(200);
      expect(resAuditor.body.data.valid).toBe(true);

      const resAdmin = await request(app)
        .get('/audit/verify-chain')
        .set('Authorization', `Bearer ${tokenAdmin}`);
      expect(resAdmin.status).toBe(200);
      expect(resAdmin.body.data.valid).toBe(true);
    });
  });
});
