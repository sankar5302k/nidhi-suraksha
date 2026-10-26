import crypto from 'crypto';
import mongoose from 'mongoose';
import { IDocument } from '../models/document.js';
import { Fdr, IFdr } from '../models/fdr.js';
import { Extraction, IExtraction } from '../models/extraction.js';
import { downloadAndDecryptDocument } from './uploadService.js';
import { extractDocumentText } from './ocr/textExtractor.js';
import { redactSensitivePii } from './ocr/redactor.js';
import { detectPromptInjection } from './ocr/injectionDetector.js';
import { getLlmProvider } from './llm/llmFactory.js';
import { EXTRACTION_PROMPT_VERSION } from './llm/prompts.js';
import { computeRiskScore } from './riskEngine.js';
import { recordAuditLog } from './auditService.js';
import { decryptField } from '../utils/crypto.js';

export interface ExtractionPipelineResult {
  extraction: IExtraction;
  riskScore: number;
  riskReasons: string[];
  discrepancies: string[];
}

/**
 * Runs the end-to-end Document AI extraction pipeline:
 * 1. Decrypts envelope-encrypted document into memory
 * 2. Extracts plain text and inspects metadata anomalies
 * 3. Scans for adversarial prompt-injection phrases
 * 4. Redacts PII (PAN, Aadhaar, phone, email, accounts)
 * 5. Passes redacted text to LLM (Groq / Mock) with strict JSON schema
 * 6. Validates output schema with Zod server-side
 * 7. Compares extracted vs institution-entered values
 * 8. Recomputes risk score and explainable reasons
 * 9. Persists extraction as UNCONFIRMED
 */
