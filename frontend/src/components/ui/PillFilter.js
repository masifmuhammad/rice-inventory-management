import React, { useCallback, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { usePrefersReducedMotion } from '../../hooks/useMediaQuery';
import { springSnappy } from '../../utils/motion';

/**
 * A segmented control you can drag through.
 *
 * The indicator is one shared element that springs between segments, so
 * switching reads as a single object moving rather than two states blinking.
 *
 * Two deliberate timing choices:
 * - The indicator moves on pointer *down*, so the control answers instantly.
 * - `onChange` fires on pointer *up*. Committing on every segment the pointer
 *   crosses would fire a request per segment while dragging across the control.
 */
export default function PillFilter({ options, value, onChange, ariaLabel, className = '' }) {
  const reducedMotion = usePrefersReducedMotion();
  const trackRef = useRef(null);
  const [dragIndex, setDragIndex] = useState(null);

  const selectedIndex = options.findIndex((option) => option.value === value);
  const activeIndex = dragIndex ?? selectedIndex;
  const dragging = dragIndex !== null;

  /**
   * The segment whose centre is closest to this x position. Nearest-centre
   * rather than hit-testing rects, so the gaps between segments and dragging
   * past either end both resolve to something sensible.
   */
  const indexFromPointer = useCallback((clientX) => {
    const segments = trackRef.current?.querySelectorAll('[data-segment]');
    if (!segments?.length) return null;

    let closest = 0;
    let shortest = Infinity;

    segments.forEach((segment, index) => {
      const rect = segment.getBoundingClientRect();
      const distance = Math.abs(clientX - (rect.left + rect.width / 2));
      if (distance < shortest) {
        shortest = distance;
        closest = index;
      }
    });

    return closest;
  }, []);

  const handlePointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    const next = indexFromPointer(event.clientX);
    if (next === null) return;

    // Capture so the drag keeps tracking even once the pointer leaves the track.
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragIndex(next);
  };

  const handlePointerMove = (event) => {
    if (!dragging) return;
    const next = indexFromPointer(event.clientX);
    if (next !== null && next !== dragIndex) setDragIndex(next);
  };

  const endDrag = (event) => {
    if (!dragging) return;

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const committed = options[dragIndex];
    setDragIndex(null);
    if (committed && committed.value !== value) onChange(committed.value);
  };

  const handleKeyDown = (event) => {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!delta || selectedIndex < 0) return;

    event.preventDefault();
    const next = (selectedIndex + delta + options.length) % options.length;
    onChange(options[next].value);
  };

  return (
    <div
      ref={trackRef}
      role="tablist"
      aria-label={ariaLabel}
      className={`segmented ${className}`}
      // Let a vertical swipe still scroll the page; horizontal drags are ours.
      style={{ touchAction: 'pan-y' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={handleKeyDown}
    >
      {options.map((option, index) => {
        const active = index === activeIndex;

        return (
          <button
            key={option.value}
            data-segment
            type="button"
            role="tab"
            aria-selected={option.value === value}
            tabIndex={option.value === value ? 0 : -1}
            onClick={(event) => {
              // `detail` is 0 only for keyboard-synthesised clicks. Pointer
              // taps already committed on pointerup, so ignore them here
              // rather than firing onChange a second time.
              if (event.detail !== 0) return;
              if (option.value !== value) onChange(option.value);
            }}
            className={`segmented-item ${active ? 'segmented-item-active' : ''}`}
          >
            {active && (
              // No scale here on purpose: a transform on the same element as a
              // `layoutId` fights the layout projection and distorts the pill.
              <motion.span
                layoutId={`segmented-thumb-${ariaLabel || 'default'}`}
                className={`segmented-thumb absolute inset-0 rounded-full ${dragging ? 'segmented-thumb-held' : ''}`}
                transition={reducedMotion ? { duration: 0 } : springSnappy}
                aria-hidden="true"
              />
            )}
            <span className="relative z-10 pointer-events-none">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
