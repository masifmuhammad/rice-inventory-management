import React, { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { AuthProvider, useAuth } from './context/AuthContext';
import { SettingsProvider } from './context/SettingsContext';
import { ThemeProvider } from './context/ThemeContext';
import { PageTitleProvider } from './context/PageTitleContext';
import ConfirmProvider from './components/ui/ConfirmProvider';
import ErrorBoundary from './components/ErrorBoundary';
import ScrollToTop from './components/ScrollToTop';
import AppToaster from './components/AppToaster';
import Layout from './components/Layout';
import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import InstallPrompt from './components/InstallPrompt';
import AuthShellSkeleton from './components/skeletons/AuthShellSkeleton';
import { lazyPage } from './utils/lazyPage';
import { unlockFeedbackAudio } from './utils/feedback';

const Dashboard = lazyPage(() => import('./pages/Dashboard'), 'dashboard');
const Products = lazyPage(() => import('./pages/Products'), 'products page');
const Transactions = lazyPage(() => import('./pages/Transactions'), 'transactions page');
const CashBook = lazyPage(() => import('./pages/CashBook'), 'cash book');
const Reports = lazyPage(() => import('./pages/Reports'), 'reports page');
const Settings = lazyPage(() => import('./pages/Settings'), 'settings page');
const AdminUsers = lazyPage(() => import('./pages/AdminUsers'), 'users page');
const AdminActivity = lazyPage(() => import('./pages/AdminActivity'), 'activity log');
const Businesses = lazyPage(() => import('./pages/Businesses'), 'businesses page');
const NotFound = lazyPage(() => import('./pages/NotFound'), 'page');

function RequireAuth({ children }) {
  const { user, initialising } = useAuth();
  const location = useLocation();

  if (initialising) return <AuthShellSkeleton />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;

  return children;
}

function RequirePasswordChange({ children }) {
  const { user } = useAuth();
  const location = useLocation();

  if (user?.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  if (!user?.mustChangePassword && location.pathname === '/change-password') {
    return <Navigate to="/" replace />;
  }

  return children;
}

function RequireCapability({ capability, children }) {
  const { can } = useAuth();
  if (!can(capability)) return <Navigate to="/" replace />;
  return children;
}

function RedirectIfSignedIn({ children }) {
  const { user, initialising } = useAuth();
  const location = useLocation();

  if (initialising) return <AuthShellSkeleton />;
  if (user) {
    const target = user.mustChangePassword ? '/change-password' : location.state?.from?.pathname || '/';
    return <Navigate to={target} replace />;
  }

  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <RedirectIfSignedIn>
            <Login />
          </RedirectIfSignedIn>
        }
      />

      <Route
        path="/change-password"
        element={
          <RequireAuth>
            <ChangePassword />
          </RequireAuth>
        }
      />

      <Route
        element={
          <RequireAuth>
            <RequirePasswordChange>
              <Layout />
            </RequirePasswordChange>
          </RequireAuth>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/products" element={<Products />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/cash-book" element={<CashBook />} />
        <Route path="/cash-withdrawals" element={<Navigate to="/cash-book" replace />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/settings" element={<Settings />} />
        <Route
          path="/admin/users"
          element={
            <RequireCapability capability="users.manage">
              <AdminUsers />
            </RequireCapability>
          }
        />
        <Route
          path="/admin/businesses"
          element={
            <RequireCapability capability="settings.manage">
              <Businesses />
            </RequireCapability>
          }
        />
        <Route
          path="/admin/activity"
          element={
            <RequireCapability capability="audit.view">
              <AdminActivity />
            </RequireCapability>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  useEffect(() => {
    const unlock = () => unlockFeedbackAudio();
    // touchstart matters on iOS (pointer events alone are not always enough
    // to unlock Web Audio before the first toast).
    const opts = { once: true, passive: true };
    window.addEventListener('pointerdown', unlock, opts);
    window.addEventListener('touchstart', unlock, opts);
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <SettingsProvider>
              <PageTitleProvider>
                <ConfirmProvider>
                  <ScrollToTop />
                  <AppRoutes />
                  <InstallPrompt />
                  <AppToaster />
                </ConfirmProvider>
              </PageTitleProvider>
            </SettingsProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
