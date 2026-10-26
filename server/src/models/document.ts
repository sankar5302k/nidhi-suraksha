import mongoose, { Schema, Document } from 'mongoose';

export const DOCUMENT_TYPES = [
  'FDR_SCAN',
  'BANK_CONFIRMATION',
  'AICTE_APPROVAL',
  'RELEASE_ORDER'
] as const;

export type DocumentType = typeof DOCUMENT_TYPES[number];

export interface IDocument extends Document {
  fdrId: mongoose.Types.ObjectId;
  type: DocumentType;
  originalName: string; // Sanitized, no path traversal
  storageKey: string; // Random UUID/hex, never the user filename
  mimeType: string;
  sizeBytes: number;
  sha256: string; // Plaintext SHA-256 for duplicate detection
  version: number;
  encryptedDataKey: string; // Per-file data key wrapped with master key
  iv: string; // 12-byte IV for file AES-256-GCM
  authTag: string; // 16-byte GCM authentication tag
  uploadedBy: string; // Supabase user UUID
  createdAt: Date;
  updatedAt: Date;
}

const documentSchema = new Schema<IDocument>(
  {
    fdrId: { type: Schema.Types.ObjectId, ref: 'Fdr', required: true, index: true },
    type: { type: String, enum: DOCUMENT_TYPES, required: true, default: 'FDR_SCAN' },
    originalName: { type: String, required: true },
    storageKey: { type: String, required: true, unique: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    sha256: { type: String, required: true, index: true },
    version: { type: Number, required: true, default: 1 },
    encryptedDataKey: { type: String, required: true },
    iv: { type: String, required: true },
    authTag: { type: String, required: true },
    uploadedBy: { type: String, required: true }
  },
  {
    timestamps: true,
    collection: 'documents',
    strict: true
  }
);

export const DocumentModel = mongoose.model<IDocument>('Document', documentSchema);
