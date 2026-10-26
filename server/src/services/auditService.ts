import mongoose, { ClientSession } from 'mongoose';
import { AuditLog, IAuditLog } from '../models/auditLog.js';
import { AuditCounter } from '../models/auditCounter.js';
import { computeAuditHash } from '../utils/crypto.js';

export const GENESIS_PREV_HASH = '0'.repeat(64);

export interface CreateAuditLogParams {
  actorId: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  ip?: string;
  userAgent?: string;
}

/**
 * Builds the canonical payload object used for hashing
 */
function buildHashPayload(entry: {
  seq: number;
  actorId: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ip: string;
  userAgent: string;
  prevHash: string;
  createdAt: string; // ISO string for deterministic representation
}) {
  return {
    seq: entry.seq,
    actorId: entry.actorId,
    actorRole: entry.actorRole,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    before: entry.before,
    after: entry.after,
    ip: entry.ip,
    userAgent: entry.userAgent,
    prevHash: entry.prevHash,
    createdAt: entry.createdAt
  };
}

/**
 * Atomically records an audit log entry in the cryptographic chain.
 * Can participate in an ongoing MongoDB session/transaction.
 */
export async function recordAuditLog(
  params: CreateAuditLogParams,
  session?: ClientSession
): Promise<IAuditLog> {
  // 1. Atomically allocate monotonic sequence number
  const counter = await AuditCounter.findOneAndUpdate(
    { _id: 'audit_seq' },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, session }
  );

  const seq = counter.seq;

  // 2. Determine previous hash
  let prevHash = GENESIS_PREV_HASH;
  if (seq > 1) {
    const prevQuery = AuditLog.findOne({ seq: seq - 1 });
    if (session) {
      prevQuery.session(session);
    }
    const prevLog = await prevQuery.exec();
    if (!prevLog) {
      throw new Error(`Audit chain broken: missing previous audit log entry at seq ${seq - 1}`);
    }
    prevHash = prevLog.hash;
  }

  // 3. Construct payload with exact UTC timestamp ISO string
  const createdDate = new Date();
  const createdAtIso = createdDate.toISOString();

  const ip = params.ip || '127.0.0.1';
  const userAgent = params.userAgent || 'unknown';
  const before = params.before ?? null;
  const after = params.after ?? null;

  const payloadForHash = buildHashPayload({
    seq,
    actorId: params.actorId,
    actorRole: params.actorRole,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    before,
    after,
    ip,
    userAgent,
    prevHash,
    createdAt: createdAtIso
  });

  // 4. Compute SHA-256 hash using canonical JSON of payload
  const hash = computeAuditHash(prevHash, payloadForHash);

  // 5. Create and persist document
  const auditDoc = new AuditLog({
    seq,
    actorId: params.actorId,
    actorRole: params.actorRole,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    before,
    after,
    ip,
    userAgent,
    prevHash,
    hash,
    createdAt: createdDate
  });

  await auditDoc.save({ session });
  return auditDoc;
}

export interface ChainVerificationResult {
  valid: boolean;
  totalEntries: number;
  latestSeq: number;
  brokenAtSeq?: number;
  error?: string;
}

/**
 * Recomputes the entire audit chain from genesis to head and detects any tampering
 */
export async function verifyAuditChain(): Promise<ChainVerificationResult> {
  const logs = await AuditLog.find().sort({ seq: 1 }).lean().exec();

  if (logs.length === 0) {
    return {
      valid: true,
      totalEntries: 0,
      latestSeq: 0
    };
  }

  let expectedPrevHash = GENESIS_PREV_HASH;

  for (let i = 0; i < logs.length; i++) {
    const entry = logs[i];
    const expectedSeq = i + 1;

    // Check monotonic sequence integrity
    if (entry.seq !== expectedSeq) {
      return {
        valid: false,
        totalEntries: logs.length,
        latestSeq: logs[logs.length - 1].seq,
        brokenAtSeq: entry.seq,
        error: `Sequence gap detected: expected seq ${expectedSeq}, found ${entry.seq}`
      };
    }

    // Check previous hash link
    if (entry.prevHash !== expectedPrevHash) {
      return {
        valid: false,
        totalEntries: logs.length,
        latestSeq: logs[logs.length - 1].seq,
        brokenAtSeq: entry.seq,
        error: `Invalid prevHash at seq ${entry.seq}. Expected ${expectedPrevHash}, got ${entry.prevHash}`
      };
    }

    // Recompute SHA-256 hash
    const createdAtIso = new Date(entry.createdAt).toISOString();
    const payloadForHash = buildHashPayload({
      seq: entry.seq,
      actorId: entry.actorId,
      actorRole: entry.actorRole,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: (entry.before as Record<string, unknown>) ?? null,
      after: (entry.after as Record<string, unknown>) ?? null,
      ip: entry.ip,
      userAgent: entry.userAgent,
      prevHash: entry.prevHash,
      createdAt: createdAtIso
    });

    const recomputedHash = computeAuditHash(entry.prevHash, payloadForHash);
    if (entry.hash !== recomputedHash) {
      return {
        valid: false,
        totalEntries: logs.length,
        latestSeq: logs[logs.length - 1].seq,
        brokenAtSeq: entry.seq,
        error: `Data tampering detected at seq ${entry.seq}. Stored hash: ${entry.hash}, Recomputed: ${recomputedHash}`
      };
    }

    expectedPrevHash = entry.hash;
  }

  return {
    valid: true,
    totalEntries: logs.length,
    latestSeq: logs[logs.length - 1].seq
  };
}
