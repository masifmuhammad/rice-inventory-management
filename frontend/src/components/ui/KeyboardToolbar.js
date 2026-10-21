import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FiArrowRight, FiCheck, FiChevronUp, FiLoader } from 'react-icons/fi';
import { usePrefersReducedMotion } from '../../hooks/useMediaQuery';
import { feedbackTick } from '../../utils/feedback';

const tones = {
  primary: 'bg-content text-surface-1',
  success: 'bg-emerald-600 text-white',
  danger: 'bg-red-600 text-white',
};

/**
 * One bar for moving through a form and finishing it.
 *
 * While fields remain it reads previous · "3 of 9" · next. On the last field,
 * or once the keyboard is down, the next arrow grows into the form's own
 * action ("Create product"), so a sheet needs no separate submit and cancel
 * footer on a phone. `submit` is { label, form?, onClick?, loading?, variant? }:
 * `form` submits that form by id; `onClick` runs instead when there is none.
 */
export default function KeyboardToolbar({ bodyRef, onDone, submit, keyboardOpen = true }) {
  const reduce = usePrefersReducedMotion();
  const [active, setActive] = useState(() => document.activeElement);
  useEffect(() => {
    const body = bodyRef.current;
    const update = (event) => {
      if (event.target.matches('input, textarea')) setActive(event.target);
    };
    body?.addEventListener('focusin', update);
    return () => body?.removeEventListener('focusin', update);
  }, [bodyRef]);
  const fields = () => Array.from(bodyRef.current?.querySelectorAll('input:not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]):not([type="color"]), textarea') || [])
    .filter((field) => !field.disabled && !field.readOnly && field.offsetParent !== null && !field.closest('details:not([open])'));
  const move = (direction) => {
    const list = fields();
    const next = list[list.indexOf(active) + direction];
    if (!next) return;
    next.focus({ preventScroll: true });
    // Linux WebKit does not fire focusin when a date input is focused from
    // script, so record the move here instead of waiting for the event.
    setActive(next);
  };
  const list = fields();
  const index = keyboardOpen ? list.indexOf(active) : -1;
  const last = index < 0 || index >= list.length - 1;
  const expanded = Boolean(submit) && (!keyboardOpen || last);
  const finish = (event) => {
    // Focus a non-text control inside the dialog. Blurring into <body> lets
    // the dialog's focus trap return focus to the input and reopen the keyboard.
    event.currentTarget.focus({ preventScroll: true });
    active?.blur();
    onDone?.();
  };
  const spring = reduce ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 42 };

  return (
    <div className="flex items-center gap-2 border-t border-hairline/[0.08] bg-surface-1 px-3 py-1.5" role="toolbar" aria-label={submit ? 'Form controls' : 'Keyboard controls'}>
      <AnimatePresence mode="popLayout" initial={false}>
        {!expanded && (
          <motion.div key="nav" className="flex flex-1 items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.15 }}>
            <button type="button" disabled={index <= 0} onPointerDown={(event) => event.preventDefault()} onClick={() => move(-1)} aria-label="Previous field" className="min-h-[44px] min-w-[44px] grid place-items-center text-content-muted disabled:opacity-30"><FiChevronUp className="w-5 h-5" aria-hidden="true" /></button>
            <span className="flex-1 pl-11 text-center text-xs text-content-muted" aria-live="polite">{index >= 0 ? `${index + 1} of ${list.length}` : ''}</span>
          </motion.div>
        )}
      </AnimatePresence>
      <motion.button
        layout
        transition={spring}
        type={expanded && submit.form ? 'submit' : 'button'}
        form={expanded ? submit.form : undefined}
        disabled={expanded && submit.loading}
        aria-busy={(expanded && submit.loading) || undefined}
        onPointerDown={(event) => {
          event.preventDefault();
          if (event.pointerType === 'touch') feedbackTick();
        }}
        onClick={expanded ? submit.onClick : last ? finish : () => move(1)}
        aria-label={expanded ? undefined : last ? 'Done' : 'Next field'}
        style={{ borderRadius: 999 }}
        className={`min-h-[44px] inline-flex items-center justify-center gap-2 text-sm font-medium disabled:opacity-70 ${
          expanded ? `flex-1 px-5 ${keyboardOpen ? '' : 'min-h-[50px] text-base'} ${tones[submit.variant] || tones.primary}` : `${tones.primary} ${last ? 'px-5' : 'w-11'}`
        }`}
      >
        <motion.span layout="position" transition={spring} className="inline-flex items-center gap-2 whitespace-nowrap">
          {expanded ? (
            <>{submit.loading && <FiLoader className="w-4 h-4 animate-spin" aria-hidden="true" />}{submit.label}</>
          ) : last ? (
            <>Done <FiCheck className="w-4 h-4" aria-hidden="true" /></>
          ) : (
            <FiArrowRight className="w-5 h-5" aria-hidden="true" />
          )}
        </motion.span>
      </motion.button>
    </div>
  );
}
