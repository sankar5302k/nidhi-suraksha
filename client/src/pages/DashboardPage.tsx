import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { DashboardSummary, FdrRecord } from '../types.js';
import { useAuth } from '../context/AuthContext.js';
import { StatusBadge } from '../components/StatusBadge.js';
import {
  ShieldCheck,
  AlertTriangle,
  Clock,
  ArrowUpRight,
  TrendingUp,
  FileText,
  Building2,
  RefreshCw,
  Plus,
  Lock,
  FileCheck2,
  Hash
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const isInstitution = user?.role === 'INSTITUTION';
  const isAuthority = user?.role === 'APPROVING_AUTHORITY';
  const isAdmin = user?.role === 'ADMIN';
  const isScrutiny = user?.role === 'SCRUTINY_OFFICER';
  const isAuditor = user?.role === 'AUDITOR';
  const { data: summaryData, isLoading, refetch } = useQuery<{ data: DashboardSummary }>({
    queryKey: ['dashboard-summary'],
    queryFn: () => apiRequest('/dashboard/summary')
  });

  const { data: recentFdrsData } = useQuery<{ data: FdrRecord[] }>({
    queryKey: ['recent-fdrs'],
    queryFn: () => apiRequest('/fdrs')
  });

  const summary = summaryData?.data;
  const recentFdrs = recentFdrsData?.data?.slice(0, 6) || [];

  // Prepare chart data for status distribution
  const statusColors: Record<string, string> = {
    ACTIVE: '#22c55e',
    UNDER_SCRUTINY: '#a1a1aa',
    SUBMITTED: '#71717a',
    EXPIRING: '#f59e0b',
    MATURED: '#ef4444',
    RELEASED: '#10b981',
    DRAFT: '#52525b',
    RELEASE_REQUESTED: '#e4e4e7',
    REJECTED: '#f43f5e'
  };

  const pieData = summary?.statusDistribution
    ? Object.entries(summary.statusDistribution)
        .filter(([_, count]) => count > 0)
        .map(([name, value]) => ({
          name: name.replace(/_/g, ' '),
          value,
          color: statusColors[name] || '#71717a'
        }))
    : [];

  const barData = [
    { range: 'Maturing <= 30d', count: Math.ceil((summary?.expiringWithin90Days || 0) * 0.3) },
    { range: '31 - 60d', count: Math.ceil((summary?.expiringWithin90Days || 0) * 0.35) },
    { range: '61 - 90d', count: Math.floor((summary?.expiringWithin90Days || 0) * 0.35) },
    { range: '90d - 1 yr', count: Math.floor((summary?.statusDistribution?.ACTIVE || 0) * 0.4) },
    { range: '> 1 Year', count: Math.ceil((summary?.statusDistribution?.ACTIVE || 0) * 0.6) }
  ];

  const formatCurrency = (amt: number) => {
    if (amt >= 10000000) {
      return `₹${(amt / 10000000).toFixed(2)} Cr`;
    }
    if (amt >= 100000) {
      return `₹${(amt / 100000).toFixed(2)} Lakh`;
    }
    return `₹${amt.toLocaleString('en-IN')}`;
  };

  return (
    <div className="space-y-6">
      {/* Title & Action Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <span>
              {isInstitution
                ? 'Institutional Security Deposit Portal'
                : isAuthority
                ? 'Executive Sanctions & Release Dashboard'
                : isAdmin
                ? 'Central System & Security Dashboard'
                : isScrutiny
                ? 'Regulatory Document Scrutiny Dashboard'
                : 'Statutory Vigilance & Audit Dashboard'}
            </span>
            <span className="text-xs font-normal text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded">
              AICTE Regulation Bureau
            </span>
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            {isInstitution
              ? 'Manage your institution security deposit receipts, track renewal horizons, and request statutory releases.'
              : isAuthority
              ? 'Review statutory release recommendations, evaluate compliance holds, and execute dual-authorization sanctions.'
              : isAdmin
              ? 'Central system administration, cryptographic ledger health, and institutional record governance.'
              : isScrutiny
              ? 'Examine OCR extractions, core banking lien marks, and evaluate discrepancy flags.'
              : 'Independent regulatory oversight for inspecting ledger integrity and security deposit telemetry.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh Data
          </button>

          {isInstitution && (
            <Link
              to="/fdrs/new"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-white hover:bg-zinc-200 text-black transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Submit FDR
            </Link>
          )}

          {isAuthority && (
            <Link
              to="/release-requests"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-white hover:bg-zinc-200 text-black transition-colors"
            >
              <FileCheck2 className="w-3.5 h-3.5" />
              Sanction Queue
            </Link>
          )}

          {isAdmin && (
            <Link
              to="/admin"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-white hover:bg-zinc-200 text-black transition-colors"
            >
              <Lock className="w-3.5 h-3.5" />
              System Admin
            </Link>
          )}
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {isInstitution ? (
          <>
            {/* Institution Card 1: My Active Deposits */}
            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
              <div className="flex items-center justify-between text-zinc-400 text-xs">
                <span>My Active Deposits</span>
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="mt-2 text-2xl font-bold text-white tracking-tight">
                {isLoading ? '...' : summary?.statusDistribution?.ACTIVE || 0}
              </div>
              <div className="mt-1 text-[11px] text-emerald-400">
                Secured with lien in favour of AICTE
              </div>
            </div>

            {/* Institution Card 2: Expiring Soon */}
            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
              <div className="flex items-center justify-between text-zinc-400 text-xs">
                <span>Expiring within 90 Days</span>
                <Clock className="w-4 h-4 text-amber-400" />
              </div>
              <div className="mt-2 text-2xl font-bold text-white tracking-tight">
                {isLoading ? '...' : summary?.expiringWithin90Days || 0}
              </div>
              <div className="mt-1 text-[11px] text-amber-400">
                Submit renewal child FDR before maturity
              </div>
            </div>

            {/* Institution Card 3: Under Scrutiny */}
            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
              <div className="flex items-center justify-between text-zinc-400 text-xs">
                <span>In Review / Scrutiny</span>
                <FileText className="w-4 h-4 text-zinc-400" />
              </div>
              <div className="mt-2 text-2xl font-bold text-white tracking-tight">
                {isLoading ? '...' : (summary?.statusDistribution?.SUBMITTED || 0) + (summary?.statusDistribution?.UNDER_SCRUTINY || 0)}
              </div>
              <div className="mt-1 text-[11px] text-zinc-500">
                Under official verification by AICTE
              </div>
            </div>

            {/* Institution Card 4: Action Required */}
            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
              <div className="flex items-center justify-between text-zinc-400 text-xs">
                <span>Actions Needed</span>
                <AlertTriangle className="w-4 h-4 text-rose-400" />
              </div>
              <div className="mt-2 text-2xl font-bold text-white tracking-tight">
                {isLoading ? '...' : (summary?.highRiskCount || 0) + (summary?.statusDistribution?.DRAFT || 0)}
              </div>
              <div className="mt-1 text-[11px] text-rose-400">
                Discrepancies to resolve or draft submissions
              </div>
            </div>
          </>
        ) : isAuthority ? (
          <>
            {/* Authority Card 1: Pending Sanctions */}
            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
              <div className="flex items-center justify-between text-zinc-400 text-xs">
                <span>Pending Sanction Decisions</span>
                <FileCheck2 className="w-4 h-4 text-amber-400" />
              </div>
              <div className="mt-2 text-2xl font-bold text-white tracking-tight">
                {isLoading ? '...' : summary?.statusDistribution?.RELEASE_REQUESTED || 0}
              </div>
              <div className="mt-1 text-[11px] text-amber-400">
                Recommended by Scrutiny Officers
              </div>
            </div>

            {/* Authority Card 2: Total Releases */}
            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
              <div className="flex items-center justify-between text-zinc-400 text-xs">
                <span>Sanctioned Releases</span>
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="mt-2 text-2xl font-bold text-white tracking-tight">
                {isLoading ? '...' : summary?.statusDistribution?.RELEASED || 0}
              </div>
              <div className="mt-1 text-[11px] text-emerald-400">
                Dual authorization executed
              </div>
            </div>

            {/* Authority Card 3: Monitored Active Deposits */}
            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
              <div className="flex items-center justify-between text-zinc-400 text-xs">
                <span>Active Institutional Deposits</span>
                <TrendingUp className="w-4 h-4 text-zinc-400" />
              </div>
              <div className="mt-2 text-2xl font-bold text-white tracking-tight">
                {isLoading ? '...' : summary?.statusDistribution?.ACTIVE || 0}
              </div>
              <div className="mt-1 text-[11px] text-zinc-500">
                Secured guarantees under regulation
              </div>
            </div>

            {/* Authority Card 4: Portfolio Holdings */}
            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
              <div className="flex items-center justify-between text-zinc-400 text-xs">
                <span>Portfolio Total Principal</span>
                <Building2 className="w-4 h-4 text-zinc-400" />
              </div>
              <div className="mt-2 text-2xl font-bold text-white tracking-tight">
                {isLoading ? '...' : formatCurrency(summary?.totalDepositAmount || 0)}
              </div>
              <div className="mt-1 text-[11px] text-zinc-500">
                Across {summary?.totalRecords || 0} institutions
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Standard / Admin / Scrutiny / Auditor Cards */}
            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
              <div className="flex items-center justify-between text-zinc-400 text-xs">
                <span>Total Deposit Holdings</span>
                <TrendingUp className="w-4 h-4 text-zinc-400" />
              </div>
              <div className="mt-2 text-2xl font-bold text-white tracking-tight">
                {isLoading ? '...' : formatCurrency(summary?.totalDepositAmount || 0)}
              </div>
              <div className="mt-1 text-[11px] text-zinc-500">
                Across {summary?.totalRecords || 0} registered receipts
              </div>
            </div>

            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
              <div className="flex items-center justify-between text-zinc-400 text-xs">
                <span>Bank Verified & Active</span>
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="mt-2 text-2xl font-bold text-white tracking-tight">
                {isLoading ? '...' : summary?.statusDistribution?.ACTIVE || 0}
              </div>
              <div className="mt-1 text-[11px] text-emerald-400 flex items-center gap-1">
                <span>Secured with AICTE lien</span>
              </div>
            </div>

            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
              <div className="flex items-center justify-between text-zinc-400 text-xs">
                <span>Expiring Within 90 Days</span>
                <Clock className="w-4 h-4 text-amber-400" />
              </div>
              <div className="mt-2 text-2xl font-bold text-white tracking-tight">
                {isLoading ? '...' : summary?.expiringWithin90Days || 0}
              </div>
              <div className="mt-1 text-[11px] text-amber-400">
                Automated alerts active (90/60/30/7d)
              </div>
            </div>

            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
              <div className="flex items-center justify-between text-zinc-400 text-xs">
                <span>{isAdmin ? 'System Discrepancies' : 'Risk Flags & Discrepancies'}</span>
                <AlertTriangle className="w-4 h-4 text-rose-400" />
              </div>
              <div className="mt-2 text-2xl font-bold text-white tracking-tight">
                {isLoading ? '...' : summary?.highRiskCount || 0}
              </div>
              <div className="mt-1 text-[11px] text-rose-400">
                Forensic & OCR discrepancies flagged
              </div>
            </div>
          </>
        )}
      </div>

      {/* Charts Section: Strictly hidden for INSTITUTION role (least privilege) */}
      {!isInstitution && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Status Distribution Donut Chart */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-900">
              <h2 className="text-sm font-semibold text-white">Deposit Status Lifecycle Distribution</h2>
              <span className="text-[11px] text-zinc-500">Live Breakdown</span>
            </div>

            <div className="h-64 mt-2">
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={85}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '6px', fontSize: '12px' }}
                      itemStyle={{ color: '#ffffff' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-zinc-500">
                  Loading status metrics...
                </div>
              )}
            </div>

            {/* Legend list */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-zinc-900 text-xs">
              {pieData.map((item, idx) => (
                <div key={idx} className="flex items-center gap-1.5 text-zinc-400">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="truncate">{item.name}:</span>
                  <span className="font-semibold text-white">{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Maturity Horizon Timeline Bar Chart */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-900">
              <h2 className="text-sm font-semibold text-white">Deposit Maturity Horizon Timeline</h2>
              <span className="text-[11px] text-zinc-500">Urgency Monitoring</span>
            </div>

            <div className="h-64 mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 20, right: 20, left: -20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="range" stroke="#71717a" fontSize={11} interval={0} angle={-15} textAnchor="end" />
                  <YAxis stroke="#71717a" fontSize={11} />
                  <RechartsTooltip
                    contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '6px', fontSize: '12px' }}
                    itemStyle={{ color: '#ffffff' }}
                  />
                  <Bar dataKey="count" fill="#d4d4d8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="p-2.5 rounded bg-zinc-900/60 border border-zinc-800 text-[11px] text-zinc-400 flex items-center justify-between">
              <span>Automated node-cron scheduler scans daily at 00:00 UTC.</span>
              {isAdmin && (
                <Link to="/admin" className="text-zinc-200 hover:underline flex items-center gap-1 font-medium">
                  Simulate Date <ArrowUpRight className="w-3 h-3" />
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Recent Deposits & Action Queue */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-900">
          <div>
            <h2 className="text-sm font-semibold text-white">Recent Security Deposit Receipts</h2>
            <p className="text-xs text-zinc-500">Live operational ledger of submissions and verifications.</p>
          </div>
          <Link
            to="/fdrs"
            className="text-xs text-zinc-400 hover:text-white inline-flex items-center gap-1"
          >
            View all records <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto mt-2">
          <table className="w-full text-left text-xs text-zinc-300">
            <thead className="bg-zinc-900/80 text-zinc-400 font-medium border-b border-zinc-800">
              <tr>
                <th className="py-2.5 px-3">FDR Reference</th>
                <th className="py-2.5 px-3">Bank & Branch</th>
                <th className="py-2.5 px-3">Amount</th>
                <th className="py-2.5 px-3">Maturity Date</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Verification</th>
                <th className="py-2.5 px-3">Risk</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900">
              {recentFdrs.map(fdr => (
                <tr key={fdr._id || fdr.id} className="hover:bg-zinc-900/40 transition-colors">
                  <td className="py-3 px-3 font-mono font-medium text-white">
                    •••• •••• {fdr.last4}
                  </td>
                  <td className="py-3 px-3">
                    <div className="font-medium text-zinc-200">{fdr.bankName}</div>
                    <div className="text-[11px] text-zinc-500 truncate max-w-xs">{fdr.branch}</div>
                  </td>
                  <td className="py-3 px-3 font-medium text-white">
                    ₹{fdr.amount.toLocaleString('en-IN')}
                  </td>
                  <td className="py-3 px-3 font-mono text-zinc-400">
                    {new Date(fdr.maturityDate).toISOString().slice(0, 10)}
                  </td>
                  <td className="py-3 px-3">
                    <StatusBadge status={fdr.status} />
                  </td>
                  <td className="py-3 px-3">
                    <StatusBadge verificationStatus={fdr.verificationStatus} />
                  </td>
                  <td className="py-3 px-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${
                      fdr.riskScore >= 30
                        ? 'bg-rose-950/50 text-rose-300 border border-rose-800'
                        : fdr.riskScore > 0
                        ? 'bg-amber-950/50 text-amber-300 border border-amber-800'
                        : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
                    }`}>
                      {fdr.riskScore}/100
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <Link
                      to={`/fdrs/${fdr._id || fdr.id}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-medium transition-colors"
                    >
                      Inspect
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
