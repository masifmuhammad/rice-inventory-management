import React, { useEffect, useRef, useState } from 'react';
import { FiRefreshCw } from 'react-icons/fi';
import { feedbackTick } from '../utils/feedback';

/** How far the page must be pulled before releasing counts as a refresh. */
const THRESHOLD = 72;
/** Past this, extra pull barely moves the indicator — the rubber-band. */
const MAX = 120;

/**
 * Pull down at the top of a page to refresh it.
 *
 * Installed once in the layout rather than per page: it dispatches `rim:refresh`
 * and every `useApi` on screen refetches itself, keeping its previous data so
 * the page updates in place instead of flashing through skeletons.
 *
 * Only for standalone/touch use. In a browser tab Safari and Chrome already do
 * this themselves, and two competing pull gestures is worse than either.
 */
export default function PullToRefresh() {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const start = useRef(null);
  const armed = useRef(false);

  useEffect(() => {
    // The browser's own pull-to-refresh only exists in a normal tab. Adding ours
    // there would give the user two.
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (!standalone) return undefined;

    const onTouchStart = (event) => {
      // Only from a genuine resting position at the very top, and never while a
      // sheet is open over the page.
      if (window.scrollY > 0 || document.querySelector('[data-headlessui-portal]')) {
        start.current = null;
        return;
      }
      start.current = event.touches[0].clientY;
    };

    const onTouchMove = (event) => {
      if (start.current === null || busy) return;

      const delta = event.touches[0].clientY - start.current;
      if (delta <= 0) {
        setPull(0);
        return;
      }

      // Resist progressively, so the last few pixels feel like stretching
      // something rather than dragging it.
      const damped = Math.min(MAX, delta * 0.5);
      setPull(damped);

      if (damped >= THRESHOLD && !armed.current) {
        armed.current = true;
        feedbackTick();
      } else if (damped < THRESHOLD) {
        armed.current = false;
      }
    };

    const onTouchEnd = () => {
      if (start.current === null) return;
      const shouldRefresh = armed.current;
      start.current = null;
      armed.current = false;

      if (!shouldRefresh) {
        setPull(0);
        return;
      }

      setBusy(true);
      setPull(THRESHOLD);
      window.dispatchEvent(new CustomEvent('rim:refresh'));

      // No completion signal comes back from the queries, so the spinner runs
      // for a fixed beat. Long enough to read as work, short enough not to
      // outstay a fast refetch.
      // ponytail: fixed 700ms, wire to real request completion if it ever
      // reads as out of step with a slow connection.
      setTimeout(() => {
        setBusy(false);
        setPull(0);
      }, 700);
    };

    // Passive: this never calls preventDefault, so it cannot cost scroll
    // performance. Overscroll is already contained by CSS.
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [busy]);

  if (pull <= 0) return null;

  const progress = Math.min(1, pull / THRESHOLD);

  return (
    <div
      aria-hidden="true"
      className="lg:hidden fixed inset-x-0 z-30 flex justify-center pointer-events-none"
      style={{
        top: `calc(var(--app-header-height) + env(safe-area-inset-top))`,
        transform: `translateY(${pull - 32}px)`,
        // No transition while the finger is down — it should track the thumb
        // exactly; the ease only applies on release.
        transition: start.current === null ? 'transform 220ms cubic-bezier(0.16,1,0.3,1)' : 'none',
      }}
    >
      <span className="grid place-items-center w-9 h-9 rounded-full bg-surface-1 shadow-md border border-hairline/[0.08]">
        <FiRefreshCw
          className={`w-4 h-4 text-content-muted ${busy ? 'animate-spin' : ''}`}
          style={busy ? undefined : { transform: `rotate(${progress * 270}deg)`, opacity: 0.3 + progress * 0.7 }}
        />
      </span>
    </div>
  );
}
