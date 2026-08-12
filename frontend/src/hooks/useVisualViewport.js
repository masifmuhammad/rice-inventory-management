import { useEffect, useState } from 'react';

const readViewport = () => {
  if (typeof window === 'undefined') {
    return { height: 0, offsetTop: 0, keyboard: 0 };
  }

  const vv = window.visualViewport;
  if (!vv) {
    return { height: window.innerHeight, offsetTop: 0, keyboard: 0 };
  }

  // Soft keyboards shrink visualViewport. Layout viewport (innerHeight) stays
  // large, so the delta is the keyboard occlusion we need to pan around.
  const keyboard = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));

  return {
    height: vv.height,
    offsetTop: vv.offsetTop,
    keyboard,
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

    const sync = () => setViewport(readViewport());
    sync();

    const vv = window.visualViewport;
    vv?.addEventListener('resize', sync);
    vv?.addEventListener('scroll', sync);
    window.addEventListener('resize', sync);

    return () => {
      vv?.removeEventListener('resize', sync);
      vv?.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
    };
  }, [enabled]);

  return viewport;
}
