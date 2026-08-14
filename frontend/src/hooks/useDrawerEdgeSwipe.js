import { useEffect, useRef } from 'react';

const EDGE_PX = 28;
const OPEN_PX = 64;
const CLOSE_PX = 72;
const ANGLE_LOCK = 1.15; // horizontal must beat vertical

/**
 * Phone-only: swipe in from the left edge to open the nav drawer (instead of
 * the browser's back gesture), and swipe the open drawer left to close it.
 */
export default function useDrawerEdgeSwipe({ open, onOpen, onClose, enabled = true }) {
  const openRef = useRef(open);
  const onOpenRef = useRef(onOpen);
  const onCloseRef = useRef(onClose);

  openRef.current = open;
  onOpenRef.current = onOpen;
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!enabled) return undefined;

    const isDesktop = () => window.matchMedia('(min-width: 1024px)').matches;

    let startX = 0;
    let startY = 0;
    let mode = null; // 'open' | 'close' | null
    let claimed = false;

    const reset = () => {
      mode = null;
      claimed = false;
    };

    const onTouchStart = (event) => {
      if (isDesktop() || event.touches.length !== 1) {
        reset();
        return;
      }

      // A modal or sheet is open. Every create form on this app is a bottom
      // sheet, and a swipe starting near the left edge of one was opening the
      // nav drawer behind it.
      if (document.querySelector('[data-headlessui-portal]')) {
        reset();
        return;
      }

      const touch = event.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      claimed = false;

      if (openRef.current) {
        // Closing: any leftward swipe that starts on the drawer or near the left.
        mode = 'close';
        return;
      }

      if (startX <= EDGE_PX) {
        mode = 'open';
        return;
      }

      mode = null;
    };

    const onTouchMove = (event) => {
      if (!mode || event.touches.length !== 1) return;

      const touch = event.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;

      if (Math.abs(dy) > Math.abs(dx) * ANGLE_LOCK) {
        reset();
        return;
      }

      if (mode === 'open' && dx > 12) {
        // Steal the gesture from Safari/Chrome edge-back before it commits.
        if (!claimed) {
          claimed = true;
        }
        if (event.cancelable) event.preventDefault();
        if (dx >= OPEN_PX) {
          reset();
          onOpenRef.current?.();
        }
        return;
      }

      if (mode === 'close' && dx < -12) {
        if (event.cancelable) event.preventDefault();
        if (dx <= -CLOSE_PX) {
          reset();
          onCloseRef.current?.();
        }
      }
    };

    const onTouchEnd = () => reset();

    document.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true, capture: true });
    document.addEventListener('touchcancel', onTouchEnd, { passive: true, capture: true });

    return () => {
      document.removeEventListener('touchstart', onTouchStart, { capture: true });
      document.removeEventListener('touchmove', onTouchMove, { capture: true });
      document.removeEventListener('touchend', onTouchEnd, { capture: true });
      document.removeEventListener('touchcancel', onTouchEnd, { capture: true });
    };
  }, [enabled]);
}
