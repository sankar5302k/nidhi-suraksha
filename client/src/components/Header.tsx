import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import {
  ShieldCheck,
  LayoutDashboard,
  FileSpreadsheet,
  PlusCircle,
  FileCheck2,
  Lock,
  BarChart3,
  Sparkles,
  LogOut,
  LogIn,
  User
} from 'lucide-react';

interface HeaderProps {
  onOpenCopilot: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenCopilot }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path: string) => location.pathname === path;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="bg-neutral-950 border-b border-zinc-800 sticky top-0 z-40">
      {/* Top Bar with Brand & User Session Controls */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Official AICTE Brand & Portal Name */}
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 rounded bg-zinc-900 border border-zinc-700 flex items-center justify-center text-zinc-100 group-hover:border-zinc-500 transition-colors">
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-base tracking-tight text-white">Nidhi Suraksha</span>
                  <span className="text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">AICTE</span>
                </div>
                <p className="text-[11px] text-zinc-400 font-medium">Verify. Track. Release.</p>
              </div>
            </Link>
          </div>

          {/* Right Controls: Copilot Assistant + Logged-in User Profile & Sign Out */}
          <div className="flex items-center gap-3">
            {user && user.role !== 'ADMIN' && (
              <button
                onClick={onOpenCopilot}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 transition-colors shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5 text-zinc-300" />
                <span>Copilot Assistant</span>
              </button>
            )}

            {user ? (
              <div className="flex items-center gap-3 pl-3 border-l border-zinc-800">
                {/* User Identity Pill */}
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center text-zinc-300">
                    <User className="w-4 h-4" />
                  </div>
                  <div className="hidden sm:block text-left">
                    <div className="text-xs font-semibold text-white leading-tight">
                      {user.fullName || 'Official User'}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] uppercase tracking-wider font-mono text-zinc-400">
                        {user.role.replace(/_/g, ' ')}
                      </span>
                      <span className="text-zinc-600">•</span>
                      <span className="text-[9px] uppercase px-1 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 font-mono">
                        {user.aal.toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Professional Sign Out Button */}
                <button
                  onClick={handleLogout}
                  title="Sign out of government session"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 hover:text-white bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5 text-zinc-400" />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold bg-white text-black hover:bg-zinc-200 transition-colors shadow-sm"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Official Sign In</span>
              </Link>
            )}
          </div>
        </div>

        {/* Secondary Navigation Bar (Shown when authenticated) */}
        {user && (
          <nav className="flex space-x-1 py-2 border-t border-zinc-900 text-xs overflow-x-auto">
            <Link
              to="/"
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0 ${
                isActive('/') ? 'bg-zinc-900 text-white border border-zinc-700' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              Dashboard
            </Link>

            <Link
              to="/fdrs"
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0 ${
                isActive('/fdrs') ? 'bg-zinc-900 text-white border border-zinc-700' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Deposit Records
            </Link>

            {user.role === 'INSTITUTION' && (
              <Link
                to="/fdrs/new"
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0 ${
                  isActive('/fdrs/new') ? 'bg-zinc-900 text-white border border-zinc-700' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
                }`}
              >
                <PlusCircle className="w-3.5 h-3.5" />
                Register New FDR
              </Link>
            )}

            {user.role !== 'ADMIN' && (
              <Link
                to="/release-requests"
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0 ${
                  isActive('/release-requests') ? 'bg-zinc-900 text-white border border-zinc-700' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
                }`}
              >
                <FileCheck2 className="w-3.5 h-3.5" />
                Release Approvals
              </Link>
            )}

            {user.role !== 'INSTITUTION' && (
              <Link
                to="/reports"
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0 ${
                  isActive('/reports') ? 'bg-zinc-900 text-white border border-zinc-700' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                Reports & CSV
              </Link>
            )}

            {(user.role === 'ADMIN' || user.role === 'AUDITOR') && (
              <Link
                to="/admin"
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0 ${
                  isActive('/admin') ? 'bg-zinc-900 text-white border border-zinc-700' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
                }`}
              >
                <Lock className="w-3.5 h-3.5" />
                System Admin & Audit
              </Link>
            )}
          </nav>
        )}
      </div>
    </header>
  );
};
