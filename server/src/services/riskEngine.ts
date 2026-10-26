export interface RiskAssessmentInput {
  amount: number;
  issueDate: Date;
  maturityDate: Date;
  lienInFavourOfAicte: boolean;
  minRequiredDeposit?: number; // default 1,000,000 INR
  isDuplicateNumber?: boolean;
  isDuplicateFileHash?: boolean;
  hasPdfMetadataAnomaly?: boolean;
  pdfAnomalyReason?: string;
  hasPromptInjection?: boolean;
  injectionDetails?: string[];
  extractionComparison?: {
    hasFieldMismatch: boolean;
    mismatches: string[];
    averageConfidence: number;
  };
}

export interface RiskAssessmentResult {
  riskScore: number; // 0 to 100
  riskReasons: string[];
}

/**
 * Rules-first, explainable risk scoring engine.
 * Evaluates regulatory compliance, forensic document metadata, and consistency without LLM hallucination.
 */
export function computeRiskScore(input: RiskAssessmentInput): RiskAssessmentResult {
  let score = 0;
  const reasons: string[] = [];

  const minRequired = input.minRequiredDeposit ?? 1000000; // 10 Lakhs standard deposit

  // 1. Critical: Duplicate FDR number or duplicate document hash (+40)
  if (input.isDuplicateNumber) {
    score += 40;
    reasons.push('DUPLICATE_FDR_NUMBER: An FDR with this registration number already exists in the system.');
  }

  if (input.isDuplicateFileHash) {
    score += 40;
    reasons.push('DUPLICATE_FILE_HASH: An identical receipt file has previously been submitted.');
  }

  // 2. Critical: Prompt injection / instruction-like adversarial text in document (+35)
  if (input.hasPromptInjection) {
    score += 35;
    reasons.push(
      `ADVERSARIAL_INJECTION_DETECTED: Document contains system prompt manipulation phrases: ${input.injectionDetails?.join(', ') || 'instruction keywords'}.`
    );
  }

  // 3. High: Maturity date before or on issue date (+35)
  const issueTime = new Date(input.issueDate).getTime();
  const maturityTime = new Date(input.maturityDate).getTime();

  if (maturityTime <= issueTime) {
    score += 35;
    reasons.push('INVALID_DATES: Maturity date is on or before the issue date.');
  }

  // 4. High: Lien not in AICTE's favour (+30)
  if (!input.lienInFavourOfAicte) {
    score += 30;
    reasons.push('NO_AICTE_LIEN: Fixed Deposit Receipt does not show mandatory lien marked in favour of AICTE.');
  }

  // 5. Medium: Amount below required minimum deposit (+25)
  if (input.amount < minRequired) {
    score += 25;
    reasons.push(`INSUFFICIENT_DEPOSIT_AMOUNT: Deposit of ₹${input.amount.toLocaleString('en-IN')} is below the required minimum of ₹${minRequired.toLocaleString('en-IN')}.`);
  }

  // 6. Medium: Validity tenure under 6 months (+20)
  const tenureDays = (maturityTime - issueTime) / (1000 * 60 * 60 * 24);
  if (tenureDays > 0 && tenureDays < 180) {
    score += 20;
    reasons.push(`INADEQUATE_VALIDITY_TENURE: Validity tenure of ${Math.round(tenureDays)} days is under the mandatory 6 months (180 days).`);
  }

  // 7. Forensic: PDF metadata anomaly (+15)
  if (input.hasPdfMetadataAnomaly) {
    score += 15;
    reasons.push(`PDF_METADATA_ANOMALY: Document metadata indicates anomalies (${input.pdfAnomalyReason || 'timestamp inconsistency'}).`);
  }

  // 8. Extraction: Mismatch between institution-entered fields vs AI-extracted fields (+20)
  if (input.extractionComparison?.hasFieldMismatch) {
    score += 20;
    reasons.push(`DISCREPANCY_FLAGGED: Institution-entered values do not match document text: ${input.extractionComparison.mismatches.join(', ')}.`);
  }

  // 9. Low OCR confidence (+15)
  if (input.extractionComparison && input.extractionComparison.averageConfidence < 0.8) {
    score += 15;
    reasons.push(`LOW_CONFIDENCE_OCR: Document scan quality is degraded (average field confidence ${(input.extractionComparison.averageConfidence * 100).toFixed(0)}% < 80%).`);
  }

  // Cap risk score between 0 and 100
  const finalScore = Math.min(100, Math.max(0, score));

  return {
    riskScore: finalScore,
    riskReasons: reasons
  };
}
