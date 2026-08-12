import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import BrandLogo from './BrandLogo';
import { usePrefersReducedMotion } from '../hooks/useMediaQuery';
import { springUI, reducedTransition } from '../utils/motion';

/**
 * Full-viewport veil while the active business is changing — soft enough to
 * feel intentional, short enough not to block.
 */
export default function BusinessSwitchOverlay() {
  const [phase, setPhase] = useState(null); // null | { name }
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    let hideTimer;

    const onSwitching = (event) => {
      window.clearTimeout(hideTimer);
      setPhase({ name: event.detail?.name || 'business' });
    };

    const onChanged = (event) => {
      setPhase({ name: event.detail?.name || 'business' });
      hideTimer = window.setTimeout(() => setPhase(null), reducedMotion ? 160 : 520);
    };

    const onCancelled = () => {
      window.clearTimeout(hideTimer);
      setPhase(null);
    };

    window.addEventListener('rim:business-switching', onSwitching);
    window.addEventListener('rim:business-changed', onChanged);
    window.addEventListener('rim:business-switch-cancelled', onCancelled);
    return () => {
      window.clearTimeout(hideTimer);
      window.removeEventListener('rim:business-switching', onSwitching);
      window.removeEventListener('rim:business-changed', onChanged);
      window.removeEventListener('rim:business-switch-cancelled', onCancelled);
    };
  }, [reducedMotion]);

  const transition = reducedMotion ? reducedTransition : springUI;

  return (
    <AnimatePresence>
      {phase && (
        <motion.div
          key="business-switch"
          role="status"
          aria-live="polite"
          initial={reducedMotion ? { opacity: 0 } : { opacity: 0, backdrop: 'blur(0px)' }}
          animate={reducedMotion ? { opacity: 1 } : { opacity: 1, backdrop: 'blur(0px)' }}
          exit={{ opacity: 0 }}
          transition={transition}
          className="fixed inset-0 z-[80] grid place-items-center bg-surface-base/70 dark:bg-black/55 backdrop-blur-md"
        >
          <motion.div
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.96 }}
            animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
            transition={transition}
            className="flex flex-col items-center gap-3 px-6 text-center"
          >
            <BrandLogo size={56} rounded="rounded-2xl" className="shadow-lg" />
            <p className="text-sm text-content-muted">Switching to</p>
            <p className="font-display font-bold text-content text-xl tracking-[-0.02em] text-balance">
              {phase.name}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
