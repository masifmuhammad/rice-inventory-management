import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/** The tab bar's own order — swiping should match what the bar shows. */
const TABS = ['/', '/products', '/transactions', '/cash-book'];

const indexOf = (pathname) =>
  TABS.findIndex((path) => (path === '/' ? pathname === '/' : pathname.startsWith(path)));

/** Travel before a horizontal drag counts as a page change rather than a stray finger. */
const DISTANCE = 60;
/** A flick this fast counts even if it did not travel far. */
const VELOCITY = 0.45;
/** How much more horizontal than vertical the movement has to be to be a swipe at all. */
const AXIS_BIAS = 1.6;

/**
 * Swipe left and right to move between the tab-bar pages.
 *
 * Deliberately event-based rather than a draggable page container. Dragging the
 * page would mean rendering the neighbouring routes to have something to drag
 * *to* — three extra pages mounted and fetching on every screen — and it would
 * fight the browser's own back-swipe at the edges. Committing on release gives
 * the same result for a fraction of the cost, and the incoming page already
 * slides in from the right direction.
 *
 * Bails out when the gesture starts anywhere that owns horizontal movement of
 * its own: a swipeable row, a scrollable pane, a modal, or a range input.
 */
export default function useTabSwipe({ enabled = true } = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const start = useRef(null);

  useEffect(() => {
    if (!enabled) return undefined;

    const onTouchStart = (event) => {
      if (event.touches.length !== 1) {
        start.current = null;
        return;
      }

      const target = event.target;
      const claimed =
        target instanceof Element &&
        target.closest('[data-swipeable], .scroll-x, [role="dialog"], input[type="range"], .segmented');

      // A sheet open over the page owns the whole screen while it is up.
      if (claimed || document.querySelector('[data-headlessui-portal]')) {
        start.current = null;
        return;
      }

      const touch = event.touches[0];
      start.current = { x: touch.clientX, y: touch.clientY, at: Date.now() };
    };

    const onTouchEnd = (event) => {
      const origin = start.current;
      start.current = null;
      if (!origin) return;

      const touch = event.changedTouches[0];
      if (!touch) return;

      const dx = touch.clientX - origin.x;
      const dy = touch.clientY - origin.y;

      // Vertical intent wins: this must never hijack a scroll.
      if (Math.abs(dx) < Math.abs(dy) * AXIS_BIAS) return;

      const elapsed = Math.max(1, Date.now() - origin.at);
      const velocity = Math.abs(dx) / elapsed;
      if (Math.abs(dx) < DISTANCE && velocity < VELOCITY) return;

      const current = indexOf(location.pathname);
      if (current < 0) return; // a drawer route has no neighbours

      // Swiping left moves forward, the way pages advance.
      const next = current + (dx < 0 ? 1 : -1);
      if (next < 0 || next >= TABS.length) return;

      navigate(TABS[next]);
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', () => {
      start.current = null;
    }, { passive: true });

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [enabled, location.pathname, navigate]);
}
