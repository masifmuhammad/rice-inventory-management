import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Resets scroll on navigation. Without this, moving from the bottom of a long
 * product list to a short page leaves you staring at empty space.
 */
export default function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    // Jump, don't animate: `scroll-behavior: smooth` in the stylesheet would
    // otherwise scroll the old page away while the new one is already rendering.
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
