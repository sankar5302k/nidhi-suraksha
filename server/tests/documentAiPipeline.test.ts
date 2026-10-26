import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { setupTestDb, teardownTestDb, clearTestDb } from './helpers/testDb.js';
import { createTestToken } from './helpers/jwtHelper.js';
import { cacheUserProfile, clearProfileCache } from '../src/services/userService.js';
import { cacheInstitution } from '../src/services/institutionService.js';
import { Fdr } from '../src/models/fdr.js';
import { Extraction } from '../src/models/extraction.js';
import { encryptField, computeBlindIndex } from '../src/utils/crypto.js';
import { setStorageProvider } from '../src/services/storage/storageFactory.js';
import { MemoryStorageProvider } from '../src/services/storage/MemoryStorageProvider.js';
import { processDocumentUpload } from '../src/services/uploadService.js';

describe('Document AI Extraction Pipeline & Human Confirmation Flow', () => {
  const app = createApp();
  const memStorage = new MemoryStorageProvider();

  const INST_ID = '44444444-4444-4444-4444-444444444444';
  const INSTITUTION_USER_ID = 'user-inst-owner';
  const OFFICER_USER_ID = 'user-officer-reviewer';

  beforeAll(async () => {
    await setupTestDb();
    setStorageProvider(memStorage);
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
    clearProfileCache();
    memStorage.clear();

    cacheInstitution(INST_ID, 'Bangalore Technical Campus');

    cacheUserProfile({
      id: INSTITUTION_USER_ID,
      fullName: 'Institute Admin',
      role: 'INSTITUTION',
      institutionId: INST_ID,
      isActive: true,
      createdAt: new Date().toISOString()
    });

    cacheUserProfile({
      id: OFFICER_USER_ID,
      fullName: 'Officer S. K. Singh',
      role: 'SCRUTINY_OFFICER',
      isActive: true,
      createdAt: new Date().toISOString()
    });
  });

  it('runs end-to-end extraction pipeline, detects field discrepancies, and updates risk score', async () => {
    // 1. Create an FDR where institution claims amount is 2,000,000
    const fdr = new Fdr({
      institutionId: INST_ID,
      fdrNumberEnc: encryptField('SBIN00012345'),
      fdrNumberHash: computeBlindIndex('SBIN00012345'),
      last4: '2345',
      bankName: 'State Bank of India',
      branch: 'MG Road, Bangalore',
      amount: 2000000, // Claimed ₹20,00,000
      issueDate: new Date('2024-01-01'),
      maturityDate: new Date('2029-01-01'),
      lienInFavourOfAicte: true,
      status: 'SUBMITTED',
      verificationStatus: 'SUBMITTED_UNVERIFIED',
      createdBy: INSTITUTION_USER_ID
    });
    await fdr.save();

    // 2. Upload document receipt containing ₹15,00,000 (creates discrepancy with claimed 2,000,000)
    // Minimal valid PDF structure with text stream containing FDR facts
    const pdfTextContent = `
      STATE BANK OF INDIA - Fixed Deposit Receipt
      Receipt No: SBIN00012345
      Branch: MG Road, Bangalore
      Deposit Amount: Rs. 15,00,000.00
      Date of Issue: 2024-01-01
      Maturity Date: 2029-01-01
      Depositor: Bangalore Technical Campus
      Lien in Favour of AICTE: YES
    `;

    // Construct a valid PDF buffer with text stream
    const pdfBuffer = Buffer.from(
      `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length ${pdfTextContent.length} >>\nstream\n${pdfTextContent}\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\n0000000185 00000 n\ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n300\n%%EOF\n`,
      'utf-8'
    );

    const doc = await processDocumentUpload({
      fdrId: fdr.id,
      fileBuffer: pdfBuffer,
      clientOriginalName: 'sbi_fdr_scan.pdf',
      documentType: 'FDR_SCAN',
      uploadedBy: INSTITUTION_USER_ID
    });

    // 3. Officer triggers extraction
    const officerToken = await createTestToken({ sub: OFFICER_USER_ID, aal: 'aal2' });

    const extractRes = await request(app)
      .post(`/fdrs/${fdr.id}/documents/${doc.id}/extract`)
      .set('Authorization', `Bearer ${officerToken}`);

    expect(extractRes.status).toBe(200);
    expect(extractRes.body.data.extraction).toBeDefined();
    expect(extractRes.body.data.extraction.status).toBe('UNCONFIRMED');

    // Field discrepancy must be flagged
    expect(extractRes.body.data.discrepancies.length).toBeGreaterThan(0);
    expect(extractRes.body.data.discrepancies.some((d: string) => /mismatch/i.test(d))).toBe(true);

    // FDR record must reflect discrepancy status and elevated risk
    const updatedFdr = await Fdr.findById(fdr.id);
    expect(updatedFdr!.verificationStatus).toBe('DISCREPANCY_FLAGGED');
    expect(updatedFdr!.riskScore).toBeGreaterThan(0);

    // 4. Human review confirmation flow
    const extId = extractRes.body.data.extraction._id || extractRes.body.data.extraction.id;
    const confirmRes = await request(app)
      .post(`/fdrs/${fdr.id}/extractions/${extId}/confirm`)
      .set('Authorization', `Bearer ${officerToken}`);

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.data.status).toBe('CONFIRMED');

    const confirmedDoc = await Extraction.findById(extId);
    expect(confirmedDoc!.status).toBe('CONFIRMED');
    expect(confirmedDoc!.fields[0].confirmedBy).toBe(OFFICER_USER_ID);
  });
});
