import React, { Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { AuthProvider, useAuth } from './context/AuthContext';
import { SettingsProvider } from './context/SettingsContext';
import { ThemeProvider } from './context/ThemeContext';
import { LanguageProvider } from './context/LanguageContext';
import { PageTitleProvider } from './context/PageTitleContext';
import ConfirmProvider from './components/ui/ConfirmProvider';
import ErrorBoundary from './components/ErrorBoundary';
import ScrollToTop from './components/ScrollToTop';
import AppToaster from './components/AppToaster';
import Layout from './components/Layout';
import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import InstallPrompt from './components/InstallPrompt';
import ConnectionStatus from './components/ConnectionStatus';
import MobileViewport from './components/MobileViewport';
import AuthShellSkeleton from './components/skeletons/AuthShellSkeleton';
import { lazyPage } from './utils/lazyPage';
import { unlockFeedbackAudio } from './utils/feedback';
import { translate, useAppLanguage } from './context/LanguageContext';

const Landing = lazyPage(() => import('./pages/Landing'), '999');
const Dashboard = lazyPage(() => import('./pages/Dashboard'), 'dashboard');
const Products = lazyPage(() => import('./pages/Products'), 'products page');
const Barcodes = lazyPage(() => import('./pages/Barcodes'), 'scan and labels');
const Transactions = lazyPage(() => import('./pages/Transactions'), 'transactions page');
const CashBook = lazyPage(() => import('./pages/CashBook'), 'cash book');
const Credit = lazyPage(() => import('./pages/Credit'), 'customer credit');
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

// Keep the established dashboard URL for signed-in staff. The public identity
// is also available at /welcome, including while a staff session is active.
function HomeEntry() {
  const { user, initialising } = useAuth();
  if (initialising) return <AuthShellSkeleton />;
  return user ? <RequirePasswordChange><Layout /></RequirePasswordChange> : <PublicLanding />;
}

function PublicLanding() {
  useAppLanguage();
  return <Suspense fallback={<div role="status" aria-label={translate("Loading 999")} style={{ minHeight: '100svh', background: '#e8e7e4' }} />}><Landing /></Suspense>;
}

function InventoryEntry() {
  const { user, initialising } = useAuth();
  if (initialising) return <AuthShellSkeleton />;
  return <Navigate to={user ? '/' : '/login'} replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomeEntry />}><Route index element={<Dashboard />} /></Route>
      <Route path="/welcome" element={<PublicLanding />} />
      <Route path="/inventory" element={<InventoryEntry />} />
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
        <Route path="/products" element={<Products />} />
        <Route path="/barcodes" element={<RequireCapability capability="products.view"><Barcodes /></RequireCapability>} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/cash-book" element={<RequireCapability capability="cash.view"><CashBook /></RequireCapability>} />
        <Route path="/credit" element={<RequireCapability capability="credit.view"><Credit /></RequireCapability>} />
        <Route path="/cash-withdrawals" element={<Navigate to="/cash-book" replace />} />
        <Route path="/reports" element={<RequireCapability capability="reports.view"><Reports /></RequireCapability>} />
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
        <LanguageProvider>
        <ThemeProvider>
          <AuthProvider>
            <SettingsProvider>
              <PageTitleProvider>
                <ConfirmProvider>
                  <ScrollToTop />
                  <MobileViewport />
                  <AppRoutes />
                  <ConnectionStatus />
                  <InstallPrompt />
                  <AppToaster />
                </ConfirmProvider>
              </PageTitleProvider>
            </SettingsProvider>
          </AuthProvider>
        </ThemeProvider>
        </LanguageProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
