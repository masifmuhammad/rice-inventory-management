import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { formatDistanceToNow, format } from 'date-fns';
import { FiBell, FiX } from 'react-icons/fi';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { usePrefersReducedMotion } from '../hooks/useMediaQuery';
import { springSnappy, reducedTransition } from '../utils/motion';
import Badge from './ui/Badge';

const LAST_SEEN_KEY = 'rim.notifications.lastSeen';

const activityLink = (entry) => {
  if (entry.action === 'REGISTER_REQUEST' || entry.action?.includes('USER')) return '/admin/users';
  if (entry.resourceType === 'PRODUCT') return '/products';
  if (entry.resourceType === 'TRANSACTION') return '/transactions';
  if (entry.resourceType === 'CASH_ENTRY') return '/cash-book';
  if (entry.resourceType === 'SETTINGS' || entry.resourceType === 'BUSINESS') return '/admin/businesses';
  return '/';
};

export default function NotificationPanel({ variant = 'default' }) {
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ pendingCount: 0, recentActivity: [], pendingUsers: [] });
  const [badge, setBadge] = useState(0);
  const panelRef = useRef(null);
  const buttonRef = useRef(null);
  const reducedMotion = usePrefersReducedMotion();

  // The panel grows from the corner nearest the bell, so it reads as coming from
  // the button rather than arriving out of nowhere.
  const popoverFrom = reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 };
  const popoverTo = reducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 };
  const popoverTransition = reducedMotion ? reducedTransition : springSnappy;

  const fetchNotifications = async () => {
    try {
      const lastSeen = localStorage.getItem(LAST_SEEN_KEY);
      const { data: payload } = await api.get('/admin/notifications', {
        params: lastSeen ? { since: lastSeen } : {},
      });
      setData(payload);
      const unread = lastSeen
        ? (payload.recentActivity?.length || 0) + (payload.pendingCount > 0 ? 1 : 0)
        : (payload.pendingCount || 0) + (payload.recentActivity?.length || 0);
      setBadge(unread);
    } catch {
      /* silent */
    }
  };

  useEffect(() => {
    if (!can('users.manage')) return undefined;

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    const onFocus = () => fetchNotifications();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [can]);

  useEffect(() => {
    if (!open) return undefined;

    localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
    setBadge(0);

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    panelRef.current?.focus();

    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  if (!can('users.manage')) return null;

  const items = [
    ...(data.pendingUsers || []).map((u) => ({
      id: `pending-${u.id}`,
      summary: `${u.name} requested access`,
      userName: u.name,
      createdAt: u.createdAt,
      href: '/admin/users',
      tone: 'warning',
    })),
    ...(data.recentActivity || []).map((entry) => ({
      id: entry.id,
      summary: entry.summary || entry.action,
      userName: entry.userName,
      createdAt: entry.createdAt,
      href: activityLink(entry),
      tone: 'default',
    })),
  ];

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${badge ? `, ${badge} unread` : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={
          variant === 'circle'
            ? 'relative grid place-items-center w-10 h-10 rounded-full bg-surface-1 border border-hairline/[0.06] text-content-muted hover:text-content hover:border-hairline/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500'
            : 'relative p-2.5 rounded-lg text-content-subtle hover:bg-hairline/[0.05] transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center'
        }
      >
        <FiBell className="w-[18px] h-[18px]" aria-hidden="true" />
        {badge > 0 && (
          <span
            className={
              variant === 'circle'
                ? 'absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-surface-2'
                : 'absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center'
            }
          >
            {variant === 'circle' ? <span className="sr-only">{badge} unread</span> : badge > 9 ? '9+' : badge}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-40 lg:hidden"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="notifications-title"
              tabIndex={-1}
              initial={popoverFrom}
              animate={popoverTo}
              exit={popoverFrom}
              transition={popoverTransition}
              className="fixed inset-x-3 top-[calc(var(--app-header-height)+env(safe-area-inset-top)+0.5rem)] z-50 max-h-[min(70vh,28rem)] overflow-hidden rounded-2xl border border-hairline/[0.07] bg-surface-1 shadow-xl flex flex-col origin-top
                lg:absolute lg:inset-x-auto lg:right-0 lg:top-full lg:mt-2 lg:w-96 lg:max-h-[28rem] lg:origin-top-right"
            >
            <div className="flex items-center justify-between px-4 py-3 border-b border-hairline/[0.07]">
              <h2 id="notifications-title" className="text-sm font-semibold text-content">
                Recent activity
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close notifications"
                className="p-2 rounded-lg hover:bg-hairline/[0.05]"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1" aria-live="polite">
              {items.length === 0 ? (
                <p className="px-4 py-8 text-sm text-center text-content-subtle">No recent changes</p>
              ) : (
                <ul className="divide-y divide-hairline">
                  {items.slice(0, 25).map((item) => (
                    <li key={item.id}>
                      <Link
                        to={item.href}
                        onClick={() => setOpen(false)}
                        className="block px-4 py-3 hover:bg-hairline/[0.05] transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm text-content">{item.summary}</p>
                          {item.tone === 'warning' && <Badge tone="warning">Pending</Badge>}
                        </div>
                        <p className="text-xs text-content-subtle mt-1">
                          {item.userName}
                          {item.createdAt && (
                            <>
                              {' · '}
                              <time dateTime={item.createdAt} title={format(new Date(item.createdAt), 'PPpp')}>
                                {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                              </time>
                            </>
                          )}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {can('audit.view') && (
              <div className="border-t border-hairline/[0.06] px-4 py-3">
                <Link
                  to="/admin/activity"
                  onClick={() => setOpen(false)}
                  className="block text-center text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                >
                  View full activity log
                </Link>
              </div>
            )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
