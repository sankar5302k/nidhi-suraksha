import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { UserRole } from '../types.js';
import {
  ShieldCheck,
  Building2,
  ClipboardCheck,
  Scale,
  Shield,
  Search,
  KeyRound,
  Eye,
  EyeOff,
  AlertCircle,
  Lock,
  FileText
} from 'lucide-react';

interface PortalInfo {
  role: UserRole;
  slug: string;
  title: string;
  portalName: string;
  badge: string;
  aal: string;
  description: string;
}

const PORTALS: Record<UserRole, PortalInfo> = {
  INSTITUTION: {
    role: 'INSTITUTION',
    slug: 'institution',
    title: 'Institution Representative',
    portalName: 'Institution Deposit Portal',
    badge: 'AICTE Affiliated Institute',
    aal: 'AAL1',
    description: 'Statutory portal for university and college registrars to register FDR deposits, submit renewals, and request release sanctions.'
  },
  SCRUTINY_OFFICER: {
    role: 'SCRUTINY_OFFICER',
    slug: 'scrutiny',
    title: 'AICTE Scrutiny Officer',
    portalName: 'Document Scrutiny Bureau',
    badge: 'Regulatory Verification Bureau',
    aal: 'AAL2',
    description: 'Regulatory verification interface for examining fixed deposit receipts, core banking lien marks, and OCR extraction fidelity.'
  },
  APPROVING_AUTHORITY: {
    role: 'APPROVING_AUTHORITY',
    slug: 'authority',
    title: 'Statutory Approving Authority',
    portalName: 'Sanction & Release Authority',
    badge: 'Executive Sanctions Cell',
    aal: 'AAL2',
    description: 'Executive portal for statutory review, risk score verification, and dual-authorization digital release orders.'
  },
  ADMIN: {
    role: 'ADMIN',
    slug: 'admin',
    title: 'System Administrator',
    portalName: 'Central Admin & Security Cell',
    badge: 'Root Security Cell',
    aal: 'AAL2',
    description: 'Central system administration, cryptographic envelope key management, institution onboarding, and user authorization.'
  },
  AUDITOR: {
    role: 'AUDITOR',
    slug: 'auditor',
    title: 'Vigilance & Compliance Auditor',
    portalName: 'Vigilance & Audit Bureau',
    badge: 'Statutory Oversight',
    aal: 'AAL2',
    description: 'Independent regulatory oversight for inspecting the immutable SHA-256 hash chains and cryptographic audit records.'
  }
};

const SLUG_TO_ROLE: Record<string, UserRole> = {
  institution: 'INSTITUTION',
  institute: 'INSTITUTION',
  scrutiny: 'SCRUTINY_OFFICER',
  officer: 'SCRUTINY_OFFICER',
  authority: 'APPROVING_AUTHORITY',
  admin: 'ADMIN',
  auditor: 'AUDITOR'
};

const PORTAL_ICONS: Record<UserRole, React.ComponentType<{ className?: string }>> = {
  INSTITUTION: Building2,
  SCRUTINY_OFFICER: ClipboardCheck,
  APPROVING_AUTHORITY: Scale,
  ADMIN: Shield,
  AUDITOR: Search
};

const DEMO_CREDENTIALS: Record<UserRole, { email: string; pass: string }> = {
  INSTITUTION: { email: 'registrar@diet-delhi.ac.in', pass: 'Institute@123' },
  SCRUTINY_OFFICER: { email: 'scrutiny.officer@aicte.gov.in', pass: 'Officer@123' },
  APPROVING_AUTHORITY: { email: 'authority@aicte.gov.in', pass: 'Authority@123' },
  ADMIN: { email: 'admin@aicte.gov.in', pass: 'Admin@123' },
  AUDITOR: { email: 'auditor@aicte.gov.in', pass: 'Auditor@123' }
};

