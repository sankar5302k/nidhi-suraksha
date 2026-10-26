import mongoose, { Schema, Document } from 'mongoose';

export const RELEASE_REQUEST_STATUSES = [
  'PENDING_OFFICER_REVIEW',
  'RECOMMENDED_FOR_APPROVAL',
  'REJECTED',
  'APPROVED'
] as const;

export type ReleaseRequestStatus = typeof RELEASE_REQUEST_STATUSES[number];

export interface IReleaseRequest extends Document {
  fdrId: mongoose.Types.ObjectId;
  institutionId: string;
  reason: string;
  status: ReleaseRequestStatus;
  requestedBy: string;
  processedBy?: string | null; // Scrutiny Officer
  processedAt?: Date | null;
  officerNotes?: string;
  decidedBy?: string | null; // Approving Authority
  decidedAt?: Date | null;
  decisionNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const releaseRequestSchema = new Schema<IReleaseRequest>(
  {
    fdrId: { type: Schema.Types.ObjectId, ref: 'Fdr', required: true, index: true },
    institutionId: { type: String, required: true, index: true },
    reason: { type: String, required: true },
    status: {
      type: String,
      enum: RELEASE_REQUEST_STATUSES,
      default: 'PENDING_OFFICER_REVIEW',
      index: true
    },
    requestedBy: { type: String, required: true },
    processedBy: { type: String, default: null },
    processedAt: { type: Date, default: null },
    officerNotes: { type: String },
    decidedBy: { type: String, default: null },
    decidedAt: { type: Date, default: null },
    decisionNotes: { type: String }
  },
  {
    timestamps: true,
    collection: 'releaseRequests',
    strict: true
  }
);

export const ReleaseRequest = mongoose.model<IReleaseRequest>('ReleaseRequest', releaseRequestSchema);
