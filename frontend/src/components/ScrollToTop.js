import { useLayoutEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const positions = new Map();

/**
 * Resets scroll on navigation. Without this, moving from the bottom of a long
 * product list to a short page leaves you staring at empty space.
 */
export default function ScrollToTop() {
  const { pathname } = useLocation();
  const navigation = useNavigationType();
  const { user, businessId } = useAuth();
  const scope = JSON.stringify([user?.id || user?._id, businessId, pathname]);

  useLayoutEffect(() => {
    const restore = navigation === 'POP' || ['/', '/products', '/transactions', '/cash-book'].includes(pathname);
    const top = restore ? positions.get(scope) || 0 : 0;
    window.scrollTo({ top, behavior: 'instant' });
    const frame = requestAnimationFrame(() => window.scrollTo({ top, behavior: 'instant' }));
    const remember = () => {
      positions.set(scope, window.scrollY);
      if (positions.size > 100) positions.delete(positions.keys().next().value);
    };
    window.addEventListener('scroll', remember, { passive: true });
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', remember); };
  }, [scope, pathname, navigation]);

  return null;
}
