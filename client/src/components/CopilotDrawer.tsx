import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { apiRequest } from '../api/client.js';
import { StatusBadge, RiskScoreBadge } from './StatusBadge.js';
import { FdrRecord } from '../types.js';
import {
  Sparkles,
  X,
  Search,
  FileText,
  Copy,
  Check,
  ArrowRight,
  ShieldAlert,
  Loader2,
  HelpCircle,
  Building2
} from 'lucide-react';

interface CopilotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeFdrId?: string;
}

interface CopilotQueryResult {
  summary: string;
  count: number;
  results: FdrRecord[];
  filterApplied?: Record<string, unknown>;
}

export const CopilotDrawer: React.FC<CopilotDrawerProps> = ({
  isOpen,
  onClose,
  activeFdrId
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canDraftNotice = user?.role === 'SCRUTINY_OFFICER' || user?.role === 'APPROVING_AUTHORITY';
  const isInstitution = user?.role === 'INSTITUTION';

  const [activeTab, setActiveTab] = useState<'QUERY' | 'NOTICE'>('QUERY');
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [queryResponse, setQueryResponse] = useState<CopilotQueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // If user cannot draft notices, ensure tab remains QUERY
  useEffect(() => {
    if (!canDraftNotice && activeTab === 'NOTICE') {
      setActiveTab('QUERY');
    }
  }, [canDraftNotice, activeTab]);

  // Notice drafting state
  const [noticeFdrId, setNoticeFdrId] = useState(activeFdrId || '');
  const [draftedNotice, setDraftedNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleQuery = async (queryText?: string) => {
    const q = queryText || question;
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ data: CopilotQueryResult }>('/copilot/query', {
        method: 'POST',
        body: JSON.stringify({ question: q })
      });
      setQueryResponse(res.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Query failed to process.');
    } finally {
      setLoading(false);
    }
  };

  const handleDraftNotice = async () => {
    if (!noticeFdrId.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ data: { fdrId: string; noticeText: string } }>(
        `/copilot/draft-notice/${noticeFdrId.trim()}`,
        { method: 'POST' }
      );
      setDraftedNotice(res.data.noticeText);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to draft notice.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyNotice = () => {
    if (!draftedNotice) return;
    navigator.clipboard.writeText(draftedNotice);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sampleQueries = isInstitution
    ? [
        'My deposits expiring in 90 days',
        'My active deposits over 15 lakh rupees',
        'My submitted deposits pending scrutiny'
      ]
    : [
        'SBI deposits expiring in 90 days',
        'High risk deposits flagged with discrepancies',
        'Active deposits over 15 lakh rupees',
        'Deposits submitted awaiting scrutiny'
      ];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Dimmed backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-zinc-950 border-l border-zinc-800 text-zinc-100 flex flex-col shadow-2xl">
          {/* Header */}
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="text-sm font-semibold tracking-tight text-white">
                  {isInstitution ? 'Institution Copilot' : 'Copilot Assistant'}
                </h2>
                <p className="text-[11px] text-zinc-400">
                  {isInstitution
                    ? 'Natural language query for your registered deposits'
                    : canDraftNotice
                    ? 'Governance Query & Regulatory Notice Drafting'
                    : 'Statutory Vigilance & Portfolio Query'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tab Selector - Only visible if user has notice drafting privilege */}
          {canDraftNotice ? (
            <div className="flex border-b border-zinc-800 bg-zinc-900/30 text-xs">
              <button
                onClick={() => setActiveTab('QUERY')}
                className={`flex-1 py-2.5 font-medium flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                  activeTab === 'QUERY'
                    ? 'border-white text-white bg-zinc-900/50'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Search className="w-3.5 h-3.5" />
                Natural Language Query
              </button>
              <button
                onClick={() => {
                  setActiveTab('NOTICE');
                  if (activeFdrId && !noticeFdrId) setNoticeFdrId(activeFdrId);
                }}
                className={`flex-1 py-2.5 font-medium flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                  activeTab === 'NOTICE'
                    ? 'border-white text-white bg-zinc-900/50'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                Draft Deficiency Notice
              </button>
            </div>
          ) : (
            isInstitution && (
              <div className="px-4 py-2 border-b border-zinc-800/80 bg-zinc-900/40 text-[11px] text-zinc-400 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                <span>Queries strictly scoped to your institution's FDR portfolio</span>
              </div>
            )
          )}

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {error && (
              <div className="p-3 rounded bg-red-950/40 border border-red-800 text-red-200 text-xs flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0 text-red-400" />
                <span>{error}</span>
              </div>
            )}

            {activeTab === 'QUERY' && (
              <div className="space-y-4">
                {/* Search Bar */}
                <div className="space-y-2">
                  <div className="relative">
                    <input
                      type="text"
                      value={question}
                      onChange={e => setQuestion(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleQuery()}
                      placeholder="Ask in plain language (e.g., expiring SBI deposits)..."
                      className="w-full pl-9 pr-20 py-2 rounded bg-zinc-900 border border-zinc-700 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-400"
                    />
                    <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
                    <button
                      onClick={() => handleQuery()}
                      disabled={loading || !question.trim()}
                      className="absolute right-1.5 top-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-[11px] font-medium text-white transition-colors"
                    >
                      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Run'}
                    </button>
                  </div>

                  {/* Sample Query Chips */}
                  <div className="space-y-1.5">
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Suggested queries:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {sampleQueries.map(sq => (
                        <button
                          key={sq}
                          onClick={() => {
                            setQuestion(sq);
                            handleQuery(sq);
                          }}
                          className="px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-300 transition-colors text-left"
                        >
                          {sq}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Scope Notice */}
                <div className="p-2.5 rounded bg-zinc-900/50 border border-zinc-800/80 text-[11px] text-zinc-400 flex items-start gap-2">
                  <HelpCircle className="w-3.5 h-3.5 mt-0.5 text-zinc-500 shrink-0" />
                  <span>
                    Queries are translated to strict Mongo filters and scoped to your authorized institution context (IDOR-safe).
                  </span>
                </div>

                {/* Results Section */}
                {queryResponse && (
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between text-xs border-b border-zinc-800 pb-2">
                      <span className="font-medium text-zinc-300">
                        Found <strong className="text-white">{queryResponse.count}</strong> matching record{queryResponse.count !== 1 ? 's' : ''}
                      </span>
                      <span className="text-[11px] text-zinc-500">{queryResponse.summary}</span>
                    </div>

                    {queryResponse.results.length === 0 ? (
                      <p className="text-xs text-zinc-500 italic py-4 text-center">No matching deposits found within your scope.</p>
                    ) : (
                      <div className="space-y-2">
                        {queryResponse.results.map(fdr => (
                          <div
                            key={fdr._id}
                            onClick={() => {
                              navigate(`/fdrs/${fdr._id}`);
                              onClose();
                            }}
                            className="p-3 rounded bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 cursor-pointer transition-all space-y-1.5 group"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-xs font-semibold text-white">••••{fdr.last4}</span>
                              <RiskScoreBadge score={fdr.riskScore} />
                            </div>
                            <div className="flex items-center justify-between text-xs text-zinc-400">
                              <span>{fdr.bankName}</span>
                              <span className="font-medium text-zinc-200">₹{(fdr.amount || 0).toLocaleString('en-IN')}</span>
                            </div>
                            <div className="flex items-center justify-between pt-1">
                              <StatusBadge status={fdr.status} />
                              <span className="text-[11px] text-zinc-400 flex items-center gap-1 group-hover:text-white transition-colors">
                                View <ArrowRight className="w-3 h-3" />
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'NOTICE' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-zinc-300">Target FDR ID / Reference</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={noticeFdrId}
                      onChange={e => setNoticeFdrId(e.target.value)}
                      placeholder="Paste FDR record ID (e.g., 67ba...)"
                      className="flex-1 px-3 py-2 rounded bg-zinc-900 border border-zinc-700 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-400 font-mono"
                    />
                    <button
                      onClick={handleDraftNotice}
                      disabled={loading || !noticeFdrId.trim()}
                      className="px-3 py-2 rounded bg-white hover:bg-zinc-200 text-black font-semibold text-xs disabled:opacity-50 transition-colors shrink-0"
                    >
                      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Draft Notice'}
                    </button>
                  </div>
                </div>

                {draftedNotice && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-zinc-300">Official Notice Draft (Plain Text)</span>
                      <button
                        onClick={handleCopyNotice}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 transition-colors"
                      >
                        {copied ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-zinc-400" />
                            <span>Copy Letter</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="p-3 rounded bg-zinc-900/90 border border-zinc-800 text-[11px] font-mono leading-relaxed text-zinc-200 whitespace-pre-wrap max-h-96 overflow-y-auto selection:bg-neutral-700">
                      {draftedNotice}
                    </div>

                    <div className="p-2 rounded bg-zinc-900/40 border border-zinc-800/80 text-[10px] text-zinc-400 leading-normal">
                      <strong>Governance Protocol:</strong> Notices are drafted from verified database facts with potential prompt injections sanitized. The letter must be reviewed by an authorized officer prior to dispatch.
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
