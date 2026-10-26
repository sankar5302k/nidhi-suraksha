import mongoose, { Schema, Document } from 'mongoose';

export const FDR_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_SCRUTINY',
  'ACTIVE',
  'EXPIRING',
  'MATURED',
  'RENEWED',
  'RELEASE_REQUESTED',
  'RELEASED',
  'REJECTED'
] as const;

export type FdrStatus = typeof FDR_STATUSES[number];

export const VERIFICATION_STATUSES = [
  'SUBMITTED_UNVERIFIED',
  'BANK_VERIFIED',
  'VERIFICATION_FAILED',
  'DISCREPANCY_FLAGGED'
] as const;

export type VerificationStatus = typeof VERIFICATION_STATUSES[number];

export interface IFdr extends Document {
  institutionId: string; // Plain UUID string referencing Supabase public.institutions
  fdrNumberEnc: {
    ciphertext: string;
    iv: string;
    authTag: string;
  };
  fdrNumberHash: string; // Blind index HMAC-SHA256 for duplicate detection
  last4: string; // Last 4 characters for safe display
  bankName: string;
  branch: string;
  amount: number;
  issueDate: Date;
  maturityDate: Date;
  lienInFavourOfAicte: boolean;
  status: FdrStatus;
  verificationStatus: VerificationStatus;
  riskScore: number;
  riskReasons: string[];
  parentFdrId?: string | null;
  history: Array<{
    action: string;
    actorId: string;
    actorRole: string;
    timestamp: Date;
    note?: string;
  }>;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const fdrSchema = new Schema<IFdr>(
  {
    institutionId: { type: String, required: true, index: true },
    fdrNumberEnc: {
      ciphertext: { type: String, required: true },
      iv: { type: String, required: true },
      authTag: { type: String, required: true }
    },
    fdrNumberHash: { type: String, required: true, index: true },
    last4: { type: String, required: true, length: 4 },
    bankName: { type: String, required: true },
    branch: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    issueDate: { type: Date, required: true },
    maturityDate: { type: Date, required: true },
    lienInFavourOfAicte: { type: Boolean, required: true, default: false },
    status: {
      type: String,
      required: true,
      enum: FDR_STATUSES,
      default: 'DRAFT',
      index: true
    },
    verificationStatus: {
      type: String,
      required: true,
      enum: VERIFICATION_STATUSES,
      default: 'SUBMITTED_UNVERIFIED',
      index: true
    },
    riskScore: { type: Number, default: 0, min: 0, max: 100 },
    riskReasons: { type: [String], default: [] },
    parentFdrId: { type: String, default: null },
    history: [
      {
        action: { type: String, required: true },
        actorId: { type: String, required: true },
        actorRole: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
        note: { type: String }
      }
    ],
    createdBy: { type: String, required: true }
  },
  {
    timestamps: true,
    collection: 'fdrs',
    strict: true
  }
);

// Enforce compound unique index on (bankName, fdrNumberHash) to prevent duplicate FDR registrations
fdrSchema.index({ bankName: 1, fdrNumberHash: 1 }, { unique: true });

export const Fdr = mongoose.model<IFdr>('Fdr', fdrSchema);
