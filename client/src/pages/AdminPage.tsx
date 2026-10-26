import React, { useState } from 'react';
import { apiRequest } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import {
  Lock,
  Calendar,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Play,
  RotateCcw,
  CheckCircle,
  Hash,
  Database,
  Loader2,
  Terminal,
  Activity,
  Search
} from 'lucide-react';

interface SimulationResult {
  simulatedDate: string;
  remindersSent: number;
  expiringTransitionCount: number;
  maturedTransitionCount: number;
  details: Array<{
    fdrId: string;
    last4: string;
    daysRemaining: number;
    action: string;
  }>;
}

interface ChainVerifyResult {
  valid: boolean;
  totalLogsChecked: number;
  lastSequence: number;
  lastHash: string;
  error?: string;
  brokenAtSeq?: number;
}

export const AdminPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const isAuditor = user?.role === 'AUDITOR';

  // Date simulator state
  const defaultSimDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [targetDate, setTargetDate] = useState(defaultSimDate);
  const [simLoading, setSimLoading] = useState(false);
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [simError, setSimError] = useState<string | null>(null);

  // Audit chain state
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyResult, setVerifyResult] = useState<ChainVerifyResult | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const handleRunSimulation = async () => {
    setSimLoading(true);
    setSimError(null);
    try {
      const res = await apiRequest<{ message: string; data: SimulationResult }>('/admin/simulate-date', {
        method: 'POST',
        body: JSON.stringify({ targetDate })
      });
      setSimResult(res.data);
    } catch (err: unknown) {
      setSimError(err instanceof Error ? err.message : 'Simulation failed');
    } finally {
      setSimLoading(false);
    }
  };

  const handleVerifyChain = async () => {
    setVerifyLoading(true);
    setVerifyError(null);
    try {
      const res = await apiRequest<{ data: ChainVerifyResult }>('/audit/verify-chain');
      setVerifyResult(res.data);
    } catch (err: unknown) {
      setVerifyError(err instanceof Error ? err.message : 'Chain verification failed');
    } finally {
      setVerifyLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="pb-3 border-b border-zinc-800">
        <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
          {isAuditor ? <Search className="w-5 h-5 text-white" /> : <Lock className="w-5 h-5 text-white" />}
          {isAuditor ? 'Statutory Vigilance & Cryptographic Audit Verification' : 'System Administration & Security Operations'}
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          {isAuditor
            ? 'Independent mathematical inspection of the unbroken SHA-256 append-only ledger sequence.'
            : 'Interactive lifecycle date evaluation, cryptographic ledger inspection, and AI service health.'}
        </p>
      </div>

      {/* Main Grid */}
      <div className={`grid grid-cols-1 ${isAdmin ? 'lg:grid-cols-2' : 'max-w-3xl'} gap-6`}>
        {/* Left Column: Date Simulator Tool (Strictly Admin-Only in Demo Mode) */}
        {isAdmin && (
          <div className="p-5 rounded-lg bg-zinc-900/40 border border-zinc-800 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-tight text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-zinc-300" />
                Maturity Date Advancement Simulator
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                Admin Demo Only
              </span>
            </div>

          <p className="text-xs text-zinc-400 leading-relaxed">
            Fast-forward systemic time to trigger automated maturity evaluation. Deposits approaching 90, 60, 30, or 7 days to maturity will automatically transition status and log regulatory reminders.
          </p>

          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-zinc-300 mb-1">Simulated Evaluation Date</label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={targetDate}
                  onChange={e => setTargetDate(e.target.value)}
                  className="flex-1 px-3 py-2 rounded bg-zinc-950 border border-zinc-700 text-xs text-white focus:outline-none focus:border-zinc-400"
                />
                <button
                  onClick={handleRunSimulation}
                  disabled={simLoading}
                  className="px-4 py-2 rounded bg-white hover:bg-zinc-200 text-black font-semibold text-xs disabled:opacity-50 transition-colors flex items-center gap-1.5 shrink-0"
                >
                  {simLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  <span>Evaluate Schedule</span>
                </button>
              </div>
            </div>

            {/* Quick Presets */}
            <div className="flex items-center gap-1.5 text-xs text-zinc-400">
              <span className="text-[11px] text-zinc-500">Presets:</span>
              <button
                onClick={() => setTargetDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))}
                className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-[11px] text-zinc-300"
              >
                +30 Days
              </button>
              <button
                onClick={() => setTargetDate(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))}
                className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-[11px] text-zinc-300"
              >
                +90 Days
              </button>
              <button
                onClick={() => setTargetDate(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))}
                className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-[11px] text-zinc-300"
              >
                +1 Year
              </button>
            </div>
          </div>

          {simError && (
            <div className="p-3 rounded bg-red-950/40 border border-red-800 text-red-200 text-xs">
              {simError}
            </div>
          )}

          {simResult && (
            <div className="p-4 rounded bg-zinc-950/80 border border-zinc-800 space-y-3 text-xs">
              <div className="flex items-center justify-between text-zinc-300 border-b border-zinc-800 pb-2">
                <span className="font-semibold text-white">Evaluation Outcome:</span>
                <span className="font-mono text-[11px] text-zinc-400">{simResult.simulatedDate}</span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
                  <span className="block font-mono text-base font-bold text-white">{simResult.remindersSent}</span>
                  <span className="text-[10px] text-zinc-400">Reminders Logged</span>
                </div>
                <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
                  <span className="block font-mono text-base font-bold text-amber-300">{simResult.expiringTransitionCount}</span>
                  <span className="text-[10px] text-zinc-400">FDRs Expiring</span>
                </div>
                <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
                  <span className="block font-mono text-base font-bold text-red-300">{simResult.maturedTransitionCount}</span>
                  <span className="text-[10px] text-zinc-400">FDRs Matured</span>
                </div>
              </div>

              {simResult.details && simResult.details.length > 0 && (
                <div className="space-y-1 pt-1 max-h-48 overflow-y-auto">
                  <span className="text-[10px] uppercase font-semibold text-zinc-500">Action Ledger:</span>
                  {simResult.details.map((d, i) => (
                    <div key={i} className="p-1.5 rounded bg-zinc-900/60 font-mono text-[11px] flex justify-between text-zinc-300">
                      <span>••••{d.last4} ({d.daysRemaining}d left)</span>
                      <span className="text-white font-semibold">{d.action}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        )}

        {/* Right Column: Cryptographic Chain Inspector */}
        <div className="p-5 rounded-lg bg-zinc-900/40 border border-zinc-800 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-tight text-white flex items-center gap-2">
              <Hash className="w-4 h-4 text-zinc-300" />
              Cryptographic Audit Chain Verifier
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
              SHA-256 Ledger
            </span>
          </div>

          <p className="text-xs text-zinc-400 leading-relaxed">
            Verify every record in the MongoDB audit ledger against its preceding hash block. Any modification, insertion, or deletion breaks the sequence and is instantly detected.
          </p>

          <button
            onClick={handleVerifyChain}
            disabled={verifyLoading}
            className="w-full py-2.5 rounded bg-white hover:bg-zinc-200 text-black font-semibold text-xs disabled:opacity-50 transition-colors flex items-center justify-center gap-2 shadow-sm"
          >
            {verifyLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4 text-black" />}
            <span>Run Cryptographic Verification</span>
          </button>

          {verifyError && (
            <div className="p-3 rounded bg-red-950/40 border border-red-800 text-red-200 text-xs">
              {verifyError}
            </div>
          )}

          {verifyResult && (
            <div className="p-4 rounded bg-zinc-950/80 border border-zinc-800 space-y-3 text-xs">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                <span className="font-semibold text-white">Chain Integrity Status:</span>
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                    verifyResult.valid
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      : 'bg-red-950 text-red-300 border border-red-800'
                  }`}
                >
                  {verifyResult.valid ? 'VALID & UNTAMPERED' : 'CHAIN COMPROMISED'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
                  <span className="text-zinc-500 block text-[10px]">Total Logs Verified</span>
                  <span className="font-mono font-bold text-white text-base">{verifyResult.totalLogsChecked}</span>
                </div>
                <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
                  <span className="text-zinc-500 block text-[10px]">Latest Sequence No</span>
                  <span className="font-mono font-bold text-white text-base">#{verifyResult.lastSequence}</span>
                </div>
              </div>

              <div className="p-2 rounded bg-zinc-900 border border-zinc-800 space-y-1">
                <span className="text-[10px] text-zinc-500 block">Latest Block Hash (SHA-256)</span>
                <div className="font-mono text-[11px] text-zinc-300 break-all">
                  {verifyResult.lastHash}
                </div>
              </div>

              <div className="p-2 rounded bg-zinc-900/50 border border-zinc-800/80 text-[10px] text-zinc-400">
                Audit records are append-only. MongoDB user role grants <code className="text-zinc-200">insert</code> and <code className="text-zinc-200">find</code> only; updates and deletes are blocked.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* AI Engine & System Parameters (Admin Only - Operational detail hidden from Auditor) */}
      {isAdmin && (
        <div className="p-5 rounded-lg bg-zinc-900/40 border border-zinc-800 space-y-3">
          <h2 className="text-sm font-semibold tracking-tight text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-zinc-300" />
            AICTE Document AI & LLM Governance Parameters
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs pt-1">
            <div className="p-3 rounded bg-zinc-900/60 border border-zinc-800">
              <span className="text-zinc-500 block text-[10px] uppercase">Active LLM Model</span>
              <span className="font-mono font-bold text-white text-sm">openai/gpt-oss-120b</span>
              <p className="text-[10px] text-zinc-400 mt-1">Served via Groq API (fallback to mock in offline mode)</p>
            </div>
            <div className="p-3 rounded bg-zinc-900/60 border border-zinc-800">
              <span className="text-zinc-500 block text-[10px] uppercase">Daily Budget Guardrail</span>
              <span className="font-mono font-bold text-white text-sm">$5.00 / day</span>
              <p className="text-[10px] text-zinc-400 mt-1">Hard limit enforced via persistent usage tracker</p>
            </div>
            <div className="p-3 rounded bg-zinc-900/60 border border-zinc-800">
              <span className="text-zinc-500 block text-[10px] uppercase">Privacy & Safety Guard</span>
              <span className="font-mono font-bold text-emerald-400 text-sm">PII Redacted & Sanitized</span>
              <p className="text-[10px] text-zinc-400 mt-1">PAN, Aadhaar, phones stripped before LLM dispatch</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
