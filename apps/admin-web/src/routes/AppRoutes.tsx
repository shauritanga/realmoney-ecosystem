import { Routes, Route, Navigate } from 'react-router-dom';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { LoginPage } from '../pages/LoginPage';
import { OverviewPage } from '../pages/OverviewPage';
import { KycPage } from '../pages/KycPage';
import { KycDetailPage } from '../pages/KycDetailPage';
import { UnderwritingPage } from '../pages/UnderwritingPage';
import { CollectionsPage } from '../pages/CollectionsPage';
import { LedgerPage } from '../pages/LedgerPage';
import { SettingsPage } from '../pages/SettingsPage';
import { useAuth } from '../hooks/useAuth';

export function AppRoutes() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      {/* Public Login Route: if already signed in, redirect to dashboard */}
      <Route
        path="/login"
        element={
          isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />
        }
      />

      {/* Protected Dashboard Routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<OverviewPage />} />
        <Route path="kyc" element={<KycPage />} />
        <Route path="kyc/:id" element={<KycDetailPage />} />
        <Route path="underwriting" element={<UnderwritingPage />} />
        <Route path="collections" element={<CollectionsPage />} />
        <Route path="ledger" element={<LedgerPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
