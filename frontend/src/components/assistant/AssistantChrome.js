import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FiMic, FiX } from 'react-icons/fi';
import { iconSwap, springSnappy } from '../../utils/motion';
import { usePrefersReducedMotion } from '../../hooks/useMediaQuery';

/** Shared stroke for assistant icons beside medium/semibold labels. */
export const ASSISTANT_STROKE = 1.75;

/**
 * Custom spark glyph (Feather-weight). Kept in-file so we don't mix icon packs —
 * this Feather release has no FiSparkles.
 */
export function AssistantSparkIcon({ className = 'w-5 h-5', strokeWidth = ASSISTANT_STROKE }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 3v3.5M12 17.5V21M3 12h3.5M17.5 12H21" />
      <path d="M6.2 6.2l2.1 2.1M15.7 15.7l2.1 2.1M17.8 6.2l-2.1 2.1M8.3 15.7l-2.1 2.1" />
      <circle cx="12" cy="12" r="2.25" />
    </svg>
  );
}

/**
 * Premium icon well — concentric with parent cards that use p-3.5 + rounded-[20px].
 * Uses currentColor so hover/active recolor without swapping assets.
 */
export function AssistantIconWell({
  icon: Icon,
  size = 'md',
  tone = 'brand',
  active = false,
  className = '',
}) {
  const sizes = {
    sm: { box: 'w-9 h-9 rounded-[10px]', icon: 'w-[18px] h-[18px]' },
    md: { box: 'w-11 h-11 rounded-[12px]', icon: 'w-5 h-5' },
    lg: { box: 'w-12 h-12 rounded-[14px]', icon: 'w-[22px] h-[22px]' },
  };
  const s = sizes[size] || sizes.md;

  const tones = {
    brand: active
      ? 'bg-primary-500 text-white shadow-[0_1px_2px_rgb(0_0_0/0.12),inset_0_1px_0_rgb(255_255_255/0.18)]'
      : 'bg-primary-500/[0.1] text-primary-600 dark:text-primary-400',
    muted:
      'bg-hairline/[0.06] text-content-muted border border-hairline/[0.08]',
    danger: active
      ? 'bg-red-500 text-white'
      : 'bg-red-500/10 text-red-500',
  };

  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 ${s.box} ${tones[tone] || tones.brand} ${className}`}
      aria-hidden="true"
    >
      <Icon className={s.icon} strokeWidth={ASSISTANT_STROKE} />
    </span>
  );
}

/** Soft outline on receipt/slip previews — pure black/white only. */
export function AssistantMediaFrame({ src, alt, className = '' }) {
  if (!src) return null;
  return (
    <div
      className={`overflow-hidden rounded-xl bg-surface-sunken
        outline outline-1 outline-black/10 dark:outline-white/10 ${className}`}
    >
      <img src={src} alt={alt} className="w-full max-h-48 object-contain" />
    </div>
  );
}

/**
 * Floating assistant trigger — icon swap on open, tactile press, no transition:all.
 */
export function AssistantFabTrigger({ onClick, expanded }) {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={expanded ? 'Close assistant' : 'Open AI assistant'}
      aria-expanded={expanded}
      className="relative z-50 grid place-items-center w-14 h-14 rounded-full
        bg-gray-800 text-white
        shadow-[0_8px_28px_-6px_rgb(0_0_0/0.3)]
        hover:bg-gray-700
        dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100
        dark:shadow-[0_8px_28px_-6px_rgb(0_0_0/0.55)]
        transition-[background-color,box-shadow,transform,color] duration-150 ease-[cubic-bezier(0.2,0,0,1)]
        active:scale-[0.96] motion-reduce:active:scale-100
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-800 dark:focus-visible:ring-white
        focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base"
    >
      <span className="relative w-6 h-6 grid place-items-center">
        <AnimatePresence initial={false} mode="wait">
          <motion.span
            key={expanded ? 'close' : 'open'}
            className="absolute inset-0 grid place-items-center"
            {...(reducedMotion
              ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
              : iconSwap)}
          >
            {expanded ? (
              <FiX className="w-[22px] h-[22px]" strokeWidth={2} aria-hidden="true" />
            ) : (
              <AssistantSparkIcon className="w-[22px] h-[22px]" strokeWidth={1.75} />
            )}
          </motion.span>
        </AnimatePresence>
      </span>
    </button>
  );
}

/** Compact brand mark for speed-dial header. */
export function AssistantBrandMark() {
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      <span
        className="grid place-items-center w-6 h-6 rounded-md bg-primary-500/12 text-primary-500"
        aria-hidden="true"
      >
        <AssistantSparkIcon className="w-3.5 h-3.5" strokeWidth={2} />
      </span>
      <span className="text-xs font-semibold text-content tracking-tight text-balance">Assistant</span>
    </span>
  );
}

export function AssistantMicButton({ recording, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={recording ? 'Stop recording' : 'Start voice input'}
      aria-pressed={recording}
      title={recording ? 'Stop' : 'Speak'}
      className={`relative grid place-items-center min-h-[44px] min-w-[44px] rounded-xl
        transition-[background-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.2,0,0,1)]
        active:scale-[0.96] motion-reduce:active:scale-100
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
        disabled:opacity-55 disabled:pointer-events-none
        ${
          recording
            ? 'bg-red-500 text-white shadow-[0_0_0_4px_rgb(239_68_68/0.2)]'
            : 'bg-surface-1 text-content-muted border border-hairline/[0.12] hover:text-primary-600 hover:border-primary-500/30 hover:bg-primary-500/5'
        }`}
    >
      <span className="relative w-[18px] h-[18px]">
        <AnimatePresence initial={false} mode="wait">
          <motion.span
            key={recording ? 'stop' : 'mic'}
            className="absolute inset-0 grid place-items-center"
            initial={{ opacity: 0, scale: 0.25 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.25 }}
            transition={springSnappy}
          >
            {recording ? (
              <FiX className="w-[18px] h-[18px]" strokeWidth={2} />
            ) : (
              <FiMic className="w-[18px] h-[18px]" strokeWidth={ASSISTANT_STROKE} />
            )}
          </motion.span>
        </AnimatePresence>
      </span>
    </button>
  );
}
