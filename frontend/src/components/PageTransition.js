import React, { Suspense, useRef } from 'react';
import { useLocation, useOutlet } from 'react-router-dom';
import { motion } from 'framer-motion';
import useMediaQuery, { usePrefersReducedMotion } from '../hooks/useMediaQuery';
import RouteSkeleton from './RouteSkeleton';

/**
 * The order the tab bar presents these in. Moving right through the tabs should
 * feel like moving right, which is only meaningful for routes that sit in a row
 * the user can see — anything reached from the drawer has no position in it.
 */
const TAB_ORDER = ['/', '/products', '/transactions', '/cash-book'];

const tabIndex = (pathname) =>
  TAB_ORDER.findIndex((path) => (path === '/' ? pathname === '/' : pathname.startsWith(path)));

/**
 * Strong ease-out. The stock curves are too weak to read as deliberate, and
 * ease-in would delay the first movement — the moment the eye is on it.
 */
const EASE_OUT = [0.23, 1, 0.32, 1];

/**
 * Route entrance.
 *
 * Between tabs this slides horizontally in the direction of travel, so going
 * Home → Stock and back again feel like opposite movements rather than the same
 * page re-appearing. Everywhere else it stays a short vertical settle, because a
 * drawer route has no place in a left-to-right order and pretending otherwise
 * would be a lie about where the user is.
 *
 * There is deliberately no `AnimatePresence`: `mode="wait"` holds the incoming
 * page until the outgoing one has left, which puts a delay on every navigation.
 * The new page mounts immediately and moves into place.
 */
export default function PageTransition() {
  const location = useLocation();
  const outlet = useOutlet();
  const reducedMotion = usePrefersReducedMotion();
  const isMobile = useMediaQuery('(max-width: 1023px)');

  const previousTab = useRef(tabIndex(location.pathname));
  const current = tabIndex(location.pathname);

  // Only a move between two known tabs has a direction. Anything else gets 0.
  const direction =
    current >= 0 && previousTab.current >= 0 && current !== previousTab.current
      ? Math.sign(current - previousTab.current)
      : 0;

  if (current >= 0) previousTab.current = current;

  const slide = isMobile && direction !== 0;

  // `transform` as a string rather than framer-motion's `x` shorthand: the
  // shorthand runs on the main thread, and a route change is exactly when the
  // main thread is busy mounting the new page.
  const initial = reducedMotion
    ? { opacity: 0 }
    : slide
      ? { opacity: 0, transform: `translateX(${direction * 28}px)` }
      : { opacity: 0, transform: 'translateY(10px)' };

  const animate = reducedMotion
    ? { opacity: 1 }
    : { opacity: 1, transform: 'translateX(0px) translateY(0px)' };

  return (
    <motion.div
      key={location.pathname}
      initial={initial}
      animate={animate}
      transition={
        reducedMotion
          ? { duration: 0.12 }
          : // Under 300ms, or navigation starts to feel like waiting.
            { duration: slide ? 0.24 : 0.22, ease: EASE_OUT }
      }
    >
      <Suspense fallback={<RouteSkeleton pathname={location.pathname} />}>{outlet}</Suspense>
    </motion.div>
  );
}
