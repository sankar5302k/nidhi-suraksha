import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { Header } from './components/Header.js';
import { CopilotDrawer } from './components/CopilotDrawer.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { FdrListPage } from './pages/FdrListPage.js';
import { FdrDetailPage } from './pages/FdrDetailPage.js';
import { NewFdrPage } from './pages/NewFdrPage.js';
import { ReleaseApprovalsPage } from './pages/ReleaseApprovalsPage.js';
import { ReportsPage } from './pages/ReportsPage.js';
import { AdminPage } from './pages/AdminPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { ShieldCheck } from 'lucide-react';

import { UserRole } from './types.js';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false
    }
  }
});

const ProtectedRoute: React.FC<{ children: React.ReactNode; allowedRoles?: UserRole[] }> = ({
  children,
  allowedRoles
}) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[55vh] flex flex-col items-center justify-center text-zinc-400 gap-3">
        <div className="w-7 h-7 border-2 border-zinc-700 border-t-white rounded-full animate-spin" />
        <span className="text-xs font-medium tracking-wide">Validating statutory security session...</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export const App: React.FC = () => {
  const [copilotOpen, setCopilotOpen] = useState(false);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <div className="min-h-screen bg-black text-zinc-100 flex flex-col font-sans selection:bg-zinc-800 selection:text-white">
            {/* Header Navigation */}
            <Header onOpenCopilot={() => setCopilotOpen(true)} />

            {/* Main Application Container */}
            <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
              <Routes>
                {/* Public Authentication Gateways */}
                <Route path="/login" element={<LoginPage />} />
                <Route path="/login/:roleParam" element={<LoginPage />} />

                {/* Protected Statutory Routes with Matrix-Enforced RBAC Route Guards */}
                <Route
                  path="/"
                  element={
                    <ProtectedRoute>
                      <DashboardPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/fdrs"
                  element={
                    <ProtectedRoute>
                      <FdrListPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/fdrs/new"
                  element={
                    <ProtectedRoute allowedRoles={['INSTITUTION']}>
                      <NewFdrPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/fdrs/:id"
                  element={
                    <ProtectedRoute>
                      <FdrDetailPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/release-requests"
                  element={
                    <ProtectedRoute allowedRoles={['INSTITUTION', 'SCRUTINY_OFFICER', 'APPROVING_AUTHORITY', 'AUDITOR']}>
                      <ReleaseApprovalsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/reports"
                  element={
                    <ProtectedRoute allowedRoles={['SCRUTINY_OFFICER', 'APPROVING_AUTHORITY', 'ADMIN', 'AUDITOR']}>
                      <ReportsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin"
                  element={
                    <ProtectedRoute allowedRoles={['ADMIN', 'AUDITOR']}>
                      <AdminPage />
                    </ProtectedRoute>
                  }
                />

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>

            {/* AI Copilot Drawer */}
            <CopilotDrawer
              isOpen={copilotOpen}
              onClose={() => setCopilotOpen(false)}
            />

            {/* High-Trust Government / Fintech Footer */}
            <footer className="border-t border-zinc-900 bg-neutral-950 py-6 text-xs text-zinc-500">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                    <ShieldCheck className="w-3 h-3 text-zinc-400" />
                  </div>
                  <div>
                    <span className="font-semibold text-zinc-300">Nidhi Suraksha</span>
                    <span className="mx-2 text-zinc-700">•</span>
                    <span className="text-zinc-400">Verify. Track. Release.</span>
                  </div>
                </div>

                <div className="text-[11px] text-zinc-500 text-center sm:text-right">
                  AICTE Bureau of Regulation — Institutional Security Deposit & FDR Management Portal
                  <br />
                  <span className="text-zinc-600">Zero-Trust Architecture • AES-256-GCM Envelope Encryption • Immutable Hash Chain</span>
                </div>
              </div>
            </footer>
          </div>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
};
