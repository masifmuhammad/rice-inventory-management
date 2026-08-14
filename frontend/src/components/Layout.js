import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Dialog, DialogBackdrop, DialogPanel } from '@headlessui/react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  FiActivity,
  FiBarChart2,
  FiBriefcase,
  FiDollarSign,
  FiHome,
  FiLogOut,
  FiMoon,
  FiPackage,
  FiSettings,
  FiSun,
  FiTrendingUp,
  FiUsers,
  FiX,
} from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useConfirm } from './ui/ConfirmProvider';
import usePrefetchRoute, { usePrefetchTabs } from '../hooks/usePrefetchRoute';
import BrandLogo from './BrandLogo';
import ErrorBoundary from './ErrorBoundary';
import BusinessSwitcher from './BusinessSwitcher';
import MobileTabBar from './MobileTabBar';
import MicPermissionPrompt from './MicPermissionPrompt';
import BusinessSwitchOverlay from './BusinessSwitchOverlay';
import AppHeader from './AppHeader';
import PageTransition from './PageTransition';
import ProfileSheet from './ProfileSheet';
import PullToRefresh from './PullToRefresh';
import { lazyPage } from '../utils/lazyPage';
import { usePrefersReducedMotion } from '../hooks/useMediaQuery';
import useDrawerEdgeSwipe from '../hooks/useDrawerEdgeSwipe';
import useTabSwipe from '../hooks/useTabSwipe';
import { iconSwap, springUI, withReducedMotion } from '../utils/motion';

const AssistantShell = lazyPage(() => import('./assistant/AssistantShell'), 'assistant');

export const NAVIGATION = [
  { name: 'Dashboard', href: '/', icon: FiHome, end: true },
  { name: 'Products', href: '/products', icon: FiPackage },
  { name: 'Transactions', href: '/transactions', icon: FiTrendingUp },
  { name: 'Cash Book', href: '/cash-book', icon: FiDollarSign },
  { name: 'Reports', href: '/reports', icon: FiBarChart2 },
  { name: 'Settings', href: '/settings', icon: FiSettings },
];

const ADMIN_NAV = [
  { name: 'Users', href: '/admin/users', icon: FiUsers, capability: 'users.manage' },
  { name: 'Activity log', href: '/admin/activity', icon: FiActivity, capability: 'audit.view' },
  { name: 'Businesses', href: '/admin/businesses', icon: FiBriefcase, capability: 'settings.manage' },
];

const linkClasses = ({ isActive }) =>
  [
    'group relative flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-sm font-medium min-h-[44px]',
    'transition-colors duration-150 ease-out',
    'active:scale-[0.98] motion-reduce:active:scale-100 transition-transform',
    isActive
      ? 'text-content dark:text-primary-400'
      : 'text-content-muted hover:text-content',
  ].join(' ');

