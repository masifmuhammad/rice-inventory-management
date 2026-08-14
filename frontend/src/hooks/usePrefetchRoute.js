import { useCallback, useEffect, useRef } from 'react';

/**
 * Warms a lazy route's chunk before the click happens.
 *
 * A pointer arriving at a link, or a keyboard focus landing on it, is a strong
 * signal of intent — and gives us ~200-300ms of head start. By the time the
 * click lands the chunk is usually already parsed, so the page swaps instantly
 * instead of flashing a loader.
 */
const importers = {
  '/': () => import('../pages/Dashboard'),
  '/products': () => import('../pages/Products'),
  '/transactions': () => import('../pages/Transactions'),
  '/cash-book': () => import('../pages/CashBook'),
  '/reports': () => import('../pages/Reports'),
  '/settings': () => import('../pages/Settings'),
  '/admin/users': () => import('../pages/AdminUsers'),
  '/admin/activity': () => import('../pages/AdminActivity'),
  '/admin/businesses': () => import('../pages/Businesses'),
};

/** The routes the tab bar and swipe gesture can reach. */
export const TAB_ROUTES = ['/', '/products', '/transactions', '/cash-book'];

/**
 * Warms every tab chunk once the app has gone quiet.
 *
 * Hovering a link gives a head start; a swipe gives none — the gesture ends and
 * the navigation happens in the same frame. So the first swipe to each tab was
 * fetching and parsing a chunk *while* the page was animating in, which is
 * exactly the stutter it looks like. Four small chunks fetched during idle time
 * removes it for the rest of the session.
 */
export function usePrefetchTabs() {
  useEffect(() => {
    const warm = () => {
      TAB_ROUTES.forEach((path) => importers[path]?.().catch(() => {}));
    };

    // Idle time only: never compete with the first paint or the initial data.
    const id = window.requestIdleCallback
      ? window.requestIdleCallback(warm, { timeout: 4000 })
      : setTimeout(warm, 2500);

    return () => {
      if (window.cancelIdleCallback) window.cancelIdleCallback(id);
      else clearTimeout(id);
    };
  }, []);
}

export default function usePrefetchRoute() {
  // Each chunk is fetched at most once per session.
  const requested = useRef(new Set());

  return useCallback((path) => {
    const load = importers[path];
    if (!load || requested.current.has(path)) return;

    requested.current.add(path);
    // Failure is silent on purpose: this is an optimisation, and the real
    // navigation will surface any genuine loading error through Suspense.
    load().catch(() => requested.current.delete(path));
  }, []);
}
