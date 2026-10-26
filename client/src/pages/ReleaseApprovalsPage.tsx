import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { ReleaseRequestRecord, FdrRecord } from '../types.js';
import { useAuth } from '../context/AuthContext.js';
import { StatusBadge, VerificationBadge } from '../components/StatusBadge.js';
import {
  FileCheck2,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Eye,
  Loader2,
  Clock,
  UserCheck,
  Building2,
  Lock
} from 'lucide-react';

export const ReleaseApprovalsPage: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'OFFICER' | 'AUTHORITY' | 'ARCHIVE'>('OFFICER');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery<{ data: ReleaseRequestRecord[] }>({
    queryKey: ['release-requests'],
    queryFn: () => apiRequest<{ data: ReleaseRequestRecord[] }>('/release-requests')
  });

  const requests = data?.data || [];

  // Scrutiny Officer Process Mutation
  const processMutation = useMutation({
    mutationFn: ({ id, decision, reviewNotes }: { id: string; decision: 'RECOMMEND' | 'REJECT'; reviewNotes?: string }) =>
      apiRequest(`/release-requests/${id}/process`, {
        method: 'POST',
        body: JSON.stringify({ decision, notes: reviewNotes })
      }),
    onSuccess: (_, vars) => {
      setActionSuccess(`Release request ${vars.decision === 'RECOMMEND' ? 'recommended for authority approval' : 'rejected'}.`);
      queryClient.invalidateQueries({ queryKey: ['release-requests'] });
    },
    onError: (err: unknown) => setActionError(err instanceof Error ? err.message : 'Processing failed')
  });

  // Approving Authority Decision Mutation
  const decisionMutation = useMutation({
    mutationFn: ({ id, decision, decisionNotes }: { id: string; decision: 'APPROVE' | 'REJECT'; decisionNotes?: string }) =>
      apiRequest(`/release-requests/${id}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision, notes: decisionNotes })
      }),
    onSuccess: (_, vars) => {
      setActionSuccess(`Release request officially ${vars.decision === 'APPROVE' ? 'APPROVED and FDR marked as RELEASED' : 'rejected'}.`);
      queryClient.invalidateQueries({ queryKey: ['release-requests'] });
    },
    onError: (err: unknown) => setActionError(err instanceof Error ? err.message : 'Decision failed')
  });

  const pendingOfficer = requests.filter(r => r.status === 'PENDING_OFFICER_REVIEW');
  const pendingAuthority = requests.filter(r => r.status === 'RECOMMENDED_FOR_APPROVAL');
  const archived = requests.filter(r => r.status === 'APPROVED' || r.status === 'REJECTED');

  const formatCurrency = (val?: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val || 0);
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="pb-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <FileCheck2 className="w-5 h-5 text-white" />
            Security Deposit Release Approvals
          </h1>
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
            Multi-Tier Workflow
          </span>
        </div>
        <p className="text-xs text-zinc-400 mt-1">
          Review, scrutinize, and formally authorize the release or refund of mature institutional fixed deposits.
        </p>
      </div>

      {/* Separation of Duties Mandate Banner */}
      <div className="p-4 rounded-lg bg-zinc-900/80 border border-zinc-700 text-xs space-y-2">
        <div className="flex items-center gap-2 text-white font-semibold">
          <ShieldAlert className="w-4 h-4 text-zinc-200" />
          <span>Statutory Governance Rule: Hard Separation of Duties</span>
        </div>
        <p className="text-zinc-400 leading-relaxed text-[11px]">
          In accordance with AICTE financial regulations, an officer who processes or recommends a deposit release is strictly prohibited from approving that same release as Approving Authority. Cross-role approvals are rejected at the application and database layer.
        </p>
      </div>

      {/* Alert Notices */}
      {actionError && (
        <div className="p-3 rounded bg-red-950/40 border border-red-800 text-red-200 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-zinc-400 hover:text-white text-sm">×</button>
        </div>
      )}

      {actionSuccess && (
        <div className="p-3 rounded bg-emerald-950/40 border border-emerald-800 text-emerald-200 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-zinc-400 hover:text-white text-sm">×</button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-zinc-800 text-xs">
        <button
          onClick={() => setActiveTab('OFFICER')}
          className={`py-2.5 px-4 font-medium flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'OFFICER'
              ? 'border-white text-white bg-zinc-900/40'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Officer Scrutiny Queue</span>
          <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300">
            {pendingOfficer.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('AUTHORITY')}
          className={`py-2.5 px-4 font-medium flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'AUTHORITY'
              ? 'border-white text-white bg-zinc-900/40'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <UserCheck className="w-3.5 h-3.5" />
          <span>Authority Approval Queue</span>
          <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300">
            {pendingAuthority.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('ARCHIVE')}
          className={`py-2.5 px-4 font-medium flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'ARCHIVE'
              ? 'border-white text-white bg-zinc-900/40'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <FileCheck2 className="w-3.5 h-3.5" />
          <span>Decision History</span>
          <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300">
            {archived.length}
          </span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="p-12 text-center text-xs text-zinc-500 space-y-2">
            <Loader2 className="w-5 h-5 mx-auto animate-spin" />
            <p>Loading release queues...</p>
          </div>
        ) : isError ? (
          <div className="p-8 text-center text-xs text-red-400">
            Failed to load release requests: {error instanceof Error ? error.message : 'Unknown error'}
          </div>
        ) : (
          <>
            {/* Tab 1: Officer Scrutiny Queue */}
            {activeTab === 'OFFICER' && (
              <div className="space-y-3">
                {pendingOfficer.length === 0 ? (
                  <div className="p-10 text-center text-xs text-zinc-500 bg-zinc-900/30 rounded-lg border border-zinc-800">
                    No release requests currently awaiting officer scrutiny.
                  </div>
                ) : (
                  pendingOfficer.map(req => {
                    const fdr = req.fdrId as FdrRecord;
                    const reqId = req._id || req.id!;
                    const currentNote = notes[reqId] || '';

                    return (
                      <div
                        key={reqId}
                        className="p-5 rounded-lg bg-zinc-900/50 border border-zinc-800 space-y-4"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-bold text-white">••••{fdr?.last4}</span>
                              <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-semibold border border-zinc-700">
                                PENDING OFFICER REVIEW
                              </span>
                            </div>
                            <div className="text-xs text-zinc-400">
                              {fdr?.bankName} • Principal: <strong className="text-white font-mono">{formatCurrency(fdr?.amount)}</strong>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <Link
                              to={`/fdrs/${fdr?._id || fdr?.id}`}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Inspect Deposit</span>
                            </Link>
                          </div>
                        </div>

                        {/* Request Justification */}
                        <div className="p-3 rounded bg-zinc-950/80 border border-zinc-800 text-xs space-y-1">
                          <span className="text-[10px] uppercase font-semibold text-zinc-500">Institution Stated Reason:</span>
                          <p className="text-zinc-200">{req.reason}</p>
                          <div className="text-[10px] text-zinc-500 pt-1">
                            Requested by {req.requestedBy} on {formatDate(req.createdAt)}
                          </div>
                        </div>

                        {/* Officer Action Form */}
                        {user?.role === 'SCRUTINY_OFFICER' ? (
                          <div className="pt-2 border-t border-zinc-800 space-y-3">
                            <input
                              type="text"
                              value={currentNote}
                              onChange={e => setNotes({ ...notes, [reqId]: e.target.value })}
                              placeholder="Enter scrutiny notes / recommendation justification..."
                              className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-700 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-400"
                            />
                            <div className="flex justify-end gap-2 text-xs">
                              <button
                                onClick={() =>
                                  processMutation.mutate({
                                    id: reqId,
                                    decision: 'REJECT',
                                    reviewNotes: currentNote
                                  })
                                }
                                disabled={processMutation.isPending}
                                className="px-3 py-1.5 rounded bg-red-950 hover:bg-red-900 border border-red-800 text-red-200 font-medium transition-colors"
                              >
                                Reject Release
                              </button>
                              <button
                                onClick={() =>
                                  processMutation.mutate({
                                    id: reqId,
                                    decision: 'RECOMMEND',
                                    reviewNotes: currentNote
                                  })
                                }
                                disabled={processMutation.isPending}
                                className="px-3 py-1.5 rounded bg-white hover:bg-zinc-200 text-black font-semibold transition-colors flex items-center gap-1.5"
                              >
                                {processMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                                <span>Recommend for Approval</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="text-[11px] text-zinc-500 italic">
                            Only Scrutiny Officers can recommend or reject in this tier.
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Tab 2: Authority Decision Queue */}
            {activeTab === 'AUTHORITY' && (
              <div className="space-y-3">
                {pendingAuthority.length === 0 ? (
                  <div className="p-10 text-center text-xs text-zinc-500 bg-zinc-900/30 rounded-lg border border-zinc-800">
                    No release requests currently awaiting final authority decision.
                  </div>
                ) : (
                  pendingAuthority.map(req => {
                    const fdr = req.fdrId as FdrRecord;
                    const reqId = req._id || req.id!;
                    const currentNote = notes[reqId] || '';
                    const isSelfProcessor = user?.id === req.processedBy;

                    return (
                      <div
                        key={reqId}
                        className="p-5 rounded-lg bg-zinc-900/50 border border-zinc-800 space-y-4"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-bold text-white">••••{fdr?.last4}</span>
                              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950/70 text-amber-300 font-semibold border border-amber-800">
                                RECOMMENDED FOR APPROVAL
                              </span>
                            </div>
                            <div className="text-xs text-zinc-400">
                              {fdr?.bankName} • Principal: <strong className="text-white font-mono">{formatCurrency(fdr?.amount)}</strong>
                            </div>
                          </div>

                          <Link
                            to={`/fdrs/${fdr?._id || fdr?.id}`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Inspect Deposit</span>
                          </Link>
                        </div>

                        {/* Scrutiny Officer Endorsement */}
                        <div className="p-3 rounded bg-zinc-950/80 border border-zinc-800 text-xs space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-zinc-400">
                            <span className="font-semibold text-zinc-300">Scrutiny Officer Recommendation:</span>
                            <span>Processed by <strong className="font-mono text-white">{req.processedBy}</strong> on {formatDate(req.processedAt)}</span>
                          </div>
                          <p className="text-zinc-200 italic">"{req.officerNotes || 'No specific notes recorded by officer.'}"</p>
                        </div>

                        {/* Separation of Duties Warning if same user */}
                        {isSelfProcessor && (
                          <div className="p-2.5 rounded bg-red-950/40 border border-red-800 text-[11px] text-red-300 flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                            <span>
                              <strong>Separation of Duties Alert:</strong> You processed this release request as Scrutiny Officer. You cannot act as Approving Authority for this case.
                            </span>
                          </div>
                        )}

                        {/* Authority Decision Form */}
                        {user?.role === 'APPROVING_AUTHORITY' ? (
                          <div className="pt-2 border-t border-zinc-800 space-y-3">
                            <input
                              type="text"
                              value={currentNote}
                              disabled={isSelfProcessor}
                              onChange={e => setNotes({ ...notes, [reqId]: e.target.value })}
                              placeholder="Enter official approval or rejection remarks..."
                              className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-700 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-400 disabled:opacity-50"
                            />
                            <div className="flex justify-end gap-2 text-xs">
                              <button
                                onClick={() =>
                                  decisionMutation.mutate({
                                    id: reqId,
                                    decision: 'REJECT',
                                    decisionNotes: currentNote
                                  })
                                }
                                disabled={decisionMutation.isPending || isSelfProcessor}
                                className="px-3 py-1.5 rounded bg-red-950 hover:bg-red-900 border border-red-800 text-red-200 font-medium disabled:opacity-50 transition-colors"
                              >
                                Reject Release
                              </button>
                              <button
                                onClick={() =>
                                  decisionMutation.mutate({
                                    id: reqId,
                                    decision: 'APPROVE',
                                    decisionNotes: currentNote
                                  })
                                }
                                disabled={decisionMutation.isPending || isSelfProcessor}
                                className="px-4 py-1.5 rounded bg-white hover:bg-zinc-200 text-black font-semibold disabled:opacity-50 transition-colors flex items-center gap-1.5 shadow-sm"
                              >
                                {decisionMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5 text-black" />}
                                <span>Officially Approve & Release FDR</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="text-[11px] text-zinc-500 italic">
                            Only the Approving Authority can approve this release. Switch to Authority persona in the header to simulate.
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Tab 3: Completed / Archival Log */}
            {activeTab === 'ARCHIVE' && (
              <div className="space-y-3">
                {archived.length === 0 ? (
                  <div className="p-10 text-center text-xs text-zinc-500 bg-zinc-900/30 rounded-lg border border-zinc-800">
                    No historical release decisions recorded yet.
                  </div>
                ) : (
                  archived.map(req => {
                    const fdr = req.fdrId as FdrRecord;
                    const isApproved = req.status === 'APPROVED';

                    return (
                      <div
                        key={req._id || req.id}
                        className="p-4 rounded-lg bg-zinc-900/40 border border-zinc-800 text-xs space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-white">••••{fdr?.last4}</span>
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                                isApproved
                                  ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                                  : 'bg-red-950/60 border-red-800 text-red-300'
                              }`}
                            >
                              {req.status}
                            </span>
                          </div>
                          <span className="text-[11px] text-zinc-500">Decided on {formatDate(req.decidedAt)}</span>
                        </div>

                        <div className="text-zinc-400">
                          Officer: <span className="font-mono text-zinc-300">{req.processedBy}</span> • Authority:{' '}
                          <span className="font-mono text-zinc-300">{req.decidedBy}</span>
                        </div>

                        {req.decisionNotes && (
                          <p className="text-zinc-300 italic pt-1 border-t border-zinc-800">"{req.decisionNotes}"</p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
