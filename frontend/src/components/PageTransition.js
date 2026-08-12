import React, { Suspense } from 'react';
import { useLocation, useOutlet } from 'react-router-dom';
import { motion } from 'framer-motion';
import { usePrefersReducedMotion } from '../hooks/useMediaQuery';
import { routeVariants, routeVariantsReduced, springUI, reducedTransition } from '../utils/motion';
import RouteSkeleton from './RouteSkeleton';

/**
 * Route entrance.
 *
 * Keying on the pathname restarts the enter animation per route. There is no
 * `AnimatePresence` here on purpose: `mode="wait"` would hold the incoming page
 * back until the outgoing one finished leaving, which puts a delay on every
 * navigation. Mounting immediately keeps the app feeling direct.
 */
export default function PageTransition() {
  const location = useLocation();
  const outlet = useOutlet();
  const reducedMotion = usePrefersReducedMotion();

  return (
    <motion.div
      key={location.pathname}
      initial="initial"
      animate="animate"
      variants={reducedMotion ? routeVariantsReduced : routeVariants}
      transition={reducedMotion ? reducedTransition : springUI}
    >
      <Suspense fallback={<RouteSkeleton pathname={location.pathname} />}>{outlet}</Suspense>
    </motion.div>
  );
}
