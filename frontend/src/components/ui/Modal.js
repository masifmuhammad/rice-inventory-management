import React, { useCallback, useEffect, useRef } from 'react';
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

  // The field the user is currently in, so it can be re-revealed whenever the
  // visible area changes underneath it.
  const focusedFieldRef = useRef(null);

  /**
   * Scrolls the sheet body so the focused field is inside the visible pane.
   *
   * Deliberately not `scrollIntoView`. That delegates to the browser's own idea
   * of "visible", which on iOS is the layout viewport — the one that does *not*
   * shrink for the keyboard — so it happily concludes a field hidden behind the
   * keyboard is already in view and does nothing. Measuring the body's own box
   * and setting `scrollTop` is the only version that answers the question the
   * user is actually asking: can I see what I am typing.
   */
  const revealFocusedField = useCallback(() => {
    const target = focusedFieldRef.current;
    const body = bodyRef.current;
    if (!target?.isConnected || !body) return;

    const shell = target.closest('.field-shell') || target;
    const fieldBox = shell.getBoundingClientRect();
    const bodyBox = body.getBoundingClientRect();

    // Centre it in whatever height the body actually has right now, clamped so a
    // field taller than the pane pins to the top rather than scrolling past it.
    const offset = fieldBox.top - bodyBox.top;
    const room = Math.max(0, bodyBox.height - fieldBox.height);
    const delta = offset - room / 2;

    if (Math.abs(delta) < 2) return;

    body.scrollTo({
      top: body.scrollTop + delta,
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  }, [reducedMotion]);

  // Remember which field is focused. Scrolling on focus alone is not enough —
  // see the effect below.
  useEffect(() => {
    if (!open) return undefined;

    const body = bodyRef.current;
    if (!body) return undefined;

    const onFocusIn = (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.matches(FOCUSABLE_FIELD)) return;
      focusedFieldRef.current = target;
      requestAnimationFrame(revealFocusedField);
    };

    const onFocusOut = (event) => {
      if (event.target === focusedFieldRef.current) focusedFieldRef.current = null;
    };

    body.addEventListener('focusin', onFocusIn);
    body.addEventListener('focusout', onFocusOut);
    return () => {
      body.removeEventListener('focusin', onFocusIn);
      body.removeEventListener('focusout', onFocusOut);
    };
  }, [open, revealFocusedField]);

  /**
   * Re-reveal the focused field whenever the keyboard changes the visible area.
   *
   * This is the half that was missing. On iOS the sequence is focus first,
   * keyboard second — so scrolling on `focusin` aims at a viewport that is about
   * to shrink by ~300px, and the field the user just tapped ends up behind the
   * keyboard anyway. Reacting to the resize as well is what actually keeps it in
   * view, and it also covers rotating the device or the keyboard swapping to an
   * emoji or predictive-text layout mid-entry.
   */
  useEffect(() => {
    if (!open || !focusedFieldRef.current) return undefined;
    const timer = setTimeout(revealFocusedField, 60);
    return () => clearTimeout(timer);
  }, [open, viewport.keyboard, viewport.height, revealFocusedField]);

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

  // A soft keyboard is up. The sheet's chrome — grabber, description, generous
  // padding, safe-area inset — is sized for reading; while typing it can eat two
  // thirds of a ~300px visible pane and leave room for a single field.
  const keyboardOpen = viewport.keyboard > 120;

  return (
    <Dialog
      open={open}
      /* Headless UI funnels backdrop clicks and the Escape key through this one
         callback, so `closeOnBackdrop={false}` was silently killing keyboard
         dismissal too — an accessibility regression for any dialog that only
         wanted to survive a stray tap outside it. Only a backdrop click arrives
         with a MouseEvent, so Escape keeps working either way. */
      onClose={
        disableClose
          ? () => {}
          : (event) => {
              if (!closeOnBackdrop && event instanceof MouseEvent) return;
              onClose();
            }
      }
      className="relative z-50"
    >
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
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
              /* `dvh`, not `vh`: the inline sheetMaxHeight from visualViewport
                 covers modern browsers, but where that is unavailable `vh` is
                 the *large* viewport and the sheet overflows the visible area. */
              className="bg-surface-1 shadow-2xl rounded-t-card sm:rounded-card
                max-h-[92dvh] sm:max-h-[88dvh] flex flex-col"
            >
              {/* Only the grabber starts a drag. A panel-wide listener would
                  swallow scrolling in the body below. */}
              {/* The grabber is a drag affordance for a sheet the user is
                  reading. While they are typing it is 16px of a ~300px pane
                  spent on something they are not about to do. */}
              {!keyboardOpen && (
                <div
                  className="sm:hidden pt-3 pb-1 flex justify-center flex-shrink-0 cursor-grab active:cursor-grabbing"
                  style={{ touchAction: 'none' }}
                  onPointerDown={(event) => dragControls.start(event)}
                  aria-hidden="true"
                >
                  <div className="w-10 h-1 rounded-full bg-hairline/[0.08]" />
                </div>
              )}

              <div
                className={`flex items-start justify-between gap-4 px-5 sm:px-6 border-b border-hairline/[0.07] flex-shrink-0 ${
                  keyboardOpen ? 'py-2.5' : 'py-4'
                }`}
              >
                <div className="min-w-0">
                  <DialogTitle
                    className={`font-semibold text-content truncate ${
                      keyboardOpen ? 'text-base' : 'text-lg'
                    }`}
                  >
                    {title}
                  </DialogTitle>
                  {/* The description explains the form before you start. Once
                      the keyboard is up it is costing two wrapped lines of the
                      only space the fields have. */}
                  {description && !keyboardOpen && (
                    <div className="mt-1 text-content-subtle">{description}</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={disableClose}
                  aria-label="Close dialog"
                  className="-mr-2 -mt-1 grid place-items-center min-h-[44px] min-w-[44px] rounded-lg text-content-subtle hover:text-content hover:bg-hairline/[0.05]
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                >
                  <FiX className="w-5 h-5" />
                </button>
              </div>

              <div
                ref={bodyRef}
                className={`overflow-y-auto overscroll-contain px-5 sm:px-6 flex-1 transition-opacity duration-150 ${
                  keyboardOpen ? 'py-2.5' : 'py-4 sm:py-5'
                } ${busy ? 'opacity-60 pointer-events-none' : ''}`}
                aria-busy={busy || undefined}
              >
                {children}
              </div>

              {footer && (
                /* The home-indicator inset is real estate the keyboard is
                   already covering — reclaiming it while typing gives the
                   fields another line, and it comes back on dismiss. */
                <div
                  className={`flex-shrink-0 px-5 sm:px-6 border-t border-hairline/[0.06] rounded-b-2xl sm:py-4 sm:pb-4 ${
                    keyboardOpen ? 'py-2.5 pb-2.5' : 'py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]'
                  }`}
                >
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
