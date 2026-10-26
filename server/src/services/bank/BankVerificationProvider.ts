export interface BankVerificationQuery {
  bankName: string;
  fdrNumber: string;
  amount: number;
  maturityDate: Date | string;
}

export type BankVerificationStatus = 'VERIFIED' | 'MISMATCH' | 'NOT_FOUND';

export interface BankVerificationResponse {
  status: BankVerificationStatus;
  verificationReference?: string;
  verifiedAt: Date;
  bankResponseDetails?: {
    bankName: string;
    branchName?: string;
    confirmedAmount?: number;
    confirmedMaturityDate?: string;
    lienConfirmed?: boolean;
  };
  discrepancyNotes?: string;
}

export interface BankVerificationProvider {
  verifyFdr(query: BankVerificationQuery): Promise<BankVerificationResponse>;
}
