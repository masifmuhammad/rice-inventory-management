import React, { useEffect, useRef } from 'react';
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';
import { animate, motion, useDragControls, useMotionValue } from 'framer-motion';
import { FiX } from 'react-icons/fi';
import { usePrefersReducedMotion } from '../../hooks/useMediaQuery';
import useVisualViewport from '../../hooks/useVisualViewport';
import { springSheet, reducedTransition } from '../../utils/motion';

const sizes = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
};

const FOCUSABLE_FIELD = 'INPUT, SELECT, TEXTAREA';

/**
 * Headless UI supplies focus trap, escape-to-close, scroll lock, and aria-modal.
 * Dialog must stay mounted with the `open` prop — conditionally unmounting it
 * breaks Transition context for DialogPanel and triggers runtime errors.
 */
export default function Modal({
  open,
  onClose,
  title,
  description,
  size = 'md',
  children,
  footer,
  closeOnBackdrop = true,
  disableClose = false,
  busy = false,
}) {
  const handleClose = disableClose ? () => {} : onClose;

  const reducedMotion = usePrefersReducedMotion();
  const dragControls = useDragControls();
  const y = useMotionValue(0);
  const snapTransition = reducedMotion ? reducedTransition : springSheet;
  const bodyRef = useRef(null);
  const viewport = useVisualViewport(open);

  // A dismissed sheet keeps whatever offset it was flung to. Reset on reopen so
  // the next modal does not mount already pushed down the screen.
  useEffect(() => {
    if (open) y.set(0);
  }, [open, y]);

  // When the soft keyboard opens, keep the focused control in the visible pane
  // above the footer — browsers often only scroll the page, not the sheet body.
  useEffect(() => {
    if (!open) return undefined;

    const body = bodyRef.current;
    if (!body) return undefined;

    const keepFieldVisible = (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.matches(FOCUSABLE_FIELD)) return;

      // Wait a frame so visualViewport has settled after focus.
      requestAnimationFrame(() => {
        const shell = target.closest('.field-shell') || target;
        shell.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
      });
    };

    body.addEventListener('focusin', keepFieldVisible);
    return () => body.removeEventListener('focusin', keepFieldVisible);
  }, [open, reducedMotion, viewport.keyboard]);

  const handleDragEnd = (event, info) => {
    const dismissable = !disableClose && !busy;
    const flicked = info.velocity.y > 110 && info.offset.y > 0;
    const dragged = info.offset.y > 120;

    if (dismissable && (flicked || dragged)) {
      onClose();
      return;
    }
    animate(y, 0, snapTransition);
  };

  // Bind the overlay to the visual viewport so the sheet rides up with the
  // keyboard instead of being covered by it on iOS/Android.
  const overlayStyle =
    open && viewport.height
      ? {
          top: viewport.offsetTop,
          height: viewport.height,
        }
      : undefined;

  const sheetMaxHeight =
    open && viewport.height
      ? `${Math.min(viewport.height * 0.92, viewport.height - 8)}px`
      : undefined;

  return (
    <Dialog
      open={open}
      onClose={closeOnBackdrop && !disableClose ? onClose : () => {}}
      className="relative z-50"
    >
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
          data-[closed]:opacity-0 motion-reduce:duration-150"
      />

      <div className="fixed inset-x-0 overflow-hidden" style={overlayStyle || { inset: 0 }}>
        <div className="flex h-full items-end justify-center sm:items-center sm:p-4">
          {/* Scale and translate carry the arrival — both composited, so the
              sheet keeps pace with a high-refresh display. */}
          <DialogPanel
            transition
            className={`relative w-full ${sizes[size] || sizes.md}
              transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
              data-[closed]:opacity-0
              data-[closed]:translate-y-6 sm:data-[closed]:translate-y-0 sm:data-[closed]:scale-[0.97]
              motion-reduce:duration-150 motion-reduce:data-[closed]:translate-y-0 motion-reduce:data-[closed]:scale-100`}
          >
            {/* The card is a separate layer from the panel above: Headless UI owns
                the enter/exit transform, this owns the drag offset. Sharing one
                element would make the two fight over `transform`. */}
            <motion.div
              drag="y"
              dragControls={dragControls}
              dragListener={false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0.1, bottom: 1 }}
              onDragEnd={handleDragEnd}
              style={{ y, maxHeight: sheetMaxHeight }}
              className="bg-surface-1 shadow-2xl rounded-t-card sm:rounded-card
                max-h-[92vh] sm:max-h-[88vh] flex flex-col"
            >
              {/* Only the grabber starts a drag. A panel-wide listener would
                  swallow scrolling in the body below. */}
              <div
                className="sm:hidden pt-3 pb-1 flex justify-center flex-shrink-0 cursor-grab active:cursor-grabbing"
                style={{ touchAction: 'none' }}
                onPointerDown={(event) => dragControls.start(event)}
                aria-hidden="true"
              >
                <div className="w-10 h-1 rounded-full bg-hairline/[0.08]" />
              </div>

              <div className="flex items-start justify-between gap-4 px-5 sm:px-6 py-4 border-b border-hairline/[0.07] flex-shrink-0">
                <div className="min-w-0">
                  <DialogTitle className="text-lg font-semibold text-content truncate">
                    {title}
                  </DialogTitle>
                  {description && (
                    <div className="mt-1 text-content-subtle">{description}</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={disableClose}
                  aria-label="Close dialog"
                  className="-mr-2 -mt-1 p-2 rounded-lg text-content-subtle hover:text-content hover:bg-hairline/[0.05]
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                >
                  <FiX className="w-5 h-5" />
                </button>
              </div>

              <div
                ref={bodyRef}
                className={`overflow-y-auto overscroll-contain px-5 sm:px-6 py-4 sm:py-5 flex-1 transition-opacity duration-150 ${
                  busy ? 'opacity-60 pointer-events-none' : ''
                }`}
                aria-busy={busy || undefined}
              >
                {children}
              </div>

              {footer && (
                <div className="flex-shrink-0 px-5 sm:px-6 py-3.5 sm:py-4 border-t border-hairline/[0.06] rounded-b-2xl pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:pb-4">
                  {footer}
                </div>
              )}
            </motion.div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
}