export const LoginPage: React.FC = () => {
  const { roleParam } = useParams<{ roleParam?: string }>();
  const navigate = useNavigate();
  const { user, login } = useAuth();

  const [selectedRole, setSelectedRole] = useState<UserRole>(() => {
    if (roleParam && SLUG_TO_ROLE[roleParam.toLowerCase()]) {
      return SLUG_TO_ROLE[roleParam.toLowerCase()];
    }
    return 'INSTITUTION';
  });

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // If already authenticated, redirect to appropriate portal
  useEffect(() => {
    if (user) {
      redirectToDashboard(user.role);
    }
  }, [user]);

  // Sync role param with URL
  useEffect(() => {
    if (roleParam && SLUG_TO_ROLE[roleParam.toLowerCase()]) {
      setSelectedRole(SLUG_TO_ROLE[roleParam.toLowerCase()]);
      setErrorMsg(null);
    }
  }, [roleParam]);

  const handlePortalSwitch = (role: UserRole) => {
    setSelectedRole(role);
    setErrorMsg(null);
    navigate(`/login/${PORTALS[role].slug}`, { replace: true });
  };

  const redirectToDashboard = (role: UserRole) => {
    switch (role) {
      case 'INSTITUTION':
        navigate('/fdrs');
        break;
      case 'SCRUTINY_OFFICER':
      case 'APPROVING_AUTHORITY':
        navigate('/release-requests');
        break;
      case 'ADMIN':
      case 'AUDITOR':
        navigate('/admin');
        break;
      default:
        navigate('/');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setErrorMsg('Please enter both official email and password.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const loggedInUser = await login(email.trim(), password, selectedRole);
      redirectToDashboard(loggedInUser.role);
    } catch (err: any) {
      setErrorMsg(err.message || 'Invalid credentials or unauthorized account.');
    } finally {
      setIsLoading(false);
    }
  };

  const currentPortal = PORTALS[selectedRole];
  const ActiveIcon = PORTAL_ICONS[selectedRole];

  return (
    <div className="py-8 max-w-4xl mx-auto px-4">
      {/* Official Government Seal & Brand Heading */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 mb-3 shadow-inner">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span className="font-medium">All India Council for Technical Education (AICTE)</span>
          <span className="text-zinc-600">•</span>
          <span className="text-zinc-400">Statutory Regulation Bureau</span>
        </div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight">
          Nidhi Suraksha Access Portal
        </h1>
        <p className="mt-2 text-xs sm:text-sm text-zinc-400 max-w-xl mx-auto">
          "Verify. Track. Release." — Institutional Security Deposit & FDR Management Portal.
          Select your statutory gateway below to sign in.
        </p>
      </div>

      {/* Role Portal Selection Tabs */}
      <div className="mb-6">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-2.5 px-1">
          Select Statutory Gateway
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 bg-neutral-950 p-1.5 rounded-xl border border-zinc-800">
          {(['INSTITUTION', 'SCRUTINY_OFFICER', 'APPROVING_AUTHORITY', 'ADMIN', 'AUDITOR'] as UserRole[]).map((r) => {
            const portal = PORTALS[r];
            const Icon = PORTAL_ICONS[r];
            const isSelected = selectedRole === r;

            return (
              <button
                key={r}
                type="button"
                onClick={() => handlePortalSwitch(r)}
                className={`flex items-center gap-2 p-2.5 rounded-lg text-left transition-all ${
                  isSelected
                    ? 'bg-zinc-800 text-white shadow-sm border border-zinc-700'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 border border-transparent'
                }`}
              >
                <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
                  isSelected ? 'bg-zinc-900 text-white' : 'bg-zinc-900/70 text-zinc-500'
                }`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold truncate leading-tight">
                    {r === 'SCRUTINY_OFFICER' ? 'Scrutiny' :
                     r === 'APPROVING_AUTHORITY' ? 'Authority' :
                     r === 'INSTITUTION' ? 'Institution' :
                     r === 'ADMIN' ? 'Admin' : 'Auditor'}
                  </div>
                  <div className="text-[10px] text-zinc-500 truncate">{portal.aal}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Authentication Card */}
      <div className="bg-neutral-950 border border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-2xl relative">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-6 mb-6 border-b border-zinc-900">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-zinc-900 border border-zinc-700 flex items-center justify-center text-white shadow-inner">
              <ActiveIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white">{currentPortal.portalName}</h2>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-zinc-900 text-zinc-300 border border-zinc-800 font-mono">
                  {currentPortal.aal}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5 line-clamp-1">{currentPortal.description}</p>
            </div>
          </div>

          <div className="text-left sm:text-right">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500 block">Security Protocol</span>
            <span className="text-xs font-mono text-zinc-300">TLS 1.3 • AES-256-GCM</span>
          </div>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="mb-5 p-3.5 rounded-xl bg-red-950/40 border border-red-900/60 text-red-200 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
            <div>
              <strong className="font-semibold">Authentication Error:</strong> {errorMsg}
            </div>
          </div>
        )}

        {/* Credentials Form */}
        <form onSubmit={handleSubmit} className="space-y-4 max-w-xl mx-auto">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              Official User ID / Institutional Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. registrar@diet-delhi.ac.in"
              autoComplete="username"
              required
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-500 text-xs focus:outline-none focus:border-zinc-400 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              Official Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter account password"
                autoComplete="current-password"
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-500 text-xs focus:outline-none focus:border-zinc-400 transition-colors pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex items-center justify-between mt-1.5 px-0.5">
              <button
                type="button"
                onClick={() => {
                  const demo = DEMO_CREDENTIALS[selectedRole];
                  setEmail(demo.email);
                  setPassword(demo.pass);
                  setErrorMsg(null);
                }}
                className="text-[11px] text-zinc-400 hover:text-white transition-colors underline underline-offset-2 flex items-center gap-1"
              >
                Auto-fill demo credentials for {PORTALS[selectedRole].title}
              </button>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-white text-black hover:bg-zinc-200 transition-all shadow-md active:scale-[0.99] disabled:opacity-50"
            >
              {isLoading ? (
                <span>Validating Session...</span>
              ) : (
                <>
                  <KeyRound className="w-4 h-4" />
                  <span>Sign In to {currentPortal.title}</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Security & Audit Notice */}
        <div className="mt-8 pt-5 border-t border-zinc-900 flex flex-col sm:flex-row items-center justify-between text-[11px] text-zinc-500 gap-3">
          <div className="flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-zinc-500" />
            <span>Encrypted Session • Immutable SHA-256 Audit Trail Active</span>
          </div>

          <div className="flex items-center gap-1.5 text-zinc-500">
            <FileText className="w-3.5 h-3.5 text-zinc-500" />
            <span>Sample credentials directory: <code className="text-zinc-400">sample_accounts.txt</code></span>
          </div>
        </div>
      </div>
    </div>
  );
};
