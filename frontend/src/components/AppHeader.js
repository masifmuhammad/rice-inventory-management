import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  FiArrowDownLeft,
  FiArrowUpRight,
  FiMenu,
  FiPackage,
  FiPlus,
  FiTrendingUp,
  FiShoppingBag,
} from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { useShopMode } from '../context/ShopModeContext';
import { usePageTitle } from '../context/PageTitleContext';
import { usePrefersReducedMotion } from '../hooks/useMediaQuery';
import { springSnappy, reducedTransition } from '../utils/motion';
import NotificationPanel from './NotificationPanel';
import UserAvatar from './UserAvatar';
import BusinessSwitcher from './BusinessSwitcher';
import LanguagePicker from './LanguagePicker';
import { Input } from './ui/Field';
import { translate, useAppLanguage } from '../context/LanguageContext';

function HeaderSearch() {
  useAppLanguage();
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  const submit = (event) => {
    event.preventDefault();
    navigate('/products', { state: { search: query.trim() } });
  };

  return (
    <form onSubmit={submit} className="hidden xl:block relative min-w-[12rem] w-[min(18rem,28vw)]">
      <Input label={translate("Search products")} enterKeyHint="search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={translate("Search anything…")}
        aria-label={translate("Search products")}

      />
    </form>
  );
}

function HeaderCreate({ can }) {
  useAppLanguage();
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
        <FiPlus className="w-4 h-4" strokeWidth={2.5} aria-hidden="true" />{translate("Create")}</button>

      <AnimatePresence>
        {open && (
          <motion.ul
            role="menu"
            aria-label={translate("Create")}
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
                    {translate(action.label)}
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
 * Mobile lets the business name share the available space with touch controls.
 */
export default function AppHeader({ onOpenDrawer, drawerOpen, onOpenProfile }) {
  useAppLanguage();
  const { user, can } = useAuth();
  const shopMode = useShopMode();
  const navigate = useNavigate();
  const { title: pageTitle, summary, collapsed } = usePageTitle();

  return (
    /* No rule under the header — the reference lets it sit flush on the canvas.
       lg:pt-4 gives the header the same top inset as the floating sidebar rail,
       which is what puts the page title and the brand mark on one line. */
    <header className="sticky top-0 z-30 chrome-blur pt-[env(safe-area-inset-top)] lg:pt-4">
      <div className="app-header-row relative h-[3.75rem] sm:h-16 flex items-center gap-3 px-3 sm:px-6">
        <div className="app-header-leading z-10 flex items-center gap-2 min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpenDrawer}
            aria-label={translate("Open navigation menu")}
            aria-expanded={drawerOpen}
            className="lg:hidden -ml-1 p-2.5 rounded-full text-content-muted hover:bg-hairline/[0.06] hover:text-content transition-colors min-h-[44px] min-w-[44px] grid place-items-center"
          >
            <FiMenu className="w-5 h-5" aria-hidden="true" />
          </button>

          {pageTitle ? (
            <div className="hidden lg:block min-w-0">
              <h1 className="font-display text-title text-content truncate">{translate(pageTitle)}</h1>
              {collapsed && summary && <p className="text-xs text-content-muted truncate mt-0.5" title={translate(summary)}>{translate(summary)}</p>}
            </div>
          ) : null}
        </div>

        <div className="mobile-header-brand lg:hidden min-w-0 flex-1">
          {collapsed ? (
            <div className="min-w-0 text-start" data-testid="compact-page-header">
              {/* Two lines at most: stacking every summary part overflowed the
                  60px bar onto the page below. The summary is one quiet line
                  that truncates; the page itself repeats the full figures. */}
              <p className="text-[16px] leading-5 font-semibold tracking-tight text-content truncate">{translate(pageTitle)}</p>
              {summary && <p className="text-[12px] leading-4 text-content-muted truncate tabular-nums" title={translate(summary)}>{translate(summary.split(' | ').join(' · '))}</p>}
            </div>
          ) : <BusinessSwitcher className="min-w-0" />}
        </div>

        <div className="app-header-actions z-10 flex items-center gap-2 sm:gap-2.5 flex-shrink-0 justify-end">
          {!shopMode.enabled && <><HeaderSearch /><HeaderCreate can={can} /></>}
          <button type="button" aria-label={translate('Shop mode')} aria-pressed={shopMode.enabled}
            disabled={shopMode.enabled && shopMode.pending}
            title={translate(shopMode.enabled ? 'Switch to full mode' : 'Switch to Shop mode')}
            onClick={() => { shopMode.setEnabled(!shopMode.enabled); navigate('/'); }}
            className={`shop-mode-toggle ${shopMode.enabled ? 'is-active' : ''}`}>
            <FiShoppingBag aria-hidden="true" /><span className="hidden lg:inline">{translate('Shop mode')}</span>
          </button>
          <LanguagePicker />
          {!shopMode.enabled && <NotificationPanel variant="circle" />}
          {/* Theme switching lives in the sidebar footer only — the reference
              keeps this corner to search, create, alerts and account. */}
          <button
            type="button"
            onClick={onOpenProfile}
            className="grid place-items-center min-h-[44px] min-w-[44px] rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base"
            title={translate("Your profile")}
            aria-label={translate("Your profile — {0}", [user?.name || 'Account'])}
          >
            <UserAvatar name={user?.name} avatar={user?.avatar} size="sm" />
          </button>
        </div>
      </div>
    </header>
  );
}
