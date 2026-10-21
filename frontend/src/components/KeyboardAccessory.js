import React, { useEffect, useRef, useState } from 'react';
import KeyboardToolbar from './ui/KeyboardToolbar';

// Sheets own their keyboard toolbar. Page forms (including sign-in and settings)
// use this accessory, anchored to the visible viewport rather than 100vh.
export default function KeyboardAccessory({ viewport }) {
  const [active, setActive] = useState(null);
  const bodyRef = useRef(null);
  useEffect(() => {
    const update = (event) => {
      const field = event.target;
      if (!field.matches?.('input:not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]):not([type="color"]), textarea') || field.closest('[role="dialog"]')) {
        if (!field.closest?.('[data-keyboard-accessory]')) setActive(null);
        return;
      }
      bodyRef.current = field.form || field.closest('main') || document.body;
      setActive(field);
    };
    document.addEventListener('focusin', update);
    return () => document.removeEventListener('focusin', update);
  }, []);
  useEffect(() => {
    if (!active?.isConnected || viewport.keyboard <= 120) return undefined;
    const timer = setTimeout(() => {
      const box = (active.closest('.field-shell') || active).getBoundingClientRect();
      const bottom = viewport.offsetTop + viewport.height - 70;
      if (box.bottom > bottom) window.scrollBy({ top: box.bottom - bottom, behavior: 'instant' });
    }, 60);
    return () => clearTimeout(timer);
  }, [active, viewport.height, viewport.offsetTop, viewport.keyboard]);
  if (!active?.isConnected || viewport.keyboard <= 120) return null;
  return (
    <div data-keyboard-accessory className="fixed inset-x-0 z-[90]" style={{ top: Math.max(0, viewport.offsetTop + viewport.height - 57) }}>
      <KeyboardToolbar bodyRef={bodyRef} onDone={() => setActive(null)} />
    </div>
  );
}
