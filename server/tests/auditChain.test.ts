import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb, clearTestDb } from './helpers/testDb.js';
import { recordAuditLog, verifyAuditChain, GENESIS_PREV_HASH } from '../src/services/auditService.js';
import { AuditLog } from '../src/models/auditLog.js';

describe('Tamper-Evident Audit Logging & Hash Chain Verification', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  it('initializes audit chain with genesis hash at sequence 1', async () => {
    const entry1 = await recordAuditLog({
      actorId: 'user-1',
      actorRole: 'INSTITUTION',
      action: 'FDR_SUBMITTED',
      entityType: 'FDR',
      entityId: 'fdr-101',
      after: { amount: 500000, bank: 'State Bank of India' }
    });

    expect(entry1.seq).toBe(1);
    expect(entry1.prevHash).toBe(GENESIS_PREV_HASH);
    expect(entry1.hash).toHaveLength(64);

    const verification = await verifyAuditChain();
    expect(verification.valid).toBe(true);
    expect(verification.totalEntries).toBe(1);
    expect(verification.latestSeq).toBe(1);
  });

  it('links consecutive entries monotonically in the cryptographic chain', async () => {
    const entry1 = await recordAuditLog({
      actorId: 'user-1',
      actorRole: 'INSTITUTION',
      action: 'FDR_SUBMITTED',
      entityType: 'FDR',
      entityId: 'fdr-101',
      after: { amount: 500000 }
    });

    const entry2 = await recordAuditLog({
      actorId: 'officer-1',
      actorRole: 'SCRUTINY_OFFICER',
      action: 'FDR_SCRUTINIZED',
      entityType: 'FDR',
      entityId: 'fdr-101',
      before: { status: 'SUBMITTED' },
      after: { status: 'UNDER_SCRUTINY' }
    });

    const entry3 = await recordAuditLog({
      actorId: 'authority-1',
      actorRole: 'APPROVING_AUTHORITY',
      action: 'FDR_RELEASE_APPROVED',
      entityType: 'FDR',
      entityId: 'fdr-101',
      after: { status: 'RELEASED' }
    });

    expect(entry2.seq).toBe(2);
    expect(entry2.prevHash).toBe(entry1.hash);

    expect(entry3.seq).toBe(3);
    expect(entry3.prevHash).toBe(entry2.hash);

    const verification = await verifyAuditChain();
    expect(verification.valid).toBe(true);
    expect(verification.totalEntries).toBe(3);
    expect(verification.latestSeq).toBe(3);
  });

  it('detects tampering if an audit record payload is modified directly in the database', async () => {
    await recordAuditLog({
      actorId: 'user-1',
      actorRole: 'INSTITUTION',
      action: 'FDR_SUBMITTED',
      entityType: 'FDR',
      entityId: 'fdr-101',
      after: { amount: 500000 }
    });

    await recordAuditLog({
      actorId: 'officer-1',
      actorRole: 'SCRUTINY_OFFICER',
      action: 'FDR_VERIFIED',
      entityType: 'FDR',
      entityId: 'fdr-101',
      after: { status: 'BANK_VERIFIED' }
    });

    // Verify chain is valid initially
    let verification = await verifyAuditChain();
    expect(verification.valid).toBe(true);

    // Malicious attacker or rogue DB admin alters seq 2's payload
    await AuditLog.updateOne(
      { seq: 2 },
      { $set: { 'after.status': 'MALICIOUS_TAMPERED_STATUS' } }
    );

    // Verification must detect the break
    verification = await verifyAuditChain();
    expect(verification.valid).toBe(false);
    expect(verification.brokenAtSeq).toBe(2);
    expect(verification.error).toMatch(/Data tampering detected at seq 2/);
  });

  it('detects missing sequence gap if an audit record is deleted', async () => {
    await recordAuditLog({
      actorId: 'u1',
      actorRole: 'INSTITUTION',
      action: 'ACT_1',
      entityType: 'FDR',
      entityId: '1'
    });

    await recordAuditLog({
      actorId: 'u2',
      actorRole: 'SCRUTINY_OFFICER',
      action: 'ACT_2',
      entityType: 'FDR',
      entityId: '2'
    });

    // Delete seq 1
    await AuditLog.deleteOne({ seq: 1 });

    const verification = await verifyAuditChain();
    expect(verification.valid).toBe(false);
    expect(verification.brokenAtSeq).toBe(2);
    expect(verification.error).toMatch(/Sequence gap detected/);
  });
});
