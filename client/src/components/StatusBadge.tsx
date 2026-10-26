import React from 'react';
import { FdrStatus, VerificationStatus } from '../types.js';
import {
  ShieldCheck,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  FileText,
  Sparkles,
  Building2,
  ShieldAlert
} from 'lucide-react';

interface StatusBadgeProps {
  status?: FdrStatus;
  verificationStatus?: VerificationStatus;
  type?: 'status' | 'verification' | 'source';
  source?: 'institution' | 'ai' | 'bank';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, verificationStatus, source }) => {
  if (source === 'institution') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-medium bg-neutral-900 border border-neutral-700 text-neutral-300">
        <Building2 className="w-3.5 h-3.5 text-neutral-400" />
        Submitted by institution
      </span>
    );
  }

  if (source === 'ai') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-medium bg-neutral-900 border border-zinc-700 text-zinc-300">
        <Sparkles className="w-3.5 h-3.5 text-zinc-400" />
        AI-suggested (unconfirmed)
      </span>
    );
  }

  if (source === 'bank') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-medium bg-neutral-900 border border-emerald-900 text-emerald-400">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
        Bank verified
      </span>
    );
  }

  if (verificationStatus) {
    return <VerificationBadge status={verificationStatus} />;
  }

  if (status) {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-neutral-900 border border-zinc-700 text-zinc-200">
            <CheckCircle2 className="w-3 h-3 text-zinc-400" />
            Active
          </span>
        );
      case 'EXPIRING':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-950/40 border border-amber-800/80 text-amber-300">
            <Clock className="w-3 h-3" />
            Expiring Soon
          </span>
        );
      case 'MATURED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-rose-950/40 border border-rose-800/80 text-rose-300">
            <AlertTriangle className="w-3 h-3" />
            Matured
          </span>
        );
      case 'RELEASED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-950/40 border border-emerald-800/80 text-emerald-300">
            <ShieldCheck className="w-3 h-3" />
            Released
          </span>
        );
      case 'RELEASE_REQUESTED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-neutral-900 border border-zinc-600 text-zinc-300">
            <Clock className="w-3 h-3" />
            Release Requested
          </span>
        );
      case 'UNDER_SCRUTINY':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-neutral-900 border border-zinc-700 text-zinc-300">
            <FileText className="w-3 h-3 text-zinc-400" />
            Under Scrutiny
          </span>
        );
      case 'SUBMITTED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-neutral-900 border border-zinc-700 text-zinc-300">
            <FileText className="w-3 h-3 text-zinc-400" />
            Submitted
          </span>
        );
      case 'RENEWED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-neutral-900 border border-zinc-700 text-zinc-400">
            <CheckCircle2 className="w-3 h-3" />
            Renewed
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-rose-950/40 border border-rose-800/80 text-rose-400">
            <XCircle className="w-3 h-3" />
            Rejected
          </span>
        );
      case 'DRAFT':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-neutral-900 border border-zinc-800 text-zinc-500">
            Draft
          </span>
        );
    }
  }

  return null;
};

export const VerificationBadge: React.FC<{ status: VerificationStatus }> = ({ status }) => {
  switch (status) {
    case 'BANK_VERIFIED':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-medium bg-emerald-950/60 border border-emerald-800 text-emerald-300">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Bank Verified
        </span>
      );
    case 'DISCREPANCY_FLAGGED':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-medium bg-amber-950/60 border border-amber-800 text-amber-300">
          <AlertTriangle className="w-3.5 h-3.5" />
          Discrepancy Flagged
        </span>
      );
    case 'VERIFICATION_FAILED':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-medium bg-rose-950/60 border border-rose-800 text-rose-300">
          <XCircle className="w-3.5 h-3.5" />
          Verification Failed
        </span>
      );
    case 'SUBMITTED_UNVERIFIED':
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-medium bg-zinc-900 border border-zinc-700 text-zinc-400">
          <Clock className="w-3.5 h-3.5" />
          Unverified
        </span>
      );
  }
};

export const RiskScoreBadge: React.FC<{ score?: number }> = ({ score = 0 }) => {
  const isHigh = score >= 60;
  const isMedium = score >= 30 && score < 60;

  if (isHigh) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-bold bg-rose-950/80 border border-rose-800 text-rose-300">
        <ShieldAlert className="w-3 h-3 text-rose-400" />
        {score} / 100
      </span>
    );
  }

  if (isMedium) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-bold bg-amber-950/80 border border-amber-800 text-amber-300">
        <AlertTriangle className="w-3 h-3 text-amber-400" />
        {score} / 100
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-bold bg-zinc-900 border border-zinc-700 text-zinc-300">
      <ShieldCheck className="w-3 h-3 text-zinc-400" />
      {score} / 100
    </span>
  );
};