export async function runDocumentAiExtraction(
  fdr: IFdr,
  doc: IDocument,
  actorUserId: string,
  actorRole: string
): Promise<ExtractionPipelineResult> {
  // 1. Decrypt file in memory
  const { plaintextBuffer, mimeType } = await downloadAndDecryptDocument(doc);

  // 2. OCR and text extraction
  const { text: ocrText, metadata } = await extractDocumentText(plaintextBuffer, mimeType);

  // 3. Scan for prompt injection attempts in untrusted text
  const injection = detectPromptInjection(ocrText);

  // 4. Data minimization: redact sensitive PII before text leaves the server
  const { redactedText } = redactSensitivePii(ocrText);

  // 5. Call LLM provider with fallback handling
  const llm = getLlmProvider();
  let extractedFields = await llm.extractFdr(redactedText, actorUserId);

  // 6. Decrypt FDR number for comparison
  let enteredFdrNumber = '';
  try {
    enteredFdrNumber = decryptField(
      fdr.fdrNumberEnc.ciphertext,
      fdr.fdrNumberEnc.iv,
      fdr.fdrNumberEnc.authTag
    );
  } catch {
    enteredFdrNumber = fdr.last4;
  }

  // 7. Field discrepancy comparisons
  const discrepancies: string[] = [];

  // Compare FDR number
  if (
    extractedFields.fdrNumber.value &&
    enteredFdrNumber &&
    extractedFields.fdrNumber.value.trim().toUpperCase() !== enteredFdrNumber.trim().toUpperCase()
  ) {
    discrepancies.push(
      `FDR Number mismatch: Entered '${enteredFdrNumber}', Extracted '${extractedFields.fdrNumber.value}'`
    );
  }

  // Compare Bank Name
  if (
    extractedFields.bankName.value &&
    fdr.bankName &&
    extractedFields.bankName.value.trim().toLowerCase() !== fdr.bankName.trim().toLowerCase()
  ) {
    discrepancies.push(
      `Bank Name mismatch: Entered '${fdr.bankName}', Extracted '${extractedFields.bankName.value}'`
    );
  }

  // Compare Amount
  if (
    extractedFields.amount.value !== null &&
    Math.abs(extractedFields.amount.value - fdr.amount) > 0.01
  ) {
    discrepancies.push(
      `Amount mismatch: Entered ₹${fdr.amount.toLocaleString('en-IN')}, Extracted ₹${extractedFields.amount.value.toLocaleString('en-IN')}`
    );
  }

  // Calculate average confidence
  const confidences = [
    extractedFields.fdrNumber.confidence,
    extractedFields.bankName.confidence,
    extractedFields.branch.confidence,
    extractedFields.amount.confidence,
    extractedFields.issueDate.confidence,
    extractedFields.maturityDate.confidence,
    extractedFields.depositorName.confidence,
    extractedFields.lienInFavourOfAicte.confidence
  ];
  const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;

  // 8. Recompute Risk Score
  const riskResult = computeRiskScore({
    amount: fdr.amount,
    issueDate: fdr.issueDate,
    maturityDate: fdr.maturityDate,
    lienInFavourOfAicte: fdr.lienInFavourOfAicte,
    hasPdfMetadataAnomaly: metadata.hasMetadataAnomaly,
    pdfAnomalyReason: metadata.anomalyReason,
    hasPromptInjection: injection.hasInjection,
    injectionDetails: injection.matchedPatterns,
    extractionComparison: {
      hasFieldMismatch: discrepancies.length > 0,
      mismatches: discrepancies,
      averageConfidence: avgConfidence
    }
  });

  // Update FDR risk metrics
  fdr.riskScore = riskResult.riskScore;
  fdr.riskReasons = riskResult.riskReasons;
  if (discrepancies.length > 0 && fdr.verificationStatus === 'SUBMITTED_UNVERIFIED') {
    fdr.verificationStatus = 'DISCREPANCY_FLAGGED';
  }
  await fdr.save();

  // 9. Format extraction fields array
  const fieldsArray = [
    { name: 'fdrNumber', value: extractedFields.fdrNumber.value, confidence: extractedFields.fdrNumber.confidence },
    { name: 'bankName', value: extractedFields.bankName.value, confidence: extractedFields.bankName.confidence },
    { name: 'branch', value: extractedFields.branch.value, confidence: extractedFields.branch.confidence },
    { name: 'amount', value: extractedFields.amount.value, confidence: extractedFields.amount.confidence },
    { name: 'issueDate', value: extractedFields.issueDate.value, confidence: extractedFields.issueDate.confidence },
    { name: 'maturityDate', value: extractedFields.maturityDate.value, confidence: extractedFields.maturityDate.confidence },
    { name: 'depositorName', value: extractedFields.depositorName.value, confidence: extractedFields.depositorName.confidence },
    { name: 'lienInFavourOfAicte', value: extractedFields.lienInFavourOfAicte.value, confidence: extractedFields.lienInFavourOfAicte.confidence }
  ];

  const inputHash = crypto.createHash('sha256').update(redactedText).digest('hex');

  // 10. Persist extraction record (UNCONFIRMED by default)
  const extraction = new Extraction({
    documentId: doc._id,
    fdrId: fdr._id,
    fields: fieldsArray,
    model: 'openai/gpt-oss-120b',
    promptVersion: EXTRACTION_PROMPT_VERSION,
    inputHash,
    validatedJson: extractedFields,
    status: 'UNCONFIRMED'
  });

  await extraction.save();

  // 11. Audit log the AI extraction event
  await recordAuditLog({
    actorId: actorUserId,
    actorRole,
    action: 'AI_DOCUMENT_EXTRACTED',
    entityType: 'EXTRACTION',
    entityId: extraction.id,
    after: {
      fdrId: fdr.id,
      documentId: doc.id,
      riskScore: riskResult.riskScore,
      discrepancyCount: discrepancies.length,
      averageConfidence: avgConfidence
    }
  }).catch(() => {});

  return {
    extraction,
    riskScore: riskResult.riskScore,
    riskReasons: riskResult.riskReasons,
    discrepancies
  };
}
