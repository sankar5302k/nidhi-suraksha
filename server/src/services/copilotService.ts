import { z } from 'zod';
import { FDR_STATUSES, Fdr, IFdr } from '../models/fdr.js';
import { AuthenticatedUser } from '../types/auth.js';
import { buildFdrQueryFilter, checkFdrAccess } from '../utils/authz.js';
import { recordAuditLog } from './auditService.js';
import { checkDailyAiBudget } from './llm/LlmProvider.js';
import { getLlmProvider } from './llm/llmFactory.js';
import mongoose from 'mongoose';

export const copilotFilterSchema = z.object({
  status: z.array(z.enum(FDR_STATUSES)).optional(),
  bank: z.string().optional(),
  maturityWithinDays: z.number().positive().max(3650).optional(),
  riskMin: z.number().min(0).max(100).optional(),
  limit: z.number().min(1).max(100).default(20)
}).strict();

export type CopilotFilter = z.infer<typeof copilotFilterSchema>;

/**
 * Natural language copilot query parser.
 * Maps human queries into a strict structured filter object, then strictly filters via object-level authorization.
 */
export async function executeCopilotQuery(
  question: string,
  user: AuthenticatedUser
): Promise<{ filter: CopilotFilter; results: Record<string, unknown>[] }> {
  await checkDailyAiBudget(user.id);

  // Parse natural language query intent
  const q = question.toLowerCase();
  const filterObj: Partial<CopilotFilter> = {};

  if (q.includes('expir') || q.includes('mature soon') || q.includes('due soon')) {
    filterObj.status = ['EXPIRING', 'MATURED'];
    filterObj.maturityWithinDays = 90;
  } else if (q.includes('active') || q.includes('verified')) {
    filterObj.status = ['ACTIVE'];
  } else if (q.includes('scrutiny') || q.includes('pending') || q.includes('unverified')) {
    filterObj.status = ['SUBMITTED', 'UNDER_SCRUTINY'];
  } else if (q.includes('release')) {
    filterObj.status = ['RELEASE_REQUESTED', 'RELEASED'];
  }

  if (q.includes('high risk') || q.includes('risky') || q.includes('anomaly')) {
    filterObj.riskMin = 30;
  }

  // Extract bank if mentioned
  const banks = ['State Bank of India', 'HDFC Bank', 'ICICI Bank', 'Punjab National Bank', 'Canara Bank', 'Bank of Baroda'];
  for (const b of banks) {
    if (q.includes(b.toLowerCase())) {
      filterObj.bank = b;
      break;
    }
  }

  const validatedFilter = copilotFilterSchema.parse(filterObj);

  // Construct MongoDB filter strictly through the authorized query layer to prevent access expansion
  const baseFilter: Record<string, unknown> = {};
  if (validatedFilter.status && validatedFilter.status.length > 0) {
    baseFilter.status = mongoose.trusted({ $in: validatedFilter.status });
  }
  if (validatedFilter.bank) {
    baseFilter.bankName = validatedFilter.bank;
  }
  if (validatedFilter.riskMin !== undefined) {
    baseFilter.riskScore = mongoose.trusted({ $gte: validatedFilter.riskMin });
  }
  if (validatedFilter.maturityWithinDays !== undefined) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + validatedFilter.maturityWithinDays);
    baseFilter.maturityDate = mongoose.trusted({ $lte: futureDate });
  }

  // Enforce object-level authorization (institutions can NEVER see other institutions)
  const secureFilter = buildFdrQueryFilter(user, baseFilter);

  const rawResults = await Fdr.find(secureFilter)
    .select('-fdrNumberEnc')
    .limit(validatedFilter.limit)
    .sort({ riskScore: -1, maturityDate: 1 })
    .lean();

  await recordAuditLog({
    actorId: user.id,
    actorRole: user.role,
    action: 'COPILOT_QUERY_EXECUTED',
    entityType: 'COPILOT',
    entityId: user.id,
    after: {
      questionSnippet: question.slice(0, 50),
      resultCount: rawResults.length,
      filter: validatedFilter
    }
  }).catch(() => {});

  return {
    filter: validatedFilter,
    results: rawResults as Record<string, unknown>[]
  };
}

/**
 * Drafts an official deficiency or reminder letter from structured case facts.
 * Shown for human review; NEVER sent automatically.
 */
export async function draftCaseNotice(
  fdrId: string,
  user: AuthenticatedUser
): Promise<string> {
  await checkDailyAiBudget(user.id);

  const fdr = await Fdr.findById(fdrId);
  checkFdrAccess(user, fdr);

  if (!fdr) {
    throw new Error('FDR record not found');
  }

  // Generate plain text letter strictly from validated case facts (no raw file or arbitrary prompt injection)
  const noticeText = `
ALL INDIA COUNCIL FOR TECHNICAL EDUCATION (AICTE)
REGULATION BUREAU - SECURITY DEPOSIT & FDR CELL
Nelson Mandela Marg, Vasant Kunj, New Delhi - 110070

Ref No: AICTE/REG/FDR/${fdr.last4}/${new Date().getFullYear()}
Date: ${new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}

To:
The Principal / Director / Authorized Representative
Institution Reference: ${fdr.institutionId}

SUBJECT: NOTICE REGARDING COMPLIANCE OF SECURITY DEPOSIT / FDR (ENDING: ${fdr.last4})

Sir / Madam,

This is with reference to the Security Deposit / Fixed Deposit Receipt submitted to AICTE as per the Approval Process Handbook regulations:

1. FDR Details on Record:
   - Deposit Reference: XXXX-XXXX-${fdr.last4}
   - Bank Name: ${fdr.bankName} (${fdr.branch})
   - Deposit Amount: ₹${fdr.amount.toLocaleString('en-IN')}
   - Maturity Date: ${new Date(fdr.maturityDate).toISOString().slice(0, 10)}
   - Current Status: ${fdr.status}
   - Verification Status: ${fdr.verificationStatus}

2. Observations / Compliance Points:
${fdr.riskReasons && fdr.riskReasons.length > 0
  ? fdr.riskReasons.map((r, i) => `   (${i + 1}) ${r}`).join('\n')
  : '   (1) Please ensure timely submission of renewal receipt before the maturity deadline.'}

3. Required Action:
   You are hereby requested to log in to the "Nidhi Suraksha" portal within 15 calendar days and submit necessary compliance, renewal receipt, or valid bank confirmation with AICTE lien marked.

Yours faithfully,

${user.fullName || 'Competent Authority'}
${user.role.replace(/_/g, ' ')}
AICTE Regulation Bureau, New Delhi
`;

  await recordAuditLog({
    actorId: user.id,
    actorRole: user.role,
    action: 'NOTICE_DRAFTED_BY_AI',
    entityType: 'FDR',
    entityId: fdr.id,
    after: {
      fdrId: fdr.id,
      draftedBy: user.id
    }
  }).catch(() => {});

  return noticeText.trim();
}
