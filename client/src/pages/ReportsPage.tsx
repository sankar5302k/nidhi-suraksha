import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../api/client.js';
import { FdrRecord } from '../types.js';
import { StatusBadge, VerificationBadge, RiskScoreBadge } from '../components/StatusBadge.js';
import {
  BarChart3,
  Download,
  FileSpreadsheet,
  ShieldCheck,
  AlertTriangle,
  Clock,
  Filter,
  Loader2,
  Calendar
} from 'lucide-react';

export const ReportsPage: React.FC = () => {
  const [category, setCategory] = useState<'EXPIRING' | 'DISCREPANCY' | 'ALL'>('EXPIRING');
  const [downloading, setDownloading] = useState(false);

  const { data, isLoading } = useQuery<{ data: FdrRecord[] }>({
    queryKey: ['fdrs'],
    queryFn: () => apiRequest<{ data: FdrRecord[] }>('/fdrs')
  });

  const fdrs = data?.data || [];

  // Categorize
  const expiringFdrs = fdrs.filter(f => {
    if (!['ACTIVE', 'EXPIRING'].includes(f.status)) return false;
    const diff = new Date(f.maturityDate).getTime() - new Date().getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days <= 90;
  });

  const discrepancyFdrs = fdrs.filter(
    f => f.verificationStatus === 'DISCREPANCY_FLAGGED' || f.verificationStatus === 'VERIFICATION_FAILED' || (f.riskScore >= 60)
  );

  const displayedList =
    category === 'EXPIRING' ? expiringFdrs : category === 'DISCREPANCY' ? discrepancyFdrs : fdrs;

  const handleDownloadCsv = async () => {
    setDownloading(true);
    try {
      const response = await fetch('/reports/export-csv', {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fdr_report_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      alert('Failed to download CSV: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setDownloading(false);
    }
  };

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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-zinc-800">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-white" />
            Compliance Reports & Data Exports
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Aggregated institutional deposit telemetry, audit filters, and secure CSV downloads.
          </p>
        </div>

        <button
          onClick={handleDownloadCsv}
          disabled={downloading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded bg-white hover:bg-zinc-200 text-black font-semibold text-xs transition-colors shadow-sm shrink-0"
        >
          {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4 text-black" />}
          <span>Download Official CSV Report</span>
        </button>
      </div>

      {/* Security Callout for CSV Formula Injection */}
      <div className="p-3.5 rounded-lg bg-zinc-900/60 border border-zinc-800 text-xs flex items-start gap-2.5">
        <ShieldCheck className="w-4 h-4 text-zinc-300 mt-0.5 shrink-0" />
        <div className="space-y-0.5 text-zinc-400 text-[11px] leading-relaxed">
          <span className="font-semibold text-zinc-200">Security Control — Formula Injection Mitigation:</span>
          <p>
            All cell values exported in CSV files are dynamically sanitized. Any user-controlled strings beginning with characters (<code className="text-zinc-200 font-mono">=</code>, <code className="text-zinc-200 font-mono">+</code>, <code className="text-zinc-200 font-mono">-</code>, <code className="text-zinc-200 font-mono">@</code>) are automatically prepended with a single quote to prevent spreadsheet code execution.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div
          onClick={() => setCategory('EXPIRING')}
          className={`p-4 rounded-lg border cursor-pointer transition-all ${
            category === 'EXPIRING'
              ? 'bg-zinc-900 border-zinc-600 shadow-md'
              : 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
            <span>Expiring within 90 Days</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white">{expiringFdrs.length}</div>
          <span className="text-[10px] text-zinc-500">Requires institutional renewal notice</span>
        </div>

        <div
          onClick={() => setCategory('DISCREPANCY')}
          className={`p-4 rounded-lg border cursor-pointer transition-all ${
            category === 'DISCREPANCY'
              ? 'bg-zinc-900 border-zinc-600 shadow-md'
              : 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
            <span>Flagged Discrepancies</span>
            <AlertTriangle className="w-4 h-4 text-red-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white">{discrepancyFdrs.length}</div>
          <span className="text-[10px] text-zinc-500">Bank mismatch or officer flag</span>
        </div>

        <div
          onClick={() => setCategory('ALL')}
          className={`p-4 rounded-lg border cursor-pointer transition-all ${
            category === 'ALL'
              ? 'bg-zinc-900 border-zinc-600 shadow-md'
              : 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
            <span>Total Tracked Deposits</span>
            <FileSpreadsheet className="w-4 h-4 text-zinc-300" />
          </div>
          <div className="text-2xl font-bold font-mono text-white">{fdrs.length}</div>
          <span className="text-[10px] text-zinc-500">All registered institutional records</span>
        </div>
      </div>

      {/* Table Section */}
      <div className="rounded-lg bg-zinc-900/40 border border-zinc-800 overflow-hidden">
        <div className="p-3 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between text-xs">
          <span className="font-semibold text-white">
            {category === 'EXPIRING'
              ? 'Expiring Deposits Ledger (≤ 90 Days)'
              : category === 'DISCREPANCY'
              ? 'Flagged Discrepancy & High Risk Deposits'
              : 'Full Portfolio Ledger'}
          </span>
          <span className="text-[11px] text-zinc-400 font-mono">{displayedList.length} Records</span>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-xs text-zinc-500">
            <Loader2 className="w-5 h-5 mx-auto animate-spin mb-2" />
            Loading report records...
          </div>
        ) : displayedList.length === 0 ? (
          <div className="p-8 text-center text-xs text-zinc-500">No records found in this category.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-950 border-b border-zinc-800 text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">
                <tr>
                  <th className="py-2.5 px-4">Reference</th>
                  <th className="py-2.5 px-4">Bank</th>
                  <th className="py-2.5 px-4">Principal Amount</th>
                  <th className="py-2.5 px-4">Maturity Date</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Verification</th>
                  <th className="py-2.5 px-4">Risk Rating</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 font-medium">
                {displayedList.map(fdr => (
                  <tr key={fdr._id} className="hover:bg-zinc-900/40 transition-colors">
                    <td className="py-3 px-4 font-mono font-medium text-white">••••{fdr.last4}</td>
                    <td className="py-3 px-4 text-zinc-300">{fdr.bankName}</td>
                    <td className="py-3 px-4 font-mono text-zinc-100">{formatCurrency(fdr.amount)}</td>
                    <td className="py-3 px-4 text-zinc-300">{formatDate(fdr.maturityDate)}</td>
                    <td className="py-3 px-4">
                      <StatusBadge status={fdr.status} />
                    </td>
                    <td className="py-3 px-4">
                      <VerificationBadge status={fdr.verificationStatus} />
                    </td>
                    <td className="py-3 px-4">
                      <RiskScoreBadge score={fdr.riskScore} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
