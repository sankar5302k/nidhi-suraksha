import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, getFullApiUrl } from '../api/client.js';
import { FdrRecord, DocumentRecord, ExtractionRecord } from '../types.js';
import { useAuth } from '../context/AuthContext.js';
import { StatusBadge, VerificationBadge, RiskScoreBadge } from '../components/StatusBadge.js';
import {
  ArrowLeft,
  Building2,
  Calendar,
  ShieldCheck,
  ShieldAlert,
  FileText,
  Upload,
  Download,
  CheckCircle,
  AlertTriangle,
  Sparkles,
  Link2,
  History,
  Lock,
  Loader2,
  Check,
  Send,
  Flag,
  RotateCw
} from 'lucide-react';

interface AuditLogEntry {
  seq: number;
  action: string;
  actorRole: string;
  actorId: string;
  prevHash: string;
  hash: string;
  createdAt: string;
  note?: string;
}

interface FdrDetailResponse extends FdrRecord {
  documents?: DocumentRecord[];
  extractions?: ExtractionRecord[];
  auditLogs?: AuditLogEntry[];
}

export const FdrDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [docType, setDocType] = useState('FDR_SCAN');
  const [uploading, setUploading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Modals state
  const [showFlagModal, setShowFlagModal] = useState(false);
  const [flagReason, setFlagReason] = useState('');

  const [showReleaseModal, setShowReleaseModal] = useState(false);
  const [releaseReason, setReleaseReason] = useState('');

  const [showRenewModal, setShowRenewModal] = useState(false);
  const [renewForm, setRenewForm] = useState({
    fdrNumber: '',
    bankName: '',
    branch: '',
    amount: '',
    issueDate: new Date().toISOString().slice(0, 10),
    maturityDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    lienInFavourOfAicte: true
  });

  const [bankVerificationModal, setBankVerificationModal] = useState<{
    open: boolean;
    status?: string;
    reference?: string;
    notes?: string;
  }>({ open: false });

  // Query FDR details
  const { data, isLoading, isError, error, refetch } = useQuery<{ data: FdrDetailResponse }>({
    queryKey: ['fdr', id],
    queryFn: () => apiRequest<{ data: FdrDetailResponse }>(`/fdrs/${id}`),
    enabled: !!id
  });

  const fdr = data?.data;

  // Mutations
  const submitMutation = useMutation({
    mutationFn: () => apiRequest(`/fdrs/${id}/submit`, { method: 'POST' }),
    onSuccess: () => {
      setActionSuccess('FDR submitted for official scrutiny.');
      queryClient.invalidateQueries({ queryKey: ['fdr', id] });
    },
    onError: (err: unknown) => setActionError(err instanceof Error ? err.message : 'Submission failed')
  });

  const scrutinyMutation = useMutation({
    mutationFn: () => apiRequest(`/fdrs/${id}/scrutiny`, { method: 'POST' }),
    onSuccess: () => {
      setActionSuccess('FDR marked as under official scrutiny.');
      queryClient.invalidateQueries({ queryKey: ['fdr', id] });
    },
    onError: (err: unknown) => setActionError(err instanceof Error ? err.message : 'Action failed')
  });

  const verifyBankMutation = useMutation({
    mutationFn: () => apiRequest<{ data: { bankResponse: { status: string; verificationReference?: string; discrepancyNotes?: string } } }>(
      `/fdrs/${id}/verify`,
      { method: 'POST' }
    ),
    onSuccess: res => {
      setBankVerificationModal({
        open: true,
        status: res.data?.bankResponse?.status,
        reference: res.data?.bankResponse?.verificationReference,
        notes: res.data?.bankResponse?.discrepancyNotes
      });
      queryClient.invalidateQueries({ queryKey: ['fdr', id] });
    },
    onError: (err: unknown) => setActionError(err instanceof Error ? err.message : 'Bank verification failed')
  });

  const confirmExtractionMutation = useMutation({
    mutationFn: (extId: string) =>
      apiRequest(`/fdrs/${id}/extractions/${extId}/confirm`, { method: 'POST' }),
    onSuccess: () => {
      setActionSuccess('AI extractions confirmed and signed by officer.');
      queryClient.invalidateQueries({ queryKey: ['fdr', id] });
    },
    onError: (err: unknown) => setActionError(err instanceof Error ? err.message : 'Confirmation failed')
  });

  // Handle document upload
  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile || !id) return;

    setUploading(true);
    setActionError(null);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('type', docType);

      await apiRequest(`/fdrs/${id}/documents`, {
        method: 'POST',
        body: formData
      });

      setActionSuccess('Document encrypted and stored successfully.');
      setUploadFile(null);
      refetch();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  // Run AI extraction
  const handleExtract = async (docId: string) => {
    setActionError(null);
    try {
      await apiRequest(`/fdrs/${id}/documents/${docId}/extract`, { method: 'POST' });
      setActionSuccess('Document AI extraction completed. Please review confidence levels.');
      refetch();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'AI extraction failed');
    }
  };

  // Handle flag discrepancy
  const handleFlagSubmit = async () => {
    if (!flagReason.trim()) return;
    try {
      await apiRequest(`/fdrs/${id}/flag`, {
        method: 'POST',
        body: JSON.stringify({ reason: flagReason })
      });
      setShowFlagModal(false);
      setFlagReason('');
      setActionSuccess('Discrepancy recorded and flagged on deposit record.');
      refetch();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to flag discrepancy');
    }
  };

  // Handle release request
  const handleReleaseSubmit = async () => {
    if (!releaseReason.trim()) return;
    try {
      await apiRequest(`/fdrs/${id}/release-request`, {
        method: 'POST',
        body: JSON.stringify({ reason: releaseReason })
      });
      setShowReleaseModal(false);
      setReleaseReason('');
      setActionSuccess('Release request initiated. Submitted to Scrutiny Officer review queue.');
      refetch();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to submit release request');
    }
  };

  // Handle renewal submit
  const handleRenewSubmit = async () => {
    try {
      const payload = {
        fdrNumber: renewForm.fdrNumber,
        bankName: renewForm.bankName || fdr?.bankName,
        branch: renewForm.branch || fdr?.branch,
        amount: parseFloat(renewForm.amount) || fdr?.amount,
        issueDate: renewForm.issueDate,
        maturityDate: renewForm.maturityDate,
        lienInFavourOfAicte: renewForm.lienInFavourOfAicte
      };

      const res = await apiRequest<{ data: FdrRecord }>(`/fdrs/${id}/renew`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      setShowRenewModal(false);
      setActionSuccess('Renewal child FDR created successfully. Parent marked as RENEWED.');
      navigate(`/fdrs/${res.data._id}`);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to create renewal FDR');
    }
  };

  if (isLoading) {
    return (
      <div className="p-16 text-center text-xs text-zinc-400 space-y-2">
        <Loader2 className="w-6 h-6 mx-auto animate-spin text-zinc-500" />
        <p>Retrieving deposit record and verifying authorization scope...</p>
      </div>
    );
  }

  if (isError || !fdr) {
    return (
      <div className="p-12 text-center text-xs text-red-400 space-y-3">
        <ShieldAlert className="w-8 h-8 mx-auto text-red-500" />
        <p className="font-semibold text-sm">FDR Record Not Found or Access Denied</p>
        <p className="text-zinc-500 max-w-sm mx-auto">
          {error instanceof Error ? error.message : 'The deposit record does not exist or your organization is not authorized to inspect it.'}
        </p>
        <Link
          to="/fdrs"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-zinc-800 text-zinc-200 hover:text-white text-xs mt-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Deposit List
        </Link>
      </div>
    );
  }

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val || 0);
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb & Navigation */}
      <div className="flex items-center justify-between">
        <Link
          to="/fdrs"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Deposit Ledger</span>
        </Link>

        <span className="text-[11px] font-mono text-zinc-500">ID: {fdr._id}</span>
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

      {/* Record Summary Header */}
      <div className="p-6 rounded-lg bg-zinc-900/60 border border-zinc-800 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold font-mono tracking-tight text-white">••••{fdr.last4}</h1>
              <StatusBadge status={fdr.status} />
              <VerificationBadge status={fdr.verificationStatus} />
            </div>
            <p className="text-xs text-zinc-400 mt-1 flex items-center gap-2">
              <Building2 className="w-3.5 h-3.5 text-zinc-500" />
              <span>{fdr.bankName}</span>
              <span className="text-zinc-600">•</span>
              <span>{fdr.branch}</span>
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold">Deposit Principal</div>
              <div className="text-xl font-bold font-mono text-white">{formatCurrency(fdr.amount)}</div>
            </div>
            <div className="pl-4 border-l border-zinc-800 text-right">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold">Risk Rating</div>
              <div className="mt-0.5">
                <RiskScoreBadge score={fdr.riskScore} />
              </div>
            </div>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="pt-4 border-t border-zinc-800 flex flex-wrap items-center gap-2">
          {/* Institution: Submit Draft */}
          {fdr.status === 'DRAFT' && user?.role === 'INSTITUTION' && (
            <button
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white hover:bg-zinc-200 text-black font-semibold text-xs transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Submit for Scrutiny</span>
            </button>
          )}

          {/* Scrutiny Officer: Take Under Scrutiny */}
          {fdr.status === 'SUBMITTED' && user?.role === 'SCRUTINY_OFFICER' && (
            <button
              onClick={() => scrutinyMutation.mutate()}
              disabled={scrutinyMutation.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-xs border border-zinc-700 transition-colors"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Take Under Scrutiny</span>
            </button>
          )}

          {/* Scrutiny Officer: Verify Against Bank */}
          {(fdr.status === 'SUBMITTED' || fdr.status === 'UNDER_SCRUTINY') &&
            user?.role === 'SCRUTINY_OFFICER' && (
              <button
                onClick={() => verifyBankMutation.mutate()}
                disabled={verifyBankMutation.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white hover:bg-zinc-200 text-black font-semibold text-xs transition-colors shadow-sm"
              >
                {verifyBankMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle className="w-3.5 h-3.5 text-black" />
                )}
                <span>Verify Against Bank</span>
              </button>
            )}

          {/* Scrutiny Officer: Flag Discrepancy */}
          {user?.role === 'SCRUTINY_OFFICER' && (
            <button
              onClick={() => setShowFlagModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 text-amber-300 font-medium text-xs border border-amber-900/60 transition-colors"
            >
              <Flag className="w-3.5 h-3.5" />
              <span>Flag Discrepancy</span>
            </button>
          )}

          {/* Institution: Request Release */}
          {['ACTIVE', 'MATURED'].includes(fdr.status) &&
            user?.role === 'INSTITUTION' && (
              <button
                onClick={() => setShowReleaseModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-100 font-medium text-xs border border-zinc-700 transition-colors"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Request Release / Refund</span>
              </button>
            )}

          {/* Institution: Renew FDR */}
          {['ACTIVE', 'EXPIRING', 'MATURED'].includes(fdr.status) &&
            user?.role === 'INSTITUTION' && (
              <button
                onClick={() => {
                  setRenewForm({
                    ...renewForm,
                    bankName: fdr.bankName,
                    branch: fdr.branch,
                    amount: String(fdr.amount)
                  });
                  setShowRenewModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-200 font-medium text-xs border border-zinc-700 transition-colors"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Submit Renewal FDR</span>
              </button>
            )}
        </div>
      </div>

      {/* Main Grid: Details & Documents (Left) | AI Extraction & Audit Trail (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: FDR Metadata & Uploaded Files */}
        <div className="space-y-6">
          {/* Metadata Card */}
          <div className="p-5 rounded-lg bg-zinc-900/40 border border-zinc-800 space-y-4">
            <h2 className="text-sm font-semibold tracking-tight text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-zinc-400" />
              Deposit Terms & Parameters
            </h2>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-zinc-500 block mb-0.5">Issue Date</span>
                <span className="font-medium text-zinc-200">{formatDate(fdr.issueDate)}</span>
              </div>
              <div>
                <span className="text-zinc-500 block mb-0.5">Maturity Date</span>
                <span className="font-medium text-zinc-200">{formatDate(fdr.maturityDate)}</span>
              </div>
              <div>
                <span className="text-zinc-500 block mb-0.5">Lien in Favour of AICTE</span>
                <span className={`inline-flex items-center gap-1 font-semibold ${fdr.lienInFavourOfAicte ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {fdr.lienInFavourOfAicte ? <Check className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                  {fdr.lienInFavourOfAicte ? 'Confirmed / Marked' : 'Not Confirmed'}
                </span>
              </div>
              <div>
                <span className="text-zinc-500 block mb-0.5">Parent FDR Lineage</span>
                {fdr.parentFdrId ? (
                  <Link
                    to={`/fdrs/${fdr.parentFdrId}`}
                    className="inline-flex items-center gap-1 text-white hover:underline"
                  >
                    <Link2 className="w-3 h-3 text-zinc-400" />
                    <span>View Parent FDR</span>
                  </Link>
                ) : (
                  <span className="text-zinc-500">Original Principal Deposit</span>
                )}
              </div>
            </div>

            {/* Risk Reasons Callout */}
            {user?.role === 'INSTITUTION' && fdr.riskReasons && fdr.riskReasons.length > 0 && (
              <div className="pt-3 border-t border-zinc-800/80 space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Review Status Notice
                </span>
                <p className="text-xs text-zinc-300 bg-amber-950/30 border border-amber-900/40 p-2.5 rounded">
                  {fdr.riskReasons[0] || 'Discrepancy found, please resubmit or contact the Bureau.'}
                </p>
              </div>
            )}

            {user?.role !== 'INSTITUTION' && user?.role !== 'ADMIN' && fdr.riskReasons && fdr.riskReasons.length > 0 && (
              <div className="pt-3 border-t border-zinc-800/80 space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Flagged Risk Indicators ({fdr.riskReasons.length})
                </span>
                <ul className="space-y-1 text-xs text-zinc-300">
                  {fdr.riskReasons.map((reason, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <span className="text-amber-500 mt-1">•</span>
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Uploaded Documents Card */}
          <div className="p-5 rounded-lg bg-zinc-900/40 border border-zinc-800 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-tight text-white flex items-center gap-2">
                <Upload className="w-4 h-4 text-zinc-400" />
                Evidence & Scanned Receipts
              </h2>
              {user?.role !== 'ADMIN' && (
                <span className="text-[11px] text-zinc-500 font-mono">
                  {fdr.documents?.length || 0} File{fdr.documents?.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {/* Admin Document Restrictions Notice */}
            {user?.role === 'ADMIN' ? (
              <div className="p-4 rounded bg-zinc-950/60 border border-zinc-800 space-y-1 text-xs">
                <div className="flex items-center gap-2 text-zinc-200 font-medium">
                  <Lock className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Confidential Document Access Blocked (Separation of Duties)</span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  System administrators manage infrastructure, users, and cryptographic health. Direct access to confidential bank deposit certificates and lien documents is restricted to regulatory scrutiny officers and vigilance auditors.
                </p>
              </div>
            ) : (
              <>
                {/* Document Upload Form: Institution Only */}
                {user?.role === 'INSTITUTION' && (
                  <form onSubmit={handleUpload} className="p-3 rounded bg-zinc-900/80 border border-zinc-800 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div>
                        <label className="block text-[11px] text-zinc-400 mb-1">Document Classification</label>
                        <select
                          value={docType}
                          onChange={e => setDocType(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-700 text-zinc-200 text-xs focus:outline-none"
                        >
                          <option value="FDR_SCAN">FDR Scanned Certificate (PDF/PNG)</option>
                          <option value="BANK_CONFIRMATION_LETTER">Bank Confirmation Letter</option>
                          <option value="RENEWAL_ADVICE">Renewal Advice</option>
                          <option value="RELEASE_APPLICATION">Release Application</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] text-zinc-400 mb-1">Attach File (Max 5MB)</label>
                        <input
                          type="file"
                          accept=".pdf,.png,.jpg,.jpeg"
                          onChange={e => setUploadFile(e.target.files?.[0] || null)}
                          className="w-full text-xs text-zinc-400 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-[11px] file:font-semibold file:bg-zinc-800 file:text-zinc-200 hover:file:bg-zinc-700"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] text-zinc-500">Envelope encrypted with per-file AES-256-GCM data key</span>
                      <button
                        type="submit"
                        disabled={!uploadFile || uploading}
                        className="px-3 py-1.5 rounded bg-white hover:bg-zinc-200 text-black font-semibold text-xs disabled:opacity-50 transition-colors"
                      >
                        {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Upload & Encrypt'}
                      </button>
                    </div>
                  </form>
                )}

                {/* Document List */}
                {(!fdr.documents || fdr.documents.length === 0) ? (
                  <p className="text-xs text-zinc-500 italic py-3 text-center">No documents uploaded for this FDR yet.</p>
                ) : (
                  <div className="space-y-2">
                    {fdr.documents.map(doc => (
                      <div
                        key={doc.id || doc._id}
                        className="p-3 rounded bg-zinc-900/60 border border-zinc-800 flex items-center justify-between text-xs group"
                      >
                        <div className="space-y-0.5">
                          <div className="font-semibold text-zinc-200 flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-zinc-400" />
                            <span>{doc.originalName}</span>
                            <span className="text-[10px] font-mono px-1.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                              v{doc.version}
                            </span>
                          </div>
                          <div className="text-[11px] text-zinc-500">
                            {doc.type} • {(doc.sizeBytes / 1024).toFixed(1)} KB • {formatDate(doc.createdAt)}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <a
                            href={getFullApiUrl(`/fdrs/${id}/documents/${doc.id || doc._id}`)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
                            title="Download decrypted stream"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Download</span>
                          </a>

                          {(user?.role === 'SCRUTINY_OFFICER' || user?.role === 'INSTITUTION') && (
                            <button
                              onClick={() => handleExtract(doc.id || doc._id!)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 hover:text-white transition-colors"
                              title="Run Document AI Pipeline"
                            >
                              <Sparkles className="w-3.5 h-3.5 text-zinc-300" />
                              <span>Run AI OCR</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right Column: AI Extraction & Cryptographic Audit Trail */}
        <div className="space-y-6">
          {/* Document AI Extraction Results Card */}
          <div className="p-5 rounded-lg bg-zinc-900/40 border border-zinc-800 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-tight text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-zinc-300" />
                Document AI Extraction & Confidence
              </h2>
              {fdr.extractions && fdr.extractions.length > 0 && (
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
                  fdr.extractions[0].status === 'CONFIRMED'
                    ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                    : 'bg-amber-950/60 border-amber-800 text-amber-300'
                }`}>
                  {fdr.extractions[0].status === 'CONFIRMED' ? 'Human Confirmed' : 'AI Suggested (Unconfirmed)'}
                </span>
              )}
            </div>

            {(!fdr.extractions || fdr.extractions.length === 0) ? (
              <div className="p-6 text-center text-xs text-zinc-500 space-y-2">
                <Sparkles className="w-6 h-6 mx-auto text-zinc-600" />
                <p>No document AI extraction record available yet.</p>
                <p className="text-[11px] text-zinc-600">Upload an FDR scan and trigger "Run AI OCR" to extract structured values.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Extracted Fields Table */}
                <div className="rounded border border-zinc-800 overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-zinc-900 border-b border-zinc-800 text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">
                      <tr>
                        <th className="py-2 px-3">Field</th>
                        <th className="py-2 px-3">Extracted Value</th>
                        <th className="py-2 px-3 text-right">Confidence</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60 font-medium">
                      {fdr.extractions[0].fields?.map(field => {
                        const isLowConfidence = (field.confidence || 0) < 0.8;
                        return (
                          <tr key={field.name} className="hover:bg-zinc-900/40">
                            <td className="py-2.5 px-3 font-semibold text-zinc-300">
                              {field.name.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-zinc-100">
                              {String(field.value ?? '—')}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                                  isLowConfidence
                                    ? 'bg-amber-950 border border-amber-800 text-amber-300'
                                    : 'bg-zinc-800 text-zinc-200 border border-zinc-700'
                                }`}
                              >
                                {((field.confidence || 0) * 100).toFixed(0)}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Human Confirmation Button */}
                {fdr.extractions[0].status === 'UNCONFIRMED' && user?.role === 'SCRUTINY_OFFICER' && (
                  <div className="p-3 rounded bg-zinc-900/60 border border-zinc-800 flex items-center justify-between">
                    <span className="text-xs text-zinc-400">Review above fields before verifying record:</span>
                    <button
                      onClick={() => confirmExtractionMutation.mutate(fdr.extractions![0]._id || fdr.extractions![0].id!)}
                      disabled={confirmExtractionMutation.isPending}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white hover:bg-zinc-200 text-black font-semibold text-xs transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Confirm Extracted Values</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Cryptographic Hash Chain Audit Trail Card */}
          <div className="p-5 rounded-lg bg-zinc-900/40 border border-zinc-800 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-tight text-white flex items-center gap-2">
                <History className="w-4 h-4 text-zinc-400" />
                Immutable Audit Trail (SHA-256 Hash Chain)
              </h2>
              <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                Append-Only Verified
              </span>
            </div>

            {(!fdr.auditLogs || fdr.auditLogs.length === 0) ? (
              <p className="text-xs text-zinc-500 italic py-3 text-center">No audit trail entries recorded yet.</p>
            ) : (
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {fdr.auditLogs.map((log, index) => (
                  <div
                    key={log.seq || index}
                    className="p-3 rounded bg-zinc-900/60 border border-zinc-800 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                          #{log.seq}
                        </span>
                        <span className="font-semibold text-zinc-100">{log.action}</span>
                      </div>
                      <span className="text-[11px] text-zinc-500">{formatDate(log.createdAt)}</span>
                    </div>

                    <div className="text-[11px] text-zinc-400">
                      Actor: <strong className="text-zinc-300 font-mono">{log.actorRole}</strong> ({log.actorId})
                    </div>

                    <div className="pt-1 border-t border-zinc-800 font-mono text-[10px] text-zinc-500 break-all space-y-0.5">
                      <div>Prev Hash: {log.prevHash?.slice(0, 16)}...</div>
                      <div className="text-zinc-400">Curr Hash: {log.hash?.slice(0, 16)}...</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Flag Discrepancy Modal */}
      {showFlagModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-5 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-2 text-amber-400">
              <Flag className="w-5 h-5" />
              <h3 className="font-semibold text-sm text-white">Flag Discrepancy on Deposit</h3>
            </div>
            <p className="text-xs text-zinc-400">
              Record a formal scrutiny discrepancy. This increases the risk score by 25 points and updates the audit log.
            </p>
            <textarea
              rows={3}
              value={flagReason}
              onChange={e => setFlagReason(e.target.value)}
              placeholder="Specify discrepancy details (e.g., mismatch in branch code or missing AICTE lien stamp)..."
              className="w-full px-3 py-2 rounded bg-zinc-900 border border-zinc-700 text-xs text-white focus:outline-none focus:border-zinc-400"
            />
            <div className="flex justify-end gap-2 text-xs">
              <button
                onClick={() => setShowFlagModal(false)}
                className="px-3 py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-medium border border-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={handleFlagSubmit}
                disabled={!flagReason.trim()}
                className="px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-black font-semibold disabled:opacity-50"
              >
                Submit Flag
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Request Release Modal */}
      {showReleaseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-5 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-2 text-white">
              <Lock className="w-5 h-5" />
              <h3 className="font-semibold text-sm">Initiate Security Deposit Release</h3>
            </div>
            <p className="text-xs text-zinc-400">
              Submit formal justification to AICTE Regulation Bureau for FDR release and refund approval.
            </p>
            <textarea
              rows={3}
              value={releaseReason}
              onChange={e => setReleaseReason(e.target.value)}
              placeholder="State justification (e.g. 10-year regulatory tenure completed without compliance breaches)..."
              className="w-full px-3 py-2 rounded bg-zinc-900 border border-zinc-700 text-xs text-white focus:outline-none focus:border-zinc-400"
            />
            <div className="flex justify-end gap-2 text-xs">
              <button
                onClick={() => setShowReleaseModal(false)}
                className="px-3 py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-medium border border-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={handleReleaseSubmit}
                disabled={!releaseReason.trim()}
                className="px-3 py-1.5 rounded bg-white hover:bg-zinc-200 text-black font-semibold disabled:opacity-50"
              >
                Submit Release Request
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Renewal Modal */}
      {showRenewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-5 max-w-lg w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-2 text-white">
              <RotateCw className="w-5 h-5" />
              <h3 className="font-semibold text-sm">Register Renewal Child FDR</h3>
            </div>
            <p className="text-xs text-zinc-400">
              Creates a replacement deposit linked to parent FDR ••••{fdr.last4}. The parent FDR will automatically transition to RENEWED.
            </p>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="col-span-2">
                <label className="block text-zinc-400 mb-1">New FDR Number</label>
                <input
                  type="text"
                  value={renewForm.fdrNumber}
                  onChange={e => setRenewForm({ ...renewForm, fdrNumber: e.target.value })}
                  placeholder="e.g., FDR-2026-RNW-9901"
                  className="w-full px-3 py-2 rounded bg-zinc-900 border border-zinc-700 text-white font-mono focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-zinc-400 mb-1">Bank Name</label>
                <input
                  type="text"
                  value={renewForm.bankName}
                  onChange={e => setRenewForm({ ...renewForm, bankName: e.target.value })}
                  className="w-full px-3 py-2 rounded bg-zinc-900 border border-zinc-700 text-white focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-zinc-400 mb-1">Branch</label>
                <input
                  type="text"
                  value={renewForm.branch}
                  onChange={e => setRenewForm({ ...renewForm, branch: e.target.value })}
                  className="w-full px-3 py-2 rounded bg-zinc-900 border border-zinc-700 text-white focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-zinc-400 mb-1">Deposit Amount (₹)</label>
                <input
                  type="number"
                  value={renewForm.amount}
                  onChange={e => setRenewForm({ ...renewForm, amount: e.target.value })}
                  className="w-full px-3 py-2 rounded bg-zinc-900 border border-zinc-700 text-white font-mono focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-zinc-400 mb-1">New Maturity Date</label>
                <input
                  type="date"
                  value={renewForm.maturityDate}
                  onChange={e => setRenewForm({ ...renewForm, maturityDate: e.target.value })}
                  className="w-full px-3 py-2 rounded bg-zinc-900 border border-zinc-700 text-white focus:outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 text-xs pt-2">
              <button
                onClick={() => setShowRenewModal(false)}
                className="px-3 py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-medium border border-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={handleRenewSubmit}
                disabled={!renewForm.fdrNumber.trim()}
                className="px-3 py-1.5 rounded bg-white hover:bg-zinc-200 text-black font-semibold disabled:opacity-50"
              >
                Confirm Renewal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bank Verification Outcome Modal */}
      {bankVerificationModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-2">
              {bankVerificationModal.status === 'VERIFIED' ? (
                <CheckCircle className="w-6 h-6 text-emerald-400" />
              ) : (
                <ShieldAlert className="w-6 h-6 text-amber-400" />
              )}
              <h3 className="font-semibold text-base text-white">Bank Verification Outcome</h3>
            </div>

            <div className="p-3 rounded bg-zinc-900/80 border border-zinc-800 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-400">Adapter Status:</span>
                <span className={`font-mono font-bold ${bankVerificationModal.status === 'VERIFIED' ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {bankVerificationModal.status}
                </span>
              </div>
              {bankVerificationModal.reference && (
                <div className="flex justify-between">
                  <span className="text-zinc-400">Bank Reference Code:</span>
                  <span className="font-mono text-zinc-200">{bankVerificationModal.reference}</span>
                </div>
              )}
              {bankVerificationModal.notes && (
                <div className="pt-2 border-t border-zinc-800 text-zinc-300">
                  <span className="text-zinc-500 block mb-0.5">Notes:</span>
                  <span>{bankVerificationModal.notes}</span>
                </div>
              )}
            </div>

            <p className="text-[11px] text-zinc-500">
              The verification outcome and provider reference have been immutably hashed into the audit trail.
            </p>

            <button
              onClick={() => setBankVerificationModal({ open: false })}
              className="w-full py-2 rounded bg-white hover:bg-zinc-200 text-black font-semibold text-xs transition-colors"
            >
              Acknowledge & Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
