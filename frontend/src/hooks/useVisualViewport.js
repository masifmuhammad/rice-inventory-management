import { useEffect, useState } from 'react';

// Tallest visual viewport seen at the current width. iOS 26 Safari shrinks
// innerHeight together with the keyboard, so innerHeight alone reports no
// keyboard at all; the drop from this baseline still does. Reset on rotation.
let baseline = { width: 0, height: 0 };

const readViewport = () => {
  if (typeof window === 'undefined') {
    return { height: 0, offsetTop: 0, keyboard: 0, bottomInset: 0 };
  }

  const vv = window.visualViewport;
  if (!vv) {
    return { height: window.innerHeight, offsetTop: 0, keyboard: 0, bottomInset: 0 };
  }

  if (baseline.width !== vv.width) baseline = { width: vv.width, height: 0 };
  if (vv.scale <= 1.05) baseline.height = Math.max(baseline.height, vv.height);

  // Soft keyboards shrink visualViewport. Older iOS/Android keep innerHeight
  // large, so that delta is the keyboard; newer iOS needs the baseline delta.
  const keyboard = vv.scale > 1.05 ? 0 : Math.max(0, Math.round(Math.max(
    window.innerHeight - vv.height - vv.offsetTop,
    baseline.height - vv.height,
  )));

  return {
    height: vv.height,
    offsetTop: vv.offsetTop,
    keyboard,
    // Keyboard detection and fixed-position geometry are different quantities.
    // When the layout viewport also shrinks, its bottom inset is already zero.
    bottomInset: Math.max(0, window.innerHeight - vv.height - vv.offsetTop),
  };
};

/**
 * Tracks the visual viewport so bottom sheets can shrink and ride above the
 * mobile keyboard instead of sitting under it.
 */
export default function useVisualViewport(enabled = true) {
  const [viewport, setViewport] = useState(readViewport);

  useEffect(() => {
    if (!enabled) return undefined;

    let frame;
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = readViewport();
        setViewport((current) => current.height === next.height && current.offsetTop === next.offsetTop && current.keyboard === next.keyboard && current.bottomInset === next.bottomInset ? current : next);
      });
    };
    sync();

    const vv = window.visualViewport;
    vv?.addEventListener('resize', sync);
    vv?.addEventListener('scroll', sync);
    window.addEventListener('resize', sync);

    return () => {
      cancelAnimationFrame(frame);
      vv?.removeEventListener('resize', sync);
      vv?.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
    };
  }, [enabled]);

  return viewport;
}
