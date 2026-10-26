export type UserRole =
  | 'INSTITUTION'
  | 'SCRUTINY_OFFICER'
  | 'APPROVING_AUTHORITY'
  | 'ADMIN'
  | 'AUDITOR';

export interface AuthenticatedUser {
  id: string;
  email?: string;
  role: UserRole;
  institutionId?: string | null;
  aal: 'aal1' | 'aal2';
  isActive: boolean;
  fullName?: string;
}

export type FdrStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_SCRUTINY'
  | 'ACTIVE'
  | 'EXPIRING'
  | 'MATURED'
  | 'RENEWED'
  | 'RELEASE_REQUESTED'
  | 'RELEASED'
  | 'REJECTED';

export type VerificationStatus =
  | 'SUBMITTED_UNVERIFIED'
  | 'BANK_VERIFIED'
  | 'VERIFICATION_FAILED'
  | 'DISCREPANCY_FLAGGED';

export interface FdrRecord {
  _id: string;
  id?: string;
  institutionId: string;
  last4: string;
  bankName: string;
  branch: string;
  amount: number;
  issueDate: string;
  maturityDate: string;
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
    timestamp: string;
    note?: string;
  }>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentRecord {
  id: string;
  _id?: string;
  fdrId: string;
  type: string;
  originalName: string;
  sizeBytes: number;
  version: number;
  createdAt: string;
}

export interface ExtractionField {
  name: string;
  value: string | number | boolean | null;
  confidence: number;
  confirmedBy?: string | null;
}

export interface ExtractionRecord {
  _id: string;
  id?: string;
  documentId: string;
  fdrId: string;
  fields: ExtractionField[];
  model: string;
  status: 'UNCONFIRMED' | 'CONFIRMED' | 'REJECTED';
  createdAt: string;
}

export interface ReleaseRequestRecord {
  _id: string;
  id?: string;
  fdrId: FdrRecord | string;
  institutionId: string;
  reason: string;
  status: 'PENDING_OFFICER_REVIEW' | 'RECOMMENDED_FOR_APPROVAL' | 'REJECTED' | 'APPROVED';
  requestedBy: string;
  processedBy?: string | null;
  processedAt?: string | null;
  officerNotes?: string;
  decidedBy?: string | null;
  decidedAt?: string | null;
  decisionNotes?: string;
  createdAt: string;
}

export interface DashboardSummary {
  totalRecords: number;
  totalDepositAmount: number;
  statusDistribution: Record<string, number>;
  highRiskCount: number;
  expiringWithin90Days: number;
  pendingScrutinyCount: number;
  releaseRequestedCount: number;
}
