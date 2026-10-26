import crypto from 'crypto';
import { getEnv } from '../config/env.js';

export interface EnvelopeEncryptionResult {
  encryptedBuffer: Buffer;
  encryptedDataKey: string; // Per-file AES-256 key encrypted by master key
  iv: string; // 12-byte IV for file encryption
  authTag: string; // 16-byte GCM authentication tag for file
  sha256: string; // Plaintext SHA-256 for duplicate detection
}

/**
 * Encrypts a file buffer using AES-256-GCM envelope encryption.
 * Generates an ephemeral 256-bit data key, encrypts the file with it,
 * and wraps (encrypts) the data key using the ENCRYPTION_MASTER_KEY.
 */
export function encryptFileBuffer(fileBuffer: Buffer): EnvelopeEncryptionResult {
  const env = getEnv();
  const masterKey = Buffer.from(env.ENCRYPTION_MASTER_KEY, 'hex');

  // 1. Compute SHA-256 hash of original plaintext for duplicate checking
  const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  // 2. Generate random ephemeral 256-bit (32-byte) per-file data key
  const perFileDataKey = crypto.randomBytes(32);

  // 3. Encrypt file buffer with per-file data key using AES-256-GCM
  const fileIv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', perFileDataKey, fileIv);

  const encryptedParts: Buffer[] = [];
  encryptedParts.push(cipher.update(fileBuffer));
  encryptedParts.push(cipher.final());
  const encryptedBuffer = Buffer.concat(encryptedParts);
  const authTag = cipher.getAuthTag();

  // 4. Wrap (encrypt) the per-file data key with the master key using AES-256-GCM
  const keyIv = crypto.randomBytes(12);
  const keyCipher = crypto.createCipheriv('aes-256-gcm', masterKey, keyIv);
  let wrappedKey = keyCipher.update(perFileDataKey);
  wrappedKey = Buffer.concat([wrappedKey, keyCipher.final()]);
  const keyAuthTag = keyCipher.getAuthTag();

  // Serialized wrapped key format: keyIv (12 bytes) + keyAuthTag (16 bytes) + wrappedKey (32 bytes)
  const encryptedDataKey = Buffer.concat([keyIv, keyAuthTag, wrappedKey]).toString('hex');

  return {
    encryptedBuffer,
    encryptedDataKey,
    iv: fileIv.toString('hex'),
    authTag: authTag.toString('hex'),
    sha256
  };
}

/**
 * Decrypts an envelope-encrypted file buffer.
 * Unwraps the per-file data key using ENCRYPTION_MASTER_KEY,
 * then decrypts the file buffer and verifies the GCM auth tag.
 */
export function decryptFileBuffer(
  encryptedBuffer: Buffer,
  encryptedDataKeyHex: string,
  ivHex: string,
  authTagHex: string
): Buffer {
  const env = getEnv();
  const masterKey = Buffer.from(env.ENCRYPTION_MASTER_KEY, 'hex');

  // 1. Unwrap the per-file data key
  const wrappedPayload = Buffer.from(encryptedDataKeyHex, 'hex');
  if (wrappedPayload.length < 28) {
    throw new Error('Corrupt or invalid encryptedDataKey structure');
  }

  const keyIv = wrappedPayload.subarray(0, 12);
  const keyAuthTag = wrappedPayload.subarray(12, 28);
  const wrappedKeyCiphertext = wrappedPayload.subarray(28);

  const keyDecipher = crypto.createDecipheriv('aes-256-gcm', masterKey, keyIv);
  keyDecipher.setAuthTag(keyAuthTag);
  const perFileDataKey = Buffer.concat([
    keyDecipher.update(wrappedKeyCiphertext),
    keyDecipher.final()
  ]);

  // 2. Decrypt the file buffer using the unwrapped data key
  const fileIv = Buffer.from(ivHex, 'hex');
  const fileAuthTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', perFileDataKey, fileIv);
  decipher.setAuthTag(fileAuthTag);

  const decryptedParts: Buffer[] = [];
  decryptedParts.push(decipher.update(encryptedBuffer));
  decryptedParts.push(decipher.final());

  return Buffer.concat(decryptedParts);
}
