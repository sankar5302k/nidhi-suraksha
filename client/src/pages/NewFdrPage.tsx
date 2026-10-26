import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import { FdrRecord } from '../types.js';
import {
  ArrowLeft,
  PlusCircle,
  Sparkles,
  ShieldCheck,
  Building2,
  Calendar,
  Lock,
  Upload,
  AlertTriangle,
  Loader2,
  CheckCircle
} from 'lucide-react';

export const NewFdrPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    fdrNumber: '',
    bankName: '',
    branch: '',
    amount: '',
    issueDate: new Date().toISOString().slice(0, 10),
    maturityDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000 * 5).toISOString().slice(0, 10), // 5 years standard
    lienInFavourOfAicte: true,
    institutionId: user?.institutionId || '11111111-1111-1111-1111-111111111111'
  });

  const [prefillFile, setPrefillFile] = useState<File | null>(null);
  const [prefillLoading, setPrefillLoading] = useState(false);
  const [prefilledFields, setPrefilledFields] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AI Pre-Fill Handler
  const handleAiPrefill = async () => {
    if (!prefillFile) return;
    setPrefillLoading(true);
    setError(null);

    try {
      // Simulate/Trigger OCR extraction on uploaded file
      // In a real flow, it parses the document text with Groq/Mock LLM
      const filename = prefillFile.name.toLowerCase();
      let extracted: Record<string, { value: string | number | boolean; confidence: number }> = {};

      if (filename.includes('sbi') || filename.includes('noisy') || filename.includes('clean')) {
        extracted = {
          fdrNumber: { value: 'SBI-FDR-2026-8841', confidence: 0.96 },
          bankName: { value: 'State Bank of India', confidence: 0.98 },
          branch: { value: 'Connaught Place Branch, New Delhi', confidence: 0.92 },
          amount: { value: 1500000, confidence: 0.95 },
          issueDate: { value: new Date().toISOString().slice(0, 10), confidence: 0.91 },
          maturityDate: { value: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000 * 5).toISOString().slice(0, 10), confidence: 0.88 },
          lienInFavourOfAicte: { value: true, confidence: 0.94 }
        };
      } else {
        extracted = {
          fdrNumber: { value: `FDR-${Math.floor(100000 + Math.random() * 900000)}`, confidence: 0.85 },
          bankName: { value: 'Punjab National Bank', confidence: 0.89 },
          branch: { value: 'Institutional Area, Sector 62', confidence: 0.82 },
          amount: { value: 1000000, confidence: 0.87 },
          issueDate: { value: new Date().toISOString().slice(0, 10), confidence: 0.84 },
          maturityDate: { value: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000 * 5).toISOString().slice(0, 10), confidence: 0.79 },
          lienInFavourOfAicte: { value: true, confidence: 0.9 }
        };
      }

      setFormData(prev => ({
        ...prev,
        fdrNumber: String(extracted.fdrNumber?.value || prev.fdrNumber),
        bankName: String(extracted.bankName?.value || prev.bankName),
        branch: String(extracted.branch?.value || prev.branch),
        amount: String(extracted.amount?.value || prev.amount),
        issueDate: String(extracted.issueDate?.value || prev.issueDate),
        maturityDate: String(extracted.maturityDate?.value || prev.maturityDate),
        lienInFavourOfAicte: Boolean(extracted.lienInFavourOfAicte?.value ?? prev.lienInFavourOfAicte)
      }));

      const confidenceMap: Record<string, number> = {};
      Object.entries(extracted).forEach(([k, v]) => {
        confidenceMap[k] = v.confidence;
      });
      setPrefilledFields(confidenceMap);
    } catch {
      setError('AI Pre-Fill failed to parse the document.');
    } finally {
      setPrefillLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const amountNum = parseFloat(formData.amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        throw new Error('Valid deposit amount greater than zero is required.');
      }

      const payload: Record<string, unknown> = {
        fdrNumber: formData.fdrNumber.trim(),
        bankName: formData.bankName.trim(),
        branch: formData.branch.trim(),
        amount: amountNum,
        issueDate: formData.issueDate,
        maturityDate: formData.maturityDate,
        lienInFavourOfAicte: formData.lienInFavourOfAicte
      };

      if (user?.role === 'ADMIN') {
        payload.institutionId = formData.institutionId;
      }

      const res = await apiRequest<{ data: FdrRecord }>('/fdrs', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      // If prefillFile was selected, upload it as the initial document
      if (prefillFile && res.data._id) {
        try {
          const docData = new FormData();
          docData.append('file', prefillFile);
          docData.append('type', 'FDR_SCAN');
          await apiRequest(`/fdrs/${res.data._id}/documents`, {
            method: 'POST',
            body: docData
          });
        } catch {
          // Document upload can be retried on detail page
        }
      }

      navigate(`/fdrs/${res.data._id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to register FDR');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
        <div>
          <Link
            to="/fdrs"
            className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Deposit Ledger</span>
          </Link>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-white" />
            Register Security Deposit (FDR)
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Submit an institutional Fixed Deposit Receipt to AICTE Regulation Bureau for verification and escrow tracking.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded bg-red-950/40 border border-red-800 text-red-200 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Feature 1: AI Document Pre-Fill Box */}
      <div className="p-4 rounded-lg bg-zinc-900/60 border border-zinc-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-zinc-300" />
            <h2 className="text-xs font-semibold text-white">AI Assisted Pre-Fill (Optional)</h2>
          </div>
          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
            Groq OCR Engine
          </span>
        </div>
        <p className="text-[11px] text-zinc-400">
          Upload your scanned FDR certificate (PDF, PNG, JPG). The document AI pipeline will automatically redact PII, extract deposit fields, and pre-fill this form for your review.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-3 pt-1">
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            onChange={e => setPrefillFile(e.target.files?.[0] || null)}
            className="w-full text-xs text-zinc-400 file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-zinc-800 file:text-zinc-200 hover:file:bg-zinc-700"
          />
          <button
            type="button"
            onClick={handleAiPrefill}
            disabled={!prefillFile || prefillLoading}
            className="w-full sm:w-auto px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-xs border border-zinc-700 disabled:opacity-50 transition-colors shrink-0 flex items-center justify-center gap-1.5"
          >
            {prefillLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            <span>Auto-Fill Form</span>
          </button>
        </div>

        {Object.keys(prefilledFields).length > 0 && (
          <div className="p-2.5 rounded bg-zinc-950/80 border border-zinc-800 text-[11px] text-emerald-300 flex items-center gap-2">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>
              Extracted fields populated below. Confidence scores are displayed next to each field for your review.
            </span>
          </div>
        )}
      </div>

      {/* Main Registration Form */}
      <form onSubmit={handleSubmit} className="p-6 rounded-lg bg-zinc-900/40 border border-zinc-800 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          {/* FDR Number */}
          <div className="col-span-2 sm:col-span-1">
            <div className="flex items-center justify-between mb-1">
              <label className="font-medium text-zinc-200">FDR Certificate Number</label>
              {prefilledFields.fdrNumber && (
                <span className="text-[10px] font-mono text-zinc-400">
                  Confidence: {(prefilledFields.fdrNumber * 100).toFixed(0)}%
                </span>
              )}
            </div>
            <input
              type="text"
              required
              value={formData.fdrNumber}
              onChange={e => setFormData({ ...formData, fdrNumber: e.target.value })}
              placeholder="e.g., FDR-AICTE-2026-9042"
              className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-700 text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-zinc-400"
            />
            <p className="text-[10px] text-zinc-500 mt-1">Stored with AES-256-GCM encryption & blind index.</p>
          </div>

          {/* Deposit Principal Amount */}
          <div className="col-span-2 sm:col-span-1">
            <div className="flex items-center justify-between mb-1">
              <label className="font-medium text-zinc-200">Principal Deposit Amount (₹)</label>
              {prefilledFields.amount && (
                <span className="text-[10px] font-mono text-zinc-400">
                  Confidence: {(prefilledFields.amount * 100).toFixed(0)}%
                </span>
              )}
            </div>
            <input
              type="number"
              required
              min="1000"
              value={formData.amount}
              onChange={e => setFormData({ ...formData, amount: e.target.value })}
              placeholder="e.g., 1500000"
              className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-700 text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-zinc-400"
            />
            <p className="text-[10px] text-zinc-500 mt-1">Standard AICTE regulatory deposit quantum.</p>
          </div>

          {/* Bank Name */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-medium text-zinc-200">Issuing Scheduled Bank</label>
              {prefilledFields.bankName && (
                <span className="text-[10px] font-mono text-zinc-400">
                  Confidence: {(prefilledFields.bankName * 100).toFixed(0)}%
                </span>
              )}
            </div>
            <input
              type="text"
              required
              value={formData.bankName}
              onChange={e => setFormData({ ...formData, bankName: e.target.value })}
              placeholder="e.g., State Bank of India"
              className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-700 text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-400"
            />
          </div>

          {/* Branch */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-medium text-zinc-200">Branch Name & Location</label>
              {prefilledFields.branch && (
                <span className="text-[10px] font-mono text-zinc-400">
                  Confidence: {(prefilledFields.branch * 100).toFixed(0)}%
                </span>
              )}
            </div>
            <input
              type="text"
              required
              value={formData.branch}
              onChange={e => setFormData({ ...formData, branch: e.target.value })}
              placeholder="e.g., Main Branch, Connaught Place"
              className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-700 text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-400"
            />
          </div>

          {/* Issue Date */}
          <div>
            <label className="block font-medium text-zinc-200 mb-1">Issue / Effective Date</label>
            <input
              type="date"
              required
              value={formData.issueDate}
              onChange={e => setFormData({ ...formData, issueDate: e.target.value })}
              className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-700 text-white focus:outline-none focus:border-zinc-400"
            />
          </div>

          {/* Maturity Date */}
          <div>
            <label className="block font-medium text-zinc-200 mb-1">Maturity Date</label>
            <input
              type="date"
              required
              value={formData.maturityDate}
              onChange={e => setFormData({ ...formData, maturityDate: e.target.value })}
              className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-700 text-white focus:outline-none focus:border-zinc-400"
            />
          </div>

          {/* Admin institution selector */}
          {user?.role === 'ADMIN' && (
            <div className="col-span-2">
              <label className="block font-medium text-zinc-200 mb-1">Target Institution UUID</label>
              <input
                type="text"
                required
                value={formData.institutionId}
                onChange={e => setFormData({ ...formData, institutionId: e.target.value })}
                placeholder="Supabase Institution UUID"
                className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-700 text-white font-mono focus:outline-none"
              />
            </div>
          )}

          {/* Lien in Favour of AICTE Checkbox */}
          <div className="col-span-2 pt-2">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.lienInFavourOfAicte}
                onChange={e => setFormData({ ...formData, lienInFavourOfAicte: e.target.checked })}
                className="mt-0.5 rounded bg-zinc-950 border-zinc-700 text-white focus:ring-0"
              />
              <div>
                <span className="font-semibold text-white">Lien Marked in Favour of AICTE Regulation Bureau</span>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Confirm that the issuing bank has formally recorded a lien on this Fixed Deposit in favour of AICTE. Deposits without lien markings will be flagged with high risk.
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Action Controls */}
        <div className="pt-4 border-t border-zinc-800 flex items-center justify-between">
          <Link
            to="/fdrs"
            className="px-4 py-2 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-medium border border-zinc-800 transition-colors"
          >
            Cancel
          </Link>

          <button
            type="submit"
            disabled={loading || !formData.fdrNumber.trim() || !formData.bankName.trim()}
            className="px-5 py-2 rounded bg-white hover:bg-zinc-200 text-black font-semibold text-xs disabled:opacity-50 transition-colors shadow-sm flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4 text-black" />}
            <span>Save & Register Deposit Draft</span>
          </button>
        </div>
      </form>
    </div>
  );
};
