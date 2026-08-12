import { useCallback, useRef } from 'react';

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
