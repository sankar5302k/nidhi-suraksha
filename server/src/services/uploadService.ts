import path from 'path';
import crypto from 'crypto';
import { fileTypeFromBuffer } from 'file-type';
import { encryptFileBuffer, decryptFileBuffer } from './fileEncryptionService.js';
import { scanFileBuffer } from './antivirusScanner.js';
import { getStorageProvider } from './storage/storageFactory.js';
import { DocumentModel, IDocument, DocumentType } from '../models/document.js';

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];

export class UploadValidationError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'UploadValidationError';
    this.statusCode = statusCode;
  }
}

export interface ProcessUploadParams {
  fdrId: string;
  fileBuffer: Buffer;
  clientOriginalName: string;
  documentType: DocumentType;
  uploadedBy: string;
}

/**
 * Sanitizes client-supplied filenames to block path traversal and illegal characters
 */
export function sanitizeFilename(filename: string): string {
  const base = path.basename(filename);
  const sanitized = base.replace(/[^a-zA-Z0-9._-]/g, '_');
  return sanitized.length > 0 ? sanitized : 'document';
}

/**
 * Validates, scans, encrypts with envelope encryption, and persists a document
 */
export async function processDocumentUpload(params: ProcessUploadParams): Promise<IDocument> {
  const { fdrId, fileBuffer, clientOriginalName, documentType, uploadedBy } = params;

  // 1. Check file size ceiling (5 MB)
  if (fileBuffer.length > MAX_FILE_SIZE_BYTES) {
    throw new UploadValidationError(
      `File size (${(fileBuffer.length / (1024 * 1024)).toFixed(2)} MB) exceeds the maximum allowed limit of 5 MB.`,
      413
    );
  }

  if (fileBuffer.length === 0) {
    throw new UploadValidationError('Uploaded file is empty.', 400);
  }

  // 2. Validate real file type via magic bytes
  const detectedType = await fileTypeFromBuffer(fileBuffer);
  if (!detectedType || !ALLOWED_MIME_TYPES.includes(detectedType.mime)) {
    throw new UploadValidationError(
      `Unsupported or spoofed file format: detected '${detectedType?.mime || 'unknown'}'. Allowed formats: PDF, PNG, JPG.`,
      415
    );
  }

  // 3. Antivirus scan hook
  const avScan = await scanFileBuffer(fileBuffer);
  if (!avScan.isClean) {
    throw new UploadValidationError(
      `Malware or threat signature detected in file: ${avScan.threatName || 'Infected file'}. Upload rejected.`,
      400
    );
  }

  // 4. Sanitize original filename (prevent path-traversal)
  const safeOriginalName = sanitizeFilename(clientOriginalName);

  // 5. Envelope encryption (AES-256-GCM with wrapped per-file data key)
  const encryption = encryptFileBuffer(fileBuffer);

  // 6. Check for duplicate document within this FDR or globally
  const duplicateDoc = await DocumentModel.findOne({
    fdrId,
    sha256: encryption.sha256
  });

  if (duplicateDoc) {
    throw new UploadValidationError(
      'An identical document has already been uploaded for this FDR record.',
      409
    );
  }

  // 7. Calculate next version number for this document type under this FDR
  const prevVersionCount = await DocumentModel.countDocuments({
    fdrId,
    type: documentType
  });
  const version = prevVersionCount + 1;

  // 8. Generate non-deterministic random storage key
  const storageKey = `doc_${crypto.randomBytes(16).toString('hex')}_${Date.now()}`;

  // 9. Persist encrypted ciphertext into storage provider
  const storage = getStorageProvider();
  await storage.upload(storageKey, encryption.encryptedBuffer, detectedType.mime);

  // 10. Persist metadata into MongoDB
  const doc = new DocumentModel({
    fdrId,
    type: documentType,
    originalName: safeOriginalName,
    storageKey,
    mimeType: detectedType.mime,
    sizeBytes: fileBuffer.length,
    sha256: encryption.sha256,
    version,
    encryptedDataKey: encryption.encryptedDataKey,
    iv: encryption.iv,
    authTag: encryption.authTag,
    uploadedBy
  });

  await doc.save();
  return doc;
}

/**
 * Downloads and decrypts a document in memory for an authorized user
 */
export async function downloadAndDecryptDocument(doc: IDocument): Promise<{
  plaintextBuffer: Buffer;
  mimeType: string;
  originalName: string;
}> {
  const storage = getStorageProvider();
  const encryptedBuffer = await storage.download(doc.storageKey);

  const plaintextBuffer = decryptFileBuffer(
    encryptedBuffer,
    doc.encryptedDataKey,
    doc.iv,
    doc.authTag
  );

  return {
    plaintextBuffer,
    mimeType: doc.mimeType,
    originalName: doc.originalName
  };
}
