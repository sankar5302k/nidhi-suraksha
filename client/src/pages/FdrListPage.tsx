import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { FdrRecord } from '../types.js';
import { useAuth } from '../context/AuthContext.js';
import { StatusBadge, VerificationBadge, RiskScoreBadge } from '../components/StatusBadge.js';
import {
  FileSpreadsheet,
  Search,
  Filter,
  PlusCircle,
  Eye,
  ShieldAlert,
  ArrowUpDown,
  RefreshCw,
  Calendar,
  Building2
} from 'lucide-react';

export const FdrListPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedVerification, setSelectedVerification] = useState<string>('ALL');
  const [selectedRisk, setSelectedRisk] = useState<string>('ALL');

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<{ data: FdrRecord[] }>({
    queryKey: ['fdrs'],
    queryFn: () => apiRequest<{ data: FdrRecord[] }>('/fdrs'),
    refetchOnWindowFocus: false
  });

  const fdrs = data?.data || [];

  // Filter logic
  const filteredFdrs = fdrs.filter(fdr => {
    // Search match
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchesLast4 = fdr.last4?.toLowerCase().includes(q);
      const matchesBank = fdr.bankName?.toLowerCase().includes(q);
      const matchesBranch = fdr.branch?.toLowerCase().includes(q);
      if (!matchesLast4 && !matchesBank && !matchesBranch) return false;
    }

    // Status filter
    if (selectedStatus !== 'ALL' && fdr.status !== selectedStatus) {
      return false;
    }

    // Verification filter
    if (selectedVerification !== 'ALL' && fdr.verificationStatus !== selectedVerification) {
      return false;
    }

    // Risk score filter
    if (selectedRisk === 'LOW' && (fdr.riskScore >= 30)) return false;
    if (selectedRisk === 'MEDIUM' && (fdr.riskScore < 30 || fdr.riskScore >= 60)) return false;
    if (selectedRisk === 'HIGH' && (fdr.riskScore < 60)) return false;

    return true;
  });

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

  const getDaysUntil = (maturityDateStr?: string) => {
    if (!maturityDateStr) return null;
    const diff = new Date(maturityDateStr).getTime() - new Date().getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-zinc-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-white">Security Deposit Records</h1>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
              {filteredFdrs.length} of {fdrs.length} Records
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Centrally indexed fixed deposits and institutional guarantees held under AICTE Bureau of Regulation
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white transition-colors"
            title="Refresh records"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>

          {user?.role === 'INSTITUTION' && (
            <Link
              to="/fdrs/new"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded bg-white hover:bg-zinc-200 text-black text-xs font-semibold transition-colors shadow-sm"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Register New FDR</span>
            </Link>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search by last 4 digits or bank..."
              className="w-full pl-9 pr-3 py-2 rounded bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-400"
            />
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              className="w-full px-3 py-2 rounded bg-zinc-900 border border-zinc-700 text-zinc-200 focus:outline-none focus:border-zinc-400"
            >
              <option value="ALL">All Lifecycle Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="UNDER_SCRUTINY">Under Scrutiny</option>
              <option value="ACTIVE">Active</option>
              <option value="EXPIRING">Expiring Soon (≤90d)</option>
              <option value="MATURED">Matured</option>
              <option value="RENEWED">Renewed</option>
              <option value="RELEASE_REQUESTED">Release Requested</option>
              <option value="RELEASED">Released</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>

          {/* Verification Status Filter */}
          <div>
            <select
              value={selectedVerification}
              onChange={e => setSelectedVerification(e.target.value)}
              className="w-full px-3 py-2 rounded bg-zinc-900 border border-zinc-700 text-zinc-200 focus:outline-none focus:border-zinc-400"
            >
              <option value="ALL">All Verification States</option>
              <option value="SUBMITTED_UNVERIFIED">Submitted (Unverified)</option>
              <option value="BANK_VERIFIED">Bank Verified</option>
              <option value="DISCREPANCY_FLAGGED">Discrepancy Flagged</option>
              <option value="VERIFICATION_FAILED">Verification Failed</option>
            </select>
          </div>

          {/* Risk Level Filter */}
          <div>
            <select
              value={selectedRisk}
              onChange={e => setSelectedRisk(e.target.value)}
              className="w-full px-3 py-2 rounded bg-zinc-900 border border-zinc-700 text-zinc-200 focus:outline-none focus:border-zinc-400"
            >
              <option value="ALL">All Risk Levels</option>
              <option value="LOW">Low Risk (&lt; 30)</option>
              <option value="MEDIUM">Medium Risk (30 - 59)</option>
              <option value="HIGH">High Risk (≥ 60)</option>
            </select>
          </div>
        </div>

        {(searchTerm || selectedStatus !== 'ALL' || selectedVerification !== 'ALL' || selectedRisk !== 'ALL') && (
          <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1 border-t border-zinc-800">
            <span>Filtering applied to ledger</span>
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedStatus('ALL');
                setSelectedVerification('ALL');
                setSelectedRisk('ALL');
              }}
              className="text-zinc-300 hover:text-white underline underline-offset-2"
            >
              Reset filters
            </button>
          </div>
        )}
      </div>

      {/* Main Table */}
      <div className="rounded-lg bg-zinc-900/40 border border-zinc-800 overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-xs text-zinc-400 space-y-2">
            <RefreshCw className="w-5 h-5 mx-auto animate-spin text-zinc-500" />
            <p>Loading deposits from encrypted repository...</p>
          </div>
        ) : isError ? (
          <div className="p-8 text-center text-xs text-red-400 space-y-2">
            <ShieldAlert className="w-6 h-6 mx-auto text-red-500" />
            <p>Failed to load FDR records: {error instanceof Error ? error.message : 'Unknown error'}</p>
          </div>
        ) : filteredFdrs.length === 0 ? (
          <div className="p-12 text-center text-xs text-zinc-400 space-y-3">
            <FileSpreadsheet className="w-8 h-8 mx-auto text-zinc-600" />
            <p className="font-medium text-zinc-300">No deposit records match your filter criteria.</p>
            {(user?.role === 'INSTITUTION' || user?.role === 'ADMIN') && (
              <Link
                to="/fdrs/new"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-xs transition-colors"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                Register New FDR
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-900 border-b border-zinc-800 text-[11px] uppercase tracking-wider text-zinc-400 font-semibold">
                <tr>
                  <th className="py-3 px-4">FDR Reference</th>
                  <th className="py-3 px-4">Bank & Branch</th>
                  <th className="py-3 px-4">Deposit Amount</th>
                  <th className="py-3 px-4">Maturity Date</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Verification</th>
                  <th className="py-3 px-4">Risk Score</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 font-medium">
                {filteredFdrs.map(fdr => {
                  const days = getDaysUntil(fdr.maturityDate);
                  return (
                    <tr
                      key={fdr._id}
                      className="hover:bg-zinc-900/50 transition-colors group"
                    >
                      {/* FDR Number Masked */}
                      <td className="py-3.5 px-4 font-mono font-medium text-white whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span>••••{fdr.last4}</span>
                          {fdr.parentFdrId && (
                            <span className="text-[10px] px-1 rounded bg-zinc-800 text-zinc-400 border border-zinc-700" title="Renewed Child FDR">
                              Renewal
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Bank & Branch */}
                      <td className="py-3.5 px-4 text-zinc-300 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                          <div>
                            <div className="font-semibold text-zinc-100">{fdr.bankName}</div>
                            <div className="text-[11px] text-zinc-400">{fdr.branch}</div>
                          </div>
                        </div>
                      </td>

                      {/* Deposit Amount */}
                      <td className="py-3.5 px-4 font-mono font-semibold text-white whitespace-nowrap">
                        {formatCurrency(fdr.amount)}
                      </td>

                      {/* Maturity Date */}
                      <td className="py-3.5 px-4 text-zinc-300 whitespace-nowrap">
                        <div>
                          <div>{formatDate(fdr.maturityDate)}</div>
                          {days !== null && (
                            <div className={`text-[10px] font-mono ${days <= 30 ? 'text-amber-400' : days <= 90 ? 'text-yellow-400' : 'text-zinc-500'}`}>
                              {days <= 0 ? 'Matured' : `${days} days remaining`}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Lifecycle Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <StatusBadge status={fdr.status} />
                      </td>

                      {/* Verification Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <VerificationBadge status={fdr.verificationStatus} />
                      </td>

                      {/* Risk Score */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <RiskScoreBadge score={fdr.riskScore} />
                          {fdr.riskReasons && fdr.riskReasons.length > 0 && (
                            <span
                              className="text-[10px] text-zinc-400 cursor-help"
                              title={fdr.riskReasons.join('; ')}
                            >
                              ({fdr.riskReasons.length} issue{fdr.riskReasons.length > 1 ? 's' : ''})
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => navigate(`/fdrs/${fdr._id}`)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white font-medium text-xs transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Inspect</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
