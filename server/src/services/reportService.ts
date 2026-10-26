import { Fdr } from '../models/fdr.js';
import { DocumentModel } from '../models/document.js';
import { AuthenticatedUser } from '../types/auth.js';
import { buildFdrQueryFilter } from '../utils/authz.js';

/**
 * Sanitizes CSV cell values to prevent CSV Injection / Formula Injection attacks (CWE-1236).
 * Prepends a single quote to any cell starting with '=', '+', '-', '@', or tab/carriage return.
 */
export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '""';
  }

  let str = String(value).trim();
  const dangerousChars = ['=', '+', '-', '@', '\t', '\r'];

  if (dangerousChars.some(char => str.startsWith(char))) {
    str = `'${str}`;
  }

  // Escape inner double quotes by doubling them
  str = str.replace(/"/g, '""');

  return `"${str}"`;
}

/**
 * Aggregates dashboard metrics with role-based query isolation
 */
export async function getDashboardSummary(user: AuthenticatedUser) {
  const filter = buildFdrQueryFilter(user);

  const fdrs = await Fdr.find(filter).lean();

  const statusDistribution: Record<string, number> = {
    DRAFT: 0,
    SUBMITTED: 0,
    UNDER_SCRUTINY: 0,
    ACTIVE: 0,
    EXPIRING: 0,
    MATURED: 0,
    RENEWED: 0,
    RELEASE_REQUESTED: 0,
    RELEASED: 0,
    REJECTED: 0
  };

  let totalAmount = 0;
  let highRiskCount = 0;
  let expiringWithin90Days = 0;
  const now = Date.now();

  for (const fdr of fdrs) {
    if (statusDistribution[fdr.status] !== undefined) {
      statusDistribution[fdr.status]++;
    }
    totalAmount += fdr.amount || 0;

    if (fdr.riskScore >= 30) {
      highRiskCount++;
    }

    const maturityMs = new Date(fdr.maturityDate).getTime();
    const daysLeft = (maturityMs - now) / (1000 * 60 * 60 * 24);
    if (daysLeft > 0 && daysLeft <= 90) {
      expiringWithin90Days++;
    }
  }

  return {
    totalRecords: fdrs.length,
    totalDepositAmount: totalAmount,
    statusDistribution,
    highRiskCount,
    expiringWithin90Days,
    pendingScrutinyCount: (statusDistribution.SUBMITTED || 0) + (statusDistribution.UNDER_SCRUTINY || 0),
    releaseRequestedCount: statusDistribution.RELEASE_REQUESTED || 0
  };
}

/**
 * Generates secure CSV export of FDR records
 */
export async function generateFdrCsv(user: AuthenticatedUser): Promise<string> {
  const filter = buildFdrQueryFilter(user);
  const fdrs = await Fdr.find(filter).sort({ createdAt: -1 }).lean();

  const headers = [
    'ID',
    'Institution ID',
    'FDR Last 4',
    'Bank Name',
    'Branch',
    'Amount (INR)',
    'Issue Date',
    'Maturity Date',
    'Lien in Favour of AICTE',
    'Status',
    'Verification Status',
    'Risk Score',
    'Created At'
  ];

  const rows = [headers.map(sanitizeCsvCell).join(',')];

  for (const f of fdrs) {
    const row = [
      String(f._id),
      f.institutionId,
      f.last4,
      f.bankName,
      f.branch,
      String(f.amount),
      new Date(f.issueDate).toISOString().slice(0, 10),
      new Date(f.maturityDate).toISOString().slice(0, 10),
      f.lienInFavourOfAicte ? 'YES' : 'NO',
      f.status,
      f.verificationStatus,
      String(f.riskScore),
      new Date(f.createdAt).toISOString()
    ];
    rows.push(row.map(sanitizeCsvCell).join(','));
  }

  return rows.join('\r\n');
}
