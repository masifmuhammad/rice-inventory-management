import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { FiAlertTriangle } from 'react-icons/fi';
import Modal from './Modal';
import Button from './Button';

const ConfirmContext = createContext(null);

/**
 * Replaces `window.confirm`, which blocks the main thread, cannot be styled, and
 * on mobile browsers is easy to dismiss by accident.
 *
 *   const confirm = useConfirm();
 *   if (await confirm({ title: 'Delete this?', tone: 'danger' })) { ... }
 */
export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const resolverRef = useRef(null);

  const confirm = useCallback(
    (options) =>
      new Promise((resolve) => {
        // A superseded confirm must still settle. Overwriting the resolver left
        // the earlier `await confirm(...)` pending for the life of the page, so
        // whatever it guarded — a spinner, a "deleting" row state — never came
        // back.
        resolverRef.current?.(false);
        resolverRef.current = resolve;
        setState({
          title: 'Are you sure?',
          message: '',
          confirmLabel: 'Confirm',
          cancelLabel: 'Cancel',
          tone: 'danger',
          ...options,
        });
      }),
    []
  );

  const settle = useCallback((result) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setBusy(false);
    setState(null);
  }, []);

  // Nothing pending survives the provider unmounting.
  useEffect(
    () => () => {
      resolverRef.current?.(false);
      resolverRef.current = null;
    },
    []
  );

  const handleConfirm = useCallback(async () => {
    // Keep the dialog up while an async onConfirm runs, so the row does not
    // vanish before the server has actually agreed.
    if (state?.onConfirm) {
      setBusy(true);
      try {
        await state.onConfirm();
        settle(true);
      } catch {
        // `finally { settle(true) }` reported success even when the action had
        // thrown — the caller then removed a row the server still holds — and
        // let the rejection escape as an unhandled promise. A failed action is
        // not a confirmation; the caller's own handling inside onConfirm owns
        // the error message.
        settle(false);
      }
      return;
    }
    settle(true);
  }, [state, settle]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}

      <Modal
        open={Boolean(state)}
        onClose={() => !busy && settle(false)}
        title={state?.title || ''}
        size="sm"
        footer={
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button variant="secondary" onClick={() => settle(false)} disabled={busy}>
              {state?.cancelLabel}
            </Button>
            <Button
              variant={state?.tone === 'danger' ? 'danger' : 'primary'}
              onClick={handleConfirm}
              loading={busy}
            >
              {state?.confirmLabel}
            </Button>
          </div>
        }
      >
        <div className="flex gap-4">
          {state?.tone === 'danger' && (
            <span className="flex-shrink-0 w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
              <FiAlertTriangle className="w-5 h-5 text-red-500" aria-hidden="true" />
            </span>
          )}
          <p className="text-sm text-content-muted leading-relaxed pt-2">{state?.message}</p>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error('useConfirm must be used inside a ConfirmProvider');
  return context;
}

export default ConfirmProvider;
