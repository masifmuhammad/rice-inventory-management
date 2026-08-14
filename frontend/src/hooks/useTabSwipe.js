import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/** The tab bar's own order — swiping should match what the bar shows. */
const TABS = ['/', '/products', '/transactions', '/cash-book'];

const indexOf = (pathname) =>
  TABS.findIndex((path) => (path === '/' ? pathname === '/' : pathname.startsWith(path)));

/**
 * Travel before a horizontal drag counts as a page change.
 *
 * Deliberately long. Changing page under someone who meant to scroll is far
 * more annoying than a swipe that needs repeating, so this errs toward
 * requiring intent.
 */
const DISTANCE = 96;
/** A flick this fast counts even if it did not travel far. */
const VELOCITY = 0.6;
/** How much more horizontal than vertical the movement has to be to be a swipe at all. */
const AXIS_BIAS = 2;

/**
 * Neither screen edge belongs to this gesture.
 *
 * The left 28px is the drawer's, matching `useDrawerEdgeSwipe` — a rightward
 * swipe from there opens navigation, and claiming it here meant one gesture
 * both opened the drawer and changed tab. In a browser tab that same zone is
 * also where iOS runs its own back-swipe, so a right swipe there really did
 * "go to the previous page". Both edges are now left alone.
 */
const EDGE_PX = 28;

/**
 * Below this the gesture is a tap, however fast it was.
 *
 * Comfortably above the few pixels a thumb rolls while pressing a button, and
 * below anything a person would consider a swipe.
 */
const MIN_TRAVEL = 44;

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
        target.closest(
          // `[role="listbox"]` matters even though the picker sits inside a
          // dialog: it portals to the body, so it is not a DOM descendant of
          // anything else here and would otherwise be seen as bare page.
          '[data-swipeable], .scroll-x, [role="dialog"], [role="listbox"], [data-headlessui-portal], input[type="range"], .segmented'
        );

      // A sheet open over the page owns the whole screen while it is up.
      if (claimed || document.querySelector('[data-headlessui-portal]')) {
        start.current = null;
        return;
      }

      const touch = event.touches[0];

      // Both screen edges belong to someone else — see EDGE_PX.
      const width = window.innerWidth;
      if (touch.clientX <= EDGE_PX || touch.clientX >= width - EDGE_PX) {
        start.current = null;
        return;
      }

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

      /**
       * A tap is not a swipe, whatever the arithmetic says.
       *
       * This gate was missing and it broke every button in the app. Velocity is
       * distance over time, and a tap is a tiny distance over a tiny time — six
       * pixels of thumb roll in eight milliseconds computes to 0.75, sailing
       * past the flick threshold. So tapping a button navigated to the next tab
       * instead, which is indistinguishable from "the buttons do not work".
       *
       * A flick has to actually travel before its speed means anything.
       */
      if (Math.abs(dx) < MIN_TRAVEL) return;

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
