/**
 * One motion vocabulary for the whole app.
 *
 * Framer Motion's `bounce` + `duration` spring maps onto Apple's two designer
 * parameters: `bounce` is the inverse of damping ratio, `duration` is response
 * (not a fixed runtime — a spring settles when the physics says it has).
 *
 * House rule: critically damped (`bounce: 0`) everywhere by default. Overshoot
 * is reserved for motion the user physically started, like a drag release —
 * bounce on a panel that merely faded in reads as noise.
 */

/** Default UI spring. Graceful, never distracting. */
export const springUI = { type: 'spring', bounce: 0, duration: 0.35 };

/** For indicators that have to keep up with a pointer. */
export const springSnappy = { type: 'spring', bounce: 0, duration: 0.22 };

/** Sheets and drawers: a trace of overshoot, because they are gesture-adjacent. */
export const springSheet = { type: 'spring', bounce: 0.14, duration: 0.4 };

/** Only after a flick or drag release, where momentum already exists. */
export const springMomentum = { type: 'spring', bounce: 0.2, duration: 0.4 };

/** Curves for CSS-side transitions, so they match the springs above. */
export const easeOutExpo = [0.16, 1, 0.3, 1];
export const easeStandard = [0.2, 0, 0, 1];

/**
 * Reduced motion keeps the state change legible but drops the travel.
 * A cross-fade still communicates "this changed" without vestibular motion.
 */
export const reducedTransition = { duration: 0.15, ease: 'easeOut' };

/** Picks the right transition for the visitor's motion preference. */
export const withReducedMotion = (transition, reducedMotion) =>
  reducedMotion ? reducedTransition : transition;

/* -------------------------------------------------------------------------- */
/* Route entrance                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Pages mount immediately and rise into place. There is deliberately no exit
 * animation: waiting for the old page to leave before mounting the new one adds
 * latency to every single navigation, which costs far more than it buys.
 */
export const routeVariants = {
  initial: { opacity: 0, y: 10, filter: 'blur(4px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
};

export const routeVariantsReduced = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
};

/* -------------------------------------------------------------------------- */
/* Staggered entrances                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Staggering is for infrequent, staged arrivals where sequence communicates
 * hierarchy — a dashboard load or the sign-in screen. Never for a hover, a
 * keystroke, or a repeated tab change.
 */
export const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
};

export const staggerItem = {
  hidden: { opacity: 0, y: 12, filter: 'blur(4px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: springUI },
};

export const staggerItemReduced = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: reducedTransition },
};

/** Contextual icon swaps (theme toggle, show/hide password). */
export const iconSwap = {
  initial: { opacity: 0, scale: 0.25, filter: 'blur(4px)' },
  animate: { opacity: 1, scale: 1, filter: 'blur(0px)' },
  exit: { opacity: 0, scale: 0.25, filter: 'blur(4px)' },
  transition: { type: 'spring', bounce: 0, duration: 0.3 },
};