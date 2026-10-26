import { describe, it, expect } from 'vitest';
import { computeRiskScore } from '../src/services/riskEngine.js';

describe('Explainable Risk Scoring Engine', () => {
  it('returns riskScore 0 for a compliant, verified FDR with no anomalies', () => {
    const result = computeRiskScore({
      amount: 1500000,
      issueDate: new Date('2024-01-01'),
      maturityDate: new Date('2029-01-01'), // 5 years tenure (> 180 days)
      lienInFavourOfAicte: true,
      minRequiredDeposit: 1000000
    });

    expect(result.riskScore).toBe(0);
    expect(result.riskReasons).toHaveLength(0);
  });

  it('penalizes duplicate numbers, absence of AICTE lien, and invalid dates', () => {
    const result = computeRiskScore({
      amount: 1500000,
      issueDate: new Date('2029-01-01'),
      maturityDate: new Date('2024-01-01'), // Maturity before issue (+35)
      lienInFavourOfAicte: false, // No lien (+30)
      isDuplicateNumber: true // Duplicate (+40)
    });

    // 35 + 30 + 40 = 105, capped at 100
    expect(result.riskScore).toBe(100);
    expect(result.riskReasons).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/DUPLICATE_FDR_NUMBER/),
        expect.stringMatching(/INVALID_DATES/),
        expect.stringMatching(/NO_AICTE_LIEN/)
      ])
    );
  });

  it('penalizes short validity tenure (< 180 days) and insufficient deposit amount', () => {
    const issue = new Date('2024-01-01');
    const maturity = new Date('2024-03-01'); // 60 days (< 180 days, +20)

    const result = computeRiskScore({
      amount: 500000, // Under 1,000,000 (+25)
      issueDate: issue,
      maturityDate: maturity,
      lienInFavourOfAicte: true,
      minRequiredDeposit: 1000000
    });

    expect(result.riskScore).toBe(45);
    expect(result.riskReasons).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/INSUFFICIENT_DEPOSIT_AMOUNT/),
        expect.stringMatching(/INADEQUATE_VALIDITY_TENURE/)
      ])
    );
  });

  it('penalizes prompt injection and OCR field discrepancies', () => {
    const result = computeRiskScore({
      amount: 2000000,
      issueDate: new Date('2024-01-01'),
      maturityDate: new Date('2029-01-01'),
      lienInFavourOfAicte: true,
      hasPromptInjection: true, // +35
      injectionDetails: ['ignore previous'],
      extractionComparison: {
        hasFieldMismatch: true, // +20
        mismatches: ['Amount mismatch: Entered ₹20,00,000, Extracted ₹10,00,000'],
        averageConfidence: 0.72 // Low confidence +15
      }
    });

    // 35 + 20 + 15 = 70
    expect(result.riskScore).toBe(70);
    expect(result.riskReasons).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/ADVERSARIAL_INJECTION_DETECTED/),
        expect.stringMatching(/DISCREPANCY_FLAGGED/),
        expect.stringMatching(/LOW_CONFIDENCE_OCR/)
      ])
    );
  });
});
