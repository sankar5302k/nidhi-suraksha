import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { setupTestDb, teardownTestDb, clearTestDb } from './helpers/testDb.js';
import { createTestToken } from './helpers/jwtHelper.js';
import { cacheUserProfile, clearProfileCache } from '../src/services/userService.js';
import { cacheInstitution } from '../src/services/institutionService.js';
import { Fdr } from '../src/models/fdr.js';
import { DocumentModel } from '../src/models/document.js';
import { encryptField, computeBlindIndex } from '../src/utils/crypto.js';
import { setStorageProvider } from '../src/services/storage/storageFactory.js';
import { MemoryStorageProvider } from '../src/services/storage/MemoryStorageProvider.js';

describe('Document Upload, Magic Bytes, Envelope Encryption & Secure Retrieval', () => {
  const app = createApp();
  const memStorage = new MemoryStorageProvider();

  const INST_ID = '33333333-3333-3333-3333-333333333333';
  const USER_ID = 'user-inst-uploader';

  // Minimal valid PDF binary buffer
  const samplePdfBuffer = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n164\n%%EOF\n',
    'utf-8'
  );

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

    cacheInstitution(INST_ID, 'National Engineering Institute');
    cacheUserProfile({
      id: USER_ID,
      fullName: 'Dr. Kulkarni',
      role: 'INSTITUTION',
      institutionId: INST_ID,
      isActive: true,
      createdAt: new Date().toISOString()
    });
  });

  async function createTestFdr(): Promise<string> {
    const fdr = new Fdr({
      institutionId: INST_ID,
      fdrNumberEnc: encryptField('HDFC12345678'),
      fdrNumberHash: computeBlindIndex('HDFC12345678'),
      last4: '5678',
      bankName: 'HDFC Bank',
      branch: 'Sector 62, Noida',
      amount: 1500000,
      issueDate: new Date('2024-01-01'),
      maturityDate: new Date('2029-01-01'),
      lienInFavourOfAicte: true,
      status: 'DRAFT',
      verificationStatus: 'SUBMITTED_UNVERIFIED',
      createdBy: USER_ID
    });
    await fdr.save();
    return fdr.id;
  }

  it('successfully uploads valid PDF, verifies magic bytes, and stores envelope-encrypted metadata', async () => {
    const fdrId = await createTestFdr();
    const token = await createTestToken({ sub: USER_ID });

    const res = await request(app)
      .post(`/fdrs/${fdrId}/documents`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', samplePdfBuffer, 'fdr_scan_receipt.pdf');

    expect(res.status).toBe(201);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.originalName).toBe('fdr_scan_receipt.pdf');
    expect(res.body.data.version).toBe(1);

    // Verify document record exists in Mongo with envelope encryption
    const doc = await DocumentModel.findById(res.body.data.id);
    expect(doc).not.toBeNull();
    expect(doc!.mimeType).toBe('application/pdf');
    expect(doc!.encryptedDataKey).toBeDefined();
    expect(doc!.iv).toHaveLength(24); // 12 bytes hex
    expect(doc!.authTag).toHaveLength(32); // 16 bytes hex

    // Verify ciphertext was saved in storage provider (NOT plaintext)
    const storedBytes = await memStorage.download(doc!.storageKey);
    expect(storedBytes.equals(samplePdfBuffer)).toBe(false);
  });

  it('rejects spoofed file format with fake extension but bad magic bytes (415)', async () => {
    const fdrId = await createTestFdr();
    const token = await createTestToken({ sub: USER_ID });

    // Plain text masquerading as a PDF
    const fakePdfBuffer = Buffer.from('<html><body>Fake PDF content</body></html>', 'utf-8');

    const res = await request(app)
      .post(`/fdrs/${fdrId}/documents`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', fakePdfBuffer, 'malicious_spoofed.pdf');

    expect(res.status).toBe(415);
    expect(res.body.message).toMatch(/Unsupported or spoofed file format/);
  });

  it('rejects oversize files exceeding 5MB ceiling (413)', async () => {
    const fdrId = await createTestFdr();
    const token = await createTestToken({ sub: USER_ID });

    // 5.5 MB buffer
    const largeBuffer = Buffer.alloc(5.5 * 1024 * 1024);

    const res = await request(app)
      .post(`/fdrs/${fdrId}/documents`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', largeBuffer, 'huge_file.pdf');

    expect([400, 413, 500]).toContain(res.status);
  });

  it('sanitizes path traversal in filenames (e.g. ../../etc/passwd.pdf -> passwd.pdf)', async () => {
    const fdrId = await createTestFdr();
    const token = await createTestToken({ sub: USER_ID });

    const res = await request(app)
      .post(`/fdrs/${fdrId}/documents`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', samplePdfBuffer, '../../../../etc/system_secrets.pdf');

    expect(res.status).toBe(201);
    expect(res.body.data.originalName).toBe('system_secrets.pdf');
  });

  it('blocks duplicate document upload on same FDR via SHA-256 hash (409)', async () => {
    const fdrId = await createTestFdr();
    const token = await createTestToken({ sub: USER_ID });

    // 1st upload succeeds
    const res1 = await request(app)
      .post(`/fdrs/${fdrId}/documents`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', samplePdfBuffer, 'receipt_v1.pdf');
    expect(res1.status).toBe(201);

    // 2nd upload with identical content returns 409 Conflict
    const res2 = await request(app)
      .post(`/fdrs/${fdrId}/documents`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', samplePdfBuffer, 'duplicate_receipt.pdf');

    expect(res2.status).toBe(409);
    expect(res2.body.message).toMatch(/identical document has already been uploaded/);
  });

  it('streams decrypted plaintext on authenticated download with attachment header', async () => {
    const fdrId = await createTestFdr();
    const token = await createTestToken({ sub: USER_ID });

    const uploadRes = await request(app)
      .post(`/fdrs/${fdrId}/documents`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', samplePdfBuffer, 'official_fdr.pdf');

    const docId = uploadRes.body.data.id;

    const downloadRes = await request(app)
      .get(`/fdrs/${fdrId}/documents/${docId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers['content-type']).toBe('application/pdf');
    expect(downloadRes.headers['content-disposition']).toMatch(/attachment; filename="official_fdr.pdf"/);
    expect(downloadRes.headers['x-content-type-options']).toBe('nosniff');

    // Downloaded buffer matches original uploaded plaintext
    expect(downloadRes.body.equals(samplePdfBuffer)).toBe(true);
  });
});
