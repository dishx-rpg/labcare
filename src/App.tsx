import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { UserRole } from '../shared/types.ts';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { ThemeProvider } from './context/ThemeContext.tsx';
import AdminDashboard from './pages/AdminDashboard.tsx';
import AnalyticsPage from './pages/AnalyticsPage.tsx';
import AuthPage from './pages/AuthPage.tsx';
import HandlerDashboard from './pages/HandlerDashboard.tsx';
import LandingPage from './pages/LandingPage.tsx';
import OperationsLabPage from './pages/OperationsLabPage.tsx';
import ReporterDashboard from './pages/ReporterDashboard.tsx';
import VerificationSuitePage from './pages/VerificationSuitePage.tsx';

function getHomePathForRole(role: UserRole): string {
  if (role === 'Administrator') return '/admin';
  if (role === 'Handler') return '/handler';
  return '/reporter';
}

function ProtectedRoute({
  allowedRoles,
  children,
}: {
  allowedRoles: UserRole[];
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#070B14] flex items-center justify-center text-xs text-slate-500">
        Verifying session...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    return <Navigate to={getHomePathForRole(user.role)} replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/auth" element={<AuthPage />} />

            <Route
              path="/reporter"
              element={
                <ProtectedRoute allowedRoles={['Reporter', 'Administrator']}>
                  <ReporterDashboard />
                </ProtectedRoute>
              }
            />

            <Route
              path="/handler"
              element={
                <ProtectedRoute allowedRoles={['Handler', 'Administrator']}>
                  <HandlerDashboard />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={['Administrator']}>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />

            <Route
              path="/analytics"
              element={
                <ProtectedRoute allowedRoles={['Handler', 'Administrator']}>
                  <AnalyticsPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/operations-lab"
              element={
                <ProtectedRoute allowedRoles={['Reporter', 'Handler', 'Administrator']}>
                  <OperationsLabPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/verification"
              element={
                <ProtectedRoute allowedRoles={['Reporter', 'Handler', 'Administrator']}>
                  <VerificationSuitePage />
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
