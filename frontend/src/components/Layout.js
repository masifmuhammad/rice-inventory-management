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
  FiMenu,
  FiMoon,
  FiPackage,
  FiSettings,
  FiSun,
  FiTrendingUp,
  FiUsers,
  FiX,
} from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useTheme } from '../context/ThemeContext';
import { useConfirm } from './ui/ConfirmProvider';
import usePrefetchRoute from '../hooks/usePrefetchRoute';
import BrandLogo from './BrandLogo';
import ErrorBoundary from './ErrorBoundary';
import BusinessSwitcher from './BusinessSwitcher';
import NotificationPanel from './NotificationPanel';
import MobileTabBar from './MobileTabBar';
import PageTransition from './PageTransition';
import ProfileSheet from './ProfileSheet';
import UserAvatar from './UserAvatar';
import { lazyPage } from '../utils/lazyPage';
import { usePrefersReducedMotion } from '../hooks/useMediaQuery';
import { iconSwap, springSnappy } from '../utils/motion';

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
    'group relative flex items-center gap-3 px-3 py-2.5 rounded-well text-sm font-medium min-h-[44px]',
    'transition-colors duration-150',
    isActive
      ? 'bg-primary-500/12 text-primary-600 dark:text-primary-400'
      : 'text-content-muted hover:bg-hairline/[0.05] hover:text-content',
  ].join(' ');

function NavigationLinks({ onNavigate, sections, navId }) {
  const prefetch = usePrefetchRoute();
  const navigate = useNavigate();
  const location = useLocation();
  const reducedMotion = usePrefersReducedMotion();

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
    <nav className="flex-1 px-3 py-3 overflow-y-auto" aria-label="Main">
      {sections.map(({ label, items }, sectionIndex) => (
        <div key={label || `section-${sectionIndex}`} className={sectionIndex > 0 ? 'mt-4' : ''}>
          {label && (
            <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-content-subtle/80">
              {label}
            </p>
          )}
          <div className="space-y-0.5">
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
                    {/* One rail per nav instance slides between links. Centred with
                        `my-auto` rather than `-translate-y-1/2`, because a transform
                        class on a `layoutId` element is overwritten by projection.
                        `navId` keeps the sidebar and drawer copies from claiming
                        the same shared element while both are mounted. */}
                    {isActive && (
                      <motion.span
                        layoutId={`sidebar-active-${navId}`}
                        transition={reducedMotion ? { duration: 0 } : springSnappy}
                        className="absolute left-0 inset-y-0 my-auto w-0.5 h-5 rounded-full bg-primary-500"
                        aria-hidden="true"
                      />
                    )}
                    <Icon
                      className="w-[18px] h-[18px] flex-shrink-0"
                      strokeWidth={isActive ? 2.3 : 1.9}
                      aria-hidden="true"
                    />
                    <span className="truncate">{name}</span>
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
      className="w-full flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-well text-sm font-medium
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
    <div className="px-3 py-3 border-t border-hairline/[0.07] bg-surface-sunken/30 space-y-1">
      <ThemeToggle
        preference={preference}
        onCycle={onCycleTheme}
        isDark={isDark}
        reducedMotion={reducedMotion}
      />

      <button
        type="button"
        onClick={onSignOut}
        className="w-full flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-well text-sm font-medium
          text-content-muted hover:bg-red-500/10 hover:text-red-500 transition-colors"
      >
        <FiLogOut className="w-[18px] h-[18px] flex-shrink-0" aria-hidden="true" />
        Sign out
      </button>
    </div>
  );
}

export default function Layout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const location = useLocation();
  const { user, logout, can } = useAuth();
  const { businessName } = useSettings();
  const { preference, setTheme, isDark } = useTheme();
  const confirm = useConfirm();
  const reducedMotion = usePrefersReducedMotion();

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

      <ProfileSheet open={profileOpen} onClose={() => setProfileOpen(false)} />

      <aside className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:w-64 sidebar-surface border-r border-hairline/[0.07]">
        <div className="flex items-center gap-3 h-14 px-4 border-b border-hairline/[0.07] sidebar-gradient">
          <BrandLogo size={32} />
          <span className="font-display font-semibold text-content text-sm leading-tight line-clamp-2">
            {businessName}
          </span>
        </div>
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
            data-[closed]:opacity-0 data-[closed]:backdrop-blur-none motion-reduce:duration-150"
        />

        <div className="fixed inset-0 overflow-hidden">
          <DialogPanel
            transition
            className="fixed inset-y-0 left-0 flex w-[min(17rem,85vw)] flex-col bg-surface-1 shadow-2xl
              transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
              data-[closed]:-translate-x-full pt-[env(safe-area-inset-top)] motion-reduce:duration-150"
          >
            <div className="flex items-center justify-between gap-2 h-14 px-4 border-b border-hairline/[0.07] sidebar-gradient">
              <div className="flex items-center gap-3 min-w-0">
                <BrandLogo size={32} />
                <span className="font-display font-semibold text-content text-sm truncate">
                  {businessName}
                </span>
              </div>
              <button
                type="button"
                onClick={closeDrawer}
                aria-label="Close navigation"
                className="-mr-2 p-2 rounded-well text-content-muted hover:bg-hairline/[0.06] hover:text-content min-h-[44px] min-w-[44px] transition-colors"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>
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

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 chrome-blur border-b border-hairline/[0.07] pt-[env(safe-area-inset-top)]">
          <div className="relative h-14 flex items-center justify-between px-3 sm:px-6">
            <div className="z-10 flex items-center min-w-[44px]">
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                aria-label="Open navigation menu"
                aria-expanded={drawerOpen}
                className="lg:hidden -ml-1 p-2.5 rounded-well text-content-muted hover:bg-hairline/[0.06] hover:text-content transition-colors min-h-[44px] min-w-[44px] grid place-items-center"
              >
                <FiMenu className="w-5 h-5" aria-hidden="true" />
              </button>
              <div className="hidden lg:flex items-center min-w-0">
                <BusinessSwitcher className="text-left" />
              </div>
            </div>

            <div className="lg:hidden absolute inset-x-0 flex justify-center items-center gap-2 px-[4.5rem] pointer-events-none">
              <BrandLogo size={28} className="flex-shrink-0 pointer-events-none" />
              <BusinessSwitcher className="pointer-events-auto min-w-0 max-w-[11rem]" centered />
            </div>

            <div className="z-10 flex items-center gap-0.5 flex-shrink-0 min-w-[44px] justify-end">
              <NotificationPanel />

              <button
                type="button"
                onClick={() => setProfileOpen(true)}
                className="flex items-center gap-2 px-1.5 sm:px-2 py-1.5 rounded-well hover:bg-hairline/[0.06] transition-colors min-h-[44px]"
                title="Your profile"
                aria-label={`Your profile — ${user?.name || 'Account'}`}
              >
                <UserAvatar name={user?.name} avatar={user?.avatar} size="xs" />
                <span className="hidden lg:inline text-sm text-content-muted max-w-[12rem] truncate">
                  {user?.name}
                </span>
              </button>
            </div>
          </div>
        </header>

        <main
          id="main-content"
          className="px-4 sm:px-6 py-5 sm:py-6 pb-[calc(var(--app-tabbar-height)+env(safe-area-inset-bottom))] lg:pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        >
          <ErrorBoundary resetKeys={[location.pathname]}>
            <PageTransition />
          </ErrorBoundary>
        </main>
      </div>

      <MobileTabBar />
      <Suspense fallback={null}>
        <AssistantShell />
      </Suspense>
    </div>
  );
}
