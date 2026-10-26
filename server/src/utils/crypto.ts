import crypto from 'crypto';
import { getEnv } from '../config/env.js';

/**
 * Returns canonical JSON string with object keys sorted alphabetically recursively.
 * Ensures tamper-evident audit log hashing produces identical results regardless of key order.
 */
export function canonicalJsonStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return '[' + obj.map(item => canonicalJsonStringify(item)).join(',') + ']';
  }

  const record = obj as Record<string, unknown>;
  const sortedKeys = Object.keys(record).sort();
  const pairs = sortedKeys
    .filter(k => record[k] !== undefined)
    .map(k => `${JSON.stringify(k)}:${canonicalJsonStringify(record[k])}`);

  return '{' + pairs.join(',') + '}';
}

/**
 * Computes SHA-256 hash of previous hash concatenated with the canonical JSON of current payload
 */
export function computeAuditHash(prevHash: string, payload: Record<string, unknown>): string {
  const canonical = canonicalJsonStringify(payload);
  return crypto.createHash('sha256').update(prevHash + canonical).digest('hex');
}

/**
 * Generates HMAC-SHA256 blind index for deterministic searchable encryption (e.g. FDR number)
 */
export function computeBlindIndex(value: string): string {
  const env = getEnv();
  const key = Buffer.from(env.HMAC_KEY, 'hex');
  return crypto.createHmac('sha256', key).update(value.trim().toUpperCase()).digest('hex');
}

/**
 * Encrypts plaintext string using AES-256-GCM
 */
export function encryptField(plaintext: string): { ciphertext: string; iv: string; authTag: string } {
  const env = getEnv();
  const key = Buffer.from(env.ENCRYPTION_MASTER_KEY, 'hex');
  const iv = crypto.randomBytes(12); // standard 96-bit IV for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return {
    ciphertext: encrypted,
    iv: iv.toString('hex'),
    authTag
  };
}

/**
 * Decrypts AES-256-GCM ciphertext
 */
export function decryptField(ciphertext: string, ivHex: string, authTagHex: string): string {
  const env = getEnv();
  const key = Buffer.from(env.ENCRYPTION_MASTER_KEY, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Hashes email for lookup and rate limiting without exposing plaintext in failed-attempt logs
 */
export function hashEmail(email: string): string {
  return crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}
