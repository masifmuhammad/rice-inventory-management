import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  FiArrowDownLeft,
  FiArrowUpRight,
  FiMenu,
  FiPackage,
  FiPlus,
  FiSearch,
  FiTrendingUp,
} from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { usePageTitle } from '../context/PageTitleContext';
import { usePrefersReducedMotion } from '../hooks/useMediaQuery';
import { springSnappy, reducedTransition } from '../utils/motion';
import NotificationPanel from './NotificationPanel';
import UserAvatar from './UserAvatar';
import BusinessSwitcher from './BusinessSwitcher';

function HeaderSearch() {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  const submit = (event) => {
    event.preventDefault();
    navigate('/products', { state: { search: query.trim() } });
  };

  return (
    <form onSubmit={submit} className="hidden md:block relative min-w-[12rem] w-[min(18rem,28vw)]">
      <FiSearch
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-content-subtle"
        aria-hidden="true"
      />
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search anything…"
        aria-label="Search products"
        className="w-full h-10 pl-10 pr-4 rounded-full text-caption text-content
          placeholder:text-content-subtle
          bg-surface-1
          border border-hairline/[0.06]
          focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500/40
          transition-[border-color,box-shadow] duration-150"
      />
    </form>
  );
}

function HeaderCreate({ can }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  const reducedMotion = usePrefersReducedMotion();

  const actions = [
    can('products.manage')
      ? { id: 'product', label: 'Product', icon: FiPackage, to: '/products', state: { openCreate: true } }
      : null,
    can('transactions.create')
      ? {
          id: 'sale',
          label: 'Transaction',
          icon: FiTrendingUp,
          to: '/transactions',
          state: { openCreate: true },
        }
      : null,
    can('cash.manage')
      ? { id: 'in', label: 'Money in', icon: FiArrowDownLeft, to: '/cash-book', state: { openCreate: 'in' } }
      : null,
    can('cash.manage')
      ? { id: 'out', label: 'Money out', icon: FiArrowUpRight, to: '/cash-book', state: { openCreate: 'out' } }
      : null,
  ].filter(Boolean);

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!actions.length) return null;

  const go = (action) => {
    setOpen(false);
    navigate(action.to, { state: action.state });
  };

  const popFrom = reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 };
  const popTo = reducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 };

  return (
    <div ref={ref} className="relative hidden sm:block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full
          bg-gray-800 text-white text-caption font-semibold
          dark:bg-white dark:text-gray-900
          hover:bg-gray-700 dark:hover:bg-gray-100
          active:scale-[0.96] motion-reduce:active:scale-100
          transition-[background-color,transform] duration-150
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      >
        <FiPlus className="w-4 h-4" strokeWidth={2.5} aria-hidden="true" />
        Create
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            role="menu"
            aria-label="Create"
            initial={popFrom}
            animate={popTo}
            exit={popFrom}
            transition={reducedMotion ? reducedTransition : springSnappy}
            className="absolute right-0 mt-2 w-48 rounded-2xl border border-hairline/[0.06]
              bg-surface-1 dark:bg-surface-2 py-1.5 z-50 origin-top-right
              shadow-[0_12px_32px_-12px_rgb(0_0_0/0.18)]
              dark:shadow-[0_12px_40px_-8px_rgb(0_0_0/0.55)]"
          >
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <li key={action.id} role="none">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => go(action)}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-content-muted
                      hover:bg-hairline/[0.05] hover:text-content min-h-[44px]"
                  >
                    <Icon className="w-4 h-4" aria-hidden="true" />
                    {action.label}
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Desktop chrome: big title left; search, create, circular actions right.
 * Mobile keeps the brand switcher centered.
 */
export default function AppHeader({ onOpenDrawer, drawerOpen, onOpenProfile }) {
  const { user, can } = useAuth();
  const { title: pageTitle } = usePageTitle();

  return (
    /* No rule under the header — the reference lets it sit flush on the canvas.
       lg:pt-4 gives the header the same top inset as the floating sidebar rail,
       which is what puts the page title and the brand mark on one line. */
    <header className="sticky top-0 z-30 chrome-blur pt-[env(safe-area-inset-top)] lg:pt-4">
      <div className="relative h-[3.75rem] sm:h-16 flex items-center gap-3 px-3 sm:px-6">
        <div className="z-10 flex items-center gap-2 min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpenDrawer}
            aria-label="Open navigation menu"
            aria-expanded={drawerOpen}
            className="lg:hidden -ml-1 p-2.5 rounded-full text-content-muted hover:bg-hairline/[0.06] hover:text-content transition-colors min-h-[44px] min-w-[44px] grid place-items-center"
          >
            <FiMenu className="w-5 h-5" aria-hidden="true" />
          </button>

          {pageTitle ? (
            <h1 className="hidden lg:block font-display text-title text-content truncate">
              {pageTitle}
            </h1>
          ) : null}
        </div>

        {/* The reserved side gutters have to clear the right-hand cluster, which
            is bell (40) + gap (8) + avatar (36) + padding (12) ≈ 96px. At 4.5rem
            the centred business name ran under the bell — and that cluster is
            `z-10`, so it painted over the name and read as the name being cut
            off mid-word. */}
        {/* `z-20` is load-bearing, not decoration. The left block beside this is
            `flex-1 z-10`, so on a phone — where its <h1> is hidden and only the
            hamburger occupies it — it stretches across the middle of the header
            and sits directly on top of this one. The switcher still *painted*,
            because it is absolutely positioned, but every tap landed on that
            invisible block instead: a visible dropdown chevron that did nothing.
            Raising this above the two z-10 siblings puts the button back in
            front for hit-testing. The wrapper stays `pointer-events-none`, so it
            never steals taps meant for the hamburger or the bell. */}
        <div className="lg:hidden absolute inset-x-0 z-20 flex justify-center px-[7rem] pointer-events-none">
          <BusinessSwitcher className="pointer-events-auto min-w-0 max-w-[14rem]" centered showLogo />
        </div>

        <div className="z-10 flex items-center gap-2 sm:gap-2.5 flex-shrink-0 justify-end">
          <HeaderSearch />
          <HeaderCreate can={can} />
          <NotificationPanel variant="circle" />
          {/* Theme switching lives in the sidebar footer only — the reference
              keeps this corner to search, create, alerts and account. */}
          <button
            type="button"
            onClick={onOpenProfile}
            className="grid place-items-center min-h-[44px] min-w-[44px] rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base"
            title="Your profile"
            aria-label={`Your profile — ${user?.name || 'Account'}`}
          >
            <UserAvatar name={user?.name} avatar={user?.avatar} size="sm" />
          </button>
        </div>
      </div>
    </header>
  );
}
