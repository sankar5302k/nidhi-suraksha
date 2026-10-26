import { LlmProvider, checkDailyAiBudget } from './LlmProvider.js';
import { FdrExtractionOutput } from './schema.js';
import { AiUsage } from '../../models/aiUsage.js';

export class MockLlmProvider implements LlmProvider {
  async extractFdr(redactedText: string, userId: string): Promise<FdrExtractionOutput> {
    await checkDailyAiBudget(userId);
    const start = Date.now();

    // Deterministic parsing based on standard Indian bank FDR patterns
    const fdrNumberMatch = redactedText.match(/(?:FDR|Receipt|Account|Deposit)\s*(?:No\.?|Number|#)?\s*[:\-]?\s*([A-Z0-9\/-]{5,25})/i);
    const bankMatch = redactedText.match(/(State Bank of India|HDFC Bank|ICICI Bank|Punjab National Bank|Canara Bank|Bank of Baroda|Union Bank of India|Axis Bank)/i);
    const branchMatch = redactedText.match(/Branch\s*[:\-]?\s*([A-Za-z0-9\s,]+?)(?:\r|\n|Date|Amount|Pin|$)/i);
    const amountMatch = redactedText.match(/(?:Rs\.?|INR|Amount|Deposit\s+Amount)\s*[:\-]?\s*(?:Rs\.?)?\s*([\d,]+(?:\.\d{2})?)/i);
    const issueDateMatch = redactedText.match(/(?:Issue\s+Date|Date\s+of\s+Issue|Value\s+Date|Booking\s+Date)\s*[:\-]?\s*(\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{4})/i);
    const maturityDateMatch = redactedText.match(/(?:Maturity\s+Date|Due\s+Date|Expiring\s+On)\s*[:\-]?\s*(\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{4})/i);
    const depositorMatch = redactedText.match(/(?:Depositor|In\s+the\s+Name\s+of|Name)\s*[:\-]?\s*([A-Za-z\s.]+?)(?:\r|\n|Lien|Amount|$)/i);
    const lienMatch = redactedText.match(/Lien(?:\s+Marked)?\s+in\s+Favour\s+of\s+(?:AICTE|Member\s+Secretary|All\s+India\s+Council)/i);

    // Normalize dates to YYYY-MM-DD
    const normalizeDate = (raw: string | undefined): string | null => {
      if (!raw) return null;
      const clean = raw.trim().replace(/\//g, '-');
      if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
      const parts = clean.split('-');
      if (parts.length === 3 && parts[2].length === 4) {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
      return null;
    };

    // Normalize amount
    let parsedAmount: number | null = null;
    if (amountMatch && amountMatch[1]) {
      const num = parseFloat(amountMatch[1].replace(/,/g, ''));
      if (!isNaN(num)) parsedAmount = num;
    }

    const output: FdrExtractionOutput = {
      fdrNumber: {
        value: fdrNumberMatch ? fdrNumberMatch[1].trim() : null,
        confidence: fdrNumberMatch ? 0.95 : 0
      },
      bankName: {
        value: bankMatch ? bankMatch[1].trim() : null,
        confidence: bankMatch ? 0.98 : 0
      },
      branch: {
        value: branchMatch ? branchMatch[1].trim() : null,
        confidence: branchMatch ? 0.85 : 0
      },
      amount: {
        value: parsedAmount,
        confidence: parsedAmount ? 0.96 : 0
      },
      issueDate: {
        value: normalizeDate(issueDateMatch?.[1]),
        confidence: issueDateMatch ? 0.92 : 0
      },
      maturityDate: {
        value: normalizeDate(maturityDateMatch?.[1]),
        confidence: maturityDateMatch ? 0.92 : 0
      },
      depositorName: {
        value: depositorMatch ? depositorMatch[1].trim() : null,
        confidence: depositorMatch ? 0.88 : 0
      },
      lienInFavourOfAicte: {
        value: Boolean(lienMatch),
        confidence: lienMatch ? 0.99 : 0.4
      }
    };

    const latencyMs = Date.now() - start;

    // Record usage in aiUsage without storing prompt/completion
    try {
      await AiUsage.create({
        userId,
        feature: 'document_extraction',
        tokensIn: Math.ceil(redactedText.length / 4),
        tokensOut: 250,
        latencyMs,
        status: 'SUCCESS'
      });
    } catch {
      // non-fatal
    }

    return output;
  }

  async parseQuery(question: string, userId: string): Promise<Record<string, unknown>> {
    await checkDailyAiBudget(userId);
    // Simple mock filter parser
    return {
      status: ['ACTIVE'],
      limit: 10
    };
  }

  async draftNotice(context: Record<string, unknown>, userId: string): Promise<string> {
    await checkDailyAiBudget(userId);
    return `AICTE NOTICE REF: NS/2026/FDR-NOTICE\nTo the Principal/Director,\nRegarding Fixed Deposit Receipt under AICTE security deposit regulations.`;
  }
}