function NavigationLinks({ onNavigate, sections, navId }) {
  const prefetch = usePrefetchRoute();
  const navigate = useNavigate();
  const location = useLocation();
  const reducedMotion = usePrefersReducedMotion();
  const pillTransition = withReducedMotion(springUI, reducedMotion);

  const handleNav = useCallback(
    (href, end) => (event) => {
      if (!onNavigate) return;

      event.preventDefault();
      onNavigate();

      const isCurrent = end ? location.pathname === href : location.pathname.startsWith(href);
      if (!isCurrent) navigate(href);
    },
    [location.pathname, navigate, onNavigate]
  );

  return (
    <nav className="flex-1 px-2.5 py-2 overflow-y-auto" aria-label="Main">
      {sections.map(({ label, items }, sectionIndex) => (
        <div key={label || `section-${sectionIndex}`} className={sectionIndex > 0 ? 'mt-5' : ''}>
          {label && (
            <p className="px-3.5 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-subtle/70">
              {label}
            </p>
          )}
          <div className="space-y-1">
            {items.map(({ name, href, icon: Icon, end }) => (
              <NavLink
                key={href}
                to={href}
                end={end}
                onClick={onNavigate ? handleNav(href, end) : undefined}
                onMouseEnter={() => prefetch(href)}
                onFocus={() => prefetch(href)}
                onTouchStart={() => prefetch(href)}
                className={linkClasses}
              >
                {({ isActive }) => (
                  <>
                    {/* Sliding solid thumb — same vocabulary as the mobile tab bar */}
                    {isActive && (
                      <motion.span
                        layoutId={`sidebar-active-thumb-${navId}`}
                        transition={pillTransition}
                        /* Shadow comes from .segmented-thumb; an inline one here
                           would override it and flatten the pill. */
                        className="absolute inset-0 rounded-2xl segmented-thumb"
                        aria-hidden="true"
                      />
                    )}
                    {!isActive && (
                      <span
                        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100
                          bg-hairline/[0.05] transition-opacity duration-150"
                        aria-hidden="true"
                      />
                    )}
                    <Icon
                      className="relative z-10 w-[18px] h-[18px] flex-shrink-0"
                      strokeWidth={isActive ? 2.3 : 1.9}
                      aria-hidden="true"
                    />
                    <span className="relative z-10 truncate">{name}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

function ThemeToggle({ preference, onCycle, isDark, reducedMotion }) {
  const label =
    preference === 'system' ? 'Theme: System' : preference === 'dark' ? 'Theme: Dark' : 'Theme: Light';

  return (
    <button
      type="button"
      onClick={onCycle}
      aria-label={`${label}. Click to change.`}
      className="w-full flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-2xl text-sm font-medium
        text-content-muted hover:bg-hairline/[0.05] hover:text-content transition-colors"
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={isDark ? 'sun' : 'moon'}
          initial={iconSwap.initial}
          animate={iconSwap.animate}
          exit={iconSwap.exit}
          transition={reducedMotion ? { duration: 0.12 } : iconSwap.transition}
          className="flex-shrink-0"
        >
          {isDark ? (
            <FiSun className="w-[18px] h-[18px]" aria-hidden="true" />
          ) : (
            <FiMoon className="w-[18px] h-[18px]" aria-hidden="true" />
          )}
        </motion.span>
      </AnimatePresence>
      <span className="truncate">{label}</span>
    </button>
  );
}

function SidebarFooter({ onSignOut, preference, onCycleTheme, isDark, reducedMotion }) {
  return (
    <div className="sidebar-dock space-y-0.5">
      <ThemeToggle
        preference={preference}
        onCycle={onCycleTheme}
        isDark={isDark}
        reducedMotion={reducedMotion}
      />

      <button
        type="button"
        onClick={onSignOut}
        className="w-full flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-2xl text-sm font-medium
          text-content-muted hover:bg-red-500/10 hover:text-red-500 transition-colors"
      >
        <FiLogOut className="w-[18px] h-[18px] flex-shrink-0" aria-hidden="true" />
        Sign out
      </button>
    </div>
  );
}

function SidebarBrandHeader({ onClose }) {
  // Mobile drawer: logo only — the business name dropdown lives in the header.
  // Desktop sidebar: logo + name dropdown in one place.
  const mobileDrawer = Boolean(onClose);

  return (
    /* h-16 matches the app header's height so the mark sits on the same line as
       the page title once the rail's 1rem top inset is accounted for. */
    <div className="flex items-center gap-2.5 h-16 px-3.5 sm:px-4 flex-shrink-0">
      <BrandLogo size={44} className="flex-shrink-0" />
      {!mobileDrawer && <BusinessSwitcher className="flex-1 min-w-0 text-left" />}
      {mobileDrawer && <span className="flex-1" />}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close navigation"
          className="-mr-1 p-2 rounded-2xl text-content-muted hover:bg-hairline/[0.06] hover:text-content min-h-[44px] min-w-[44px] transition-colors flex-shrink-0"
        >
          <FiX className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}

export default function Layout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const location = useLocation();
  const { logout, can, businessId } = useAuth();
  const { preference, setTheme, isDark } = useTheme();
  const confirm = useConfirm();
  const reducedMotion = usePrefersReducedMotion();
  const [contentPulse, setContentPulse] = useState(false);

  useEffect(() => {
    let timer;
    const handler = () => {
      setContentPulse(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setContentPulse(false), reducedMotion ? 180 : 600);
    };
    window.addEventListener('rim:business-changed', handler);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('rim:business-changed', handler);
    };
  }, [reducedMotion]);

  const navSections = useMemo(() => {
    const main = NAVIGATION.slice(0, 5);
    const admin = ADMIN_NAV.filter((item) => can(item.capability));
    const settings = [NAVIGATION[NAVIGATION.length - 1]];
    const sections = [{ label: 'Main', items: main }];
    if (admin.length) sections.push({ label: 'Admin', items: admin });
    sections.push({ label: null, items: settings });
    return sections;
  }, [can]);

  const cycleTheme = () => {
    const order = ['light', 'dark', 'system'];
    const next = order[(order.indexOf(preference) + 1) % order.length];
    setTheme(next);
  };

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);

  useDrawerEdgeSwipe({
    open: drawerOpen,
    onOpen: openDrawer,
    onClose: closeDrawer,
  });

  // Swipe left and right to move between the tab-bar pages. Disabled while the
  // drawer is open, which owns horizontal movement for as long as it is up.
  useTabSwipe({ enabled: !drawerOpen });

  // Every tab chunk warmed during idle time, so a swipe never waits on a fetch.
  usePrefetchTabs();

  useEffect(() => {
    if (!drawerOpen) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') closeDrawer();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen, closeDrawer]);

  const handleSignOut = async () => {
    const confirmed = await confirm({
      title: 'Sign out?',
      message: 'You will need to enter your email and password to get back in.',
      confirmLabel: 'Sign out',
      tone: 'danger',
    });
    if (confirmed) logout();
  };

  return (
    <div className="min-h-screen app-gradient">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      {/* Left-edge swipe target — helps phones claim the gesture before browser
          back. Deliberately has no `onClick` and no z-index: it only stakes a
          `touch-action` claim. With `z-20` and a click handler it sat above all
          page content for the full height of the viewport, so a tap in the
          leftmost 12px of any row, card or button opened the nav drawer instead
          of doing what the user aimed at. `useDrawerEdgeSwipe` owns the gesture
          itself, over a wider 28px zone. */}
      <div
        aria-hidden="true"
        className="lg:hidden fixed inset-y-0 left-0 w-3 pointer-events-none"
        style={{ touchAction: 'none' }}
      />

      <PullToRefresh />

      <ProfileSheet open={profileOpen} onClose={() => setProfileOpen(false)} />

      {/* One rail in both themes — dark used to be a flush full-height wall,
          which is why it read as a different app rather than a dark version. */}
      <aside
        className="hidden lg:flex lg:flex-col lg:fixed z-40
          lg:top-4 lg:bottom-4 lg:left-4 lg:w-[15.5rem]
          sidebar-surface rounded-card"
      >
        <SidebarBrandHeader />
        <NavigationLinks sections={navSections} navId="sidebar" />
        <SidebarFooter
          onSignOut={handleSignOut}
          preference={preference}
          onCycleTheme={cycleTheme}
          isDark={isDark}
          reducedMotion={reducedMotion}
        />
      </aside>

      <Dialog open={drawerOpen} onClose={closeDrawer} className="relative z-50 lg:hidden">
        <DialogBackdrop
          transition
          className="fixed inset-0 bg-black/50 backdrop-blur-sm transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
            data-[closed]:opacity-0 motion-reduce:duration-150"
        />

        <div className="fixed inset-0 overflow-hidden">
          <DialogPanel
            transition
            className="fixed inset-y-0 left-0 m-3 flex w-[min(17rem,calc(85vw-1.5rem))] flex-col drawer-surface
              rounded-card
              transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
              data-[closed]:-translate-x-full pt-[env(safe-area-inset-top)] motion-reduce:duration-150"
          >
            <SidebarBrandHeader onClose={closeDrawer} />
            <NavigationLinks sections={navSections} onNavigate={closeDrawer} navId="drawer" />
            <SidebarFooter
              onSignOut={handleSignOut}
              preference={preference}
              onCycleTheme={cycleTheme}
              isDark={isDark}
              reducedMotion={reducedMotion}
            />
          </DialogPanel>
        </div>
      </Dialog>

      <div className="lg:pl-[calc(15.5rem+2rem)]">
        <AppHeader
          onOpenDrawer={() => setDrawerOpen(true)}
          drawerOpen={drawerOpen}
          onOpenProfile={() => setProfileOpen(true)}
        />

        <main
          id="main-content"
          /* The bottom padding reserves the tab bar *and* the assistant button
             that floats above it — 5rem covers the button's 3.5rem plus its
             1.5rem gap. Without it the button sits on top of the last row of a
             short list, which is exactly where a delete control lives. */
          className={`px-4 sm:px-6 lg:px-7 py-5 sm:py-6 pb-[calc(var(--app-tabbar-height)+env(safe-area-inset-bottom)+5rem)] lg:pb-[max(1.5rem,env(safe-area-inset-bottom))] transition-opacity duration-500 ease-[cubic-bezier(0.2,0,0,1)] ${
            contentPulse ? 'opacity-70' : 'opacity-100'
          }`}
        >
          <ErrorBoundary resetKeys={[location.pathname, businessId]}>
            <PageTransition />
          </ErrorBoundary>
        </main>
      </div>

      <MobileTabBar />
      <MicPermissionPrompt />
      <BusinessSwitchOverlay />
      <Suspense fallback={null}>
        <AssistantShell />
      </Suspense>
    </div>
  );
}
