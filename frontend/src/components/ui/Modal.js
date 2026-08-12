import React from 'react';
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';
import { FiX } from 'react-icons/fi';

const sizes = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
};

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

  return (
    <Dialog
      open={open}
      onClose={closeOnBackdrop && !disableClose ? onClose : () => {}}
      className="relative z-50"
    >
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
          data-[closed]:opacity-0 data-[closed]:backdrop-blur-none motion-reduce:duration-150"
      />

      <div className="fixed inset-0 overflow-y-auto">
        <div className="flex min-h-full items-end justify-center sm:items-center sm:p-4">
          {/* Blur and scale animate together so the panel arrives as a material
              rather than a flat opacity fade. */}
          <DialogPanel
            transition
            className={`relative w-full ${sizes[size] || sizes.md} bg-surface-1 shadow-2xl
              rounded-t-card sm:rounded-card max-h-[92vh] sm:max-h-[88vh] flex flex-col
              transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
              data-[closed]:opacity-0 data-[closed]:blur-[2px]
              data-[closed]:translate-y-6 sm:data-[closed]:translate-y-0 sm:data-[closed]:scale-[0.97]
              motion-reduce:duration-150 motion-reduce:data-[closed]:translate-y-0 motion-reduce:data-[closed]:scale-100 motion-reduce:data-[closed]:blur-0`}
          >
            <div className="sm:hidden pt-3 pb-1 flex justify-center flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-hairline/[0.08]" />
            </div>

            <div className="flex items-start justify-between gap-4 px-5 sm:px-6 py-4 border-b border-hairline/[0.07] flex-shrink-0">
              <div className="min-w-0">
                <DialogTitle className="text-lg font-semibold text-content truncate">
                  {title}
                </DialogTitle>
                {description && (
                  <p className="text-sm text-content-subtle mt-0.5">{description}</p>
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
              className={`overflow-y-auto overscroll-contain px-5 sm:px-6 py-5 flex-1 transition-opacity duration-150 ${
                busy ? 'opacity-60 pointer-events-none' : ''
              }`}
              aria-busy={busy || undefined}
            >
              {children}
            </div>

            {footer && (
              <div className="flex-shrink-0 px-5 sm:px-6 py-4 border-t border-hairline/[0.07] bg-surface-sunken rounded-b-2xl pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4">
                {footer}
              </div>
            )}
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
}
