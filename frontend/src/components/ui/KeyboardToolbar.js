import React, { useEffect, useState } from 'react';
import { FiArrowRight, FiCheck, FiChevronUp } from 'react-icons/fi';

export default function KeyboardToolbar({ bodyRef, onDone }) {
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
    const index = list.indexOf(active);
    list[index + direction]?.focus({ preventScroll: true });
  };
  const list = fields();
  const index = list.indexOf(active);
  const last = index < 0 || index >= list.length - 1;
  const finish = (event) => {
    // Focus a non-text control inside the dialog. Blurring into <body> lets
    // the dialog's focus trap return focus to the input and reopen the keyboard.
    event.currentTarget.focus({ preventScroll: true });
    active?.blur();
    onDone?.();
  };
  return (
    <div className="flex items-center justify-between border-t border-hairline/[0.08] bg-surface-1 px-3 py-1.5" role="toolbar" aria-label="Keyboard controls">
      <button type="button" disabled={index <= 0} onPointerDown={(event) => event.preventDefault()} onClick={() => move(-1)} aria-label="Previous field" className="min-h-[44px] min-w-[44px] grid place-items-center text-content-muted disabled:opacity-30"><FiChevronUp className="w-5 h-5" aria-hidden="true" /></button>
      <span className="text-xs text-content-muted" aria-live="polite">{index >= 0 ? `${index + 1} of ${list.length}` : ''}</span>
      <button type="button" onPointerDown={(event) => event.preventDefault()} onClick={last ? finish : () => move(1)} aria-label={last ? 'Done' : 'Next field'} className={`min-h-[44px] rounded-full bg-content text-surface-1 inline-flex items-center justify-center gap-2 text-sm font-medium transition-[width,background-color] duration-200 motion-reduce:transition-none ${last ? 'px-5' : 'w-11'}`}>
        {last ? <>Done <FiCheck className="w-4 h-4" aria-hidden="true" /></> : <FiArrowRight className="w-5 h-5" aria-hidden="true" />}
      </button>
    </div>
  );
}
