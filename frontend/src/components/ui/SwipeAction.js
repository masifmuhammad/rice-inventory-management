import React, { useState } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { FiTrash2 } from 'react-icons/fi';
import { usePrefersReducedMotion } from '../../hooks/useMediaQuery';
import { springUI, reducedTransition } from '../../utils/motion';
import { feedbackWarning } from '../../utils/feedback';

/** How far the row must travel before the release counts as "delete". */
const COMMIT = 96;

/**
 * Swipe a list row leftwards to reveal, then trigger, a destructive action.
 *
 * The row still has its own visible delete button — this is the gesture on top,
 * not a replacement, because a hidden gesture is not a control anyone can find
 * on their first day. `onAction` is expected to confirm before destroying
 * anything; the swipe is a shortcut to the same dialog the button opens.
 */
export default function SwipeAction({ children, onAction, label = 'Delete', disabled = false }) {
  const reducedMotion = usePrefersReducedMotion();
  const x = useMotionValue(0);
  const [armed, setArmed] = useState(false);

  // The action panel fades up as the row uncovers it, so the colour arrives with
  // the gesture rather than being revealed fully formed underneath.
  const revealOpacity = useTransform(x, [-COMMIT, -24, 0], [1, 0.55, 0]);
  const iconScale = useTransform(x, [-COMMIT - 40, -COMMIT, -40], [1.12, 1, 0.85]);

  if (disabled) return children;

  const transition = reducedMotion ? reducedTransition : springUI;

  return (
    /* Marked so the page-level swipe knows to keep out: a horizontal drag that
       starts on a row belongs to the row, not to navigation. */
    <div className="relative overflow-hidden" data-swipeable="true">
      {/* Sits behind the row, revealed as it slides. `aria-hidden` because the
          row's own delete button is the accessible route to this action. */}
      <motion.div
        aria-hidden="true"
        style={{ opacity: revealOpacity }}
        className="absolute inset-y-0 right-0 flex items-center gap-2 px-5 bg-red-500 text-white pointer-events-none"
      >
        <motion.span style={{ scale: iconScale }} className="flex items-center gap-2">
          <FiTrash2 className="w-4 h-4" />
          <span className="text-sm font-semibold">{label}</span>
        </motion.span>
      </motion.div>

      <motion.div
        drag="x"
        style={{ x }}
        // Leftwards only: a right swipe here would fight the browser's own
        // back gesture on both platforms.
        dragConstraints={{ left: -COMMIT - 40, right: 0 }}
        dragElastic={{ left: 0.12, right: 0 }}
        dragDirectionLock
        dragMomentum={false}
        onDrag={(event, info) => {
          // One buzz as the row crosses the commit point, so the threshold is
          // felt rather than guessed at.
          const past = info.offset.x < -COMMIT;
          if (past !== armed) {
            setArmed(past);
            if (past) feedbackWarning();
          }
        }}
        onDragEnd={(event, info) => {
          const commit = info.offset.x < -COMMIT || info.velocity.x < -520;
          setArmed(false);
          // Snap back either way: the confirm dialog is the point of no return,
          // so the row should not sit open behind it.
          if (commit) onAction();
        }}
        dragSnapToOrigin
        dragTransition={{ bounceStiffness: 520, bounceDamping: 42 }}
        transition={transition}
        className="relative bg-surface-1 touch-pan-y"
      >
        {children}
      </motion.div>
    </div>
  );
}
