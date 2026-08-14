import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FiMic, FiX } from 'react-icons/fi';
import Button from './ui/Button';
import BrandLogo from './BrandLogo';
import { usePrefersReducedMotion } from '../hooks/useMediaQuery';
import { springUI, reducedTransition } from '../utils/motion';
import {
  getMicPermissionState,
  isSecureMicContext,
  micErrorMessage,
  requestMicrophoneAccess,
} from '../utils/microphone';
import { feedbackTick, unlockFeedbackAudio } from '../utils/feedback';
import { toast } from '../utils/toast';

const DISMISS_KEY = 'rim.mic.permission.dismissed';

/**
 * One-time prompt after login so phones can grant mic access before the
 * assistant is opened. Dismiss = typing-only; never blocks the app.
 */
export default function MicPermissionPrompt() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY)) return undefined;
    let cancelled = false;

    (async () => {
      if (!isSecureMicContext()) {
        if (!cancelled) setVisible(true);
        return;
      }
      const state = await getMicPermissionState();
      if (cancelled) return;
      if (state === 'granted') {
        localStorage.setItem(DISMISS_KEY, '1');
        return;
      }
      if (state === 'prompt' || state === 'denied' || state === 'unsupported') {
        setVisible(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setVisible(false);
  };

  const allow = async () => {
    unlockFeedbackAudio();
    setBusy(true);
    try {
      await requestMicrophoneAccess({ keepAlive: false });
      feedbackTick();
      toast.success('Microphone ready', { feedback: 'tick' });
      dismiss();
    } catch (error) {
      toast.error(micErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const enterTransition = reducedMotion ? reducedTransition : springUI;
  const enterFrom = reducedMotion ? { opacity: 0 } : { opacity: 0, y: 16 };
  const enterTo = reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          role="dialog"
          aria-label="Microphone access"
          initial={enterFrom}
          animate={enterTo}
          exit={enterFrom}
          transition={enterTransition}
          className="fixed bottom-[calc(var(--app-tabbar-height)+env(safe-area-inset-bottom)+5.5rem)] inset-x-3 z-[45] lg:bottom-4 lg:left-auto lg:right-4 lg:max-w-sm"
        >
          <div className="surface-card rounded-card p-4 shadow-lg flex items-start gap-3">
            <BrandLogo size={36} rounded="rounded-xl" className="shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-content flex items-center gap-1.5">
                <FiMic className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400" aria-hidden="true" />
                Voice assistant
              </p>
              <p className="text-xs text-content-subtle mt-1 text-pretty">
                {isSecureMicContext()
                  ? 'Allow the microphone so you can speak orders. You can always type instead.'
                  : 'Voice needs HTTPS on phones. You can keep using the app by typing.'}
              </p>
              <div className="mt-3 flex gap-2">
                {isSecureMicContext() ? (
                  <Button size="sm" loading={busy} onClick={allow}>
                    Allow microphone
                  </Button>
                ) : null}
                <Button size="sm" variant="ghost" onClick={dismiss} disabled={busy}>
                  Use typing
                </Button>
              </div>
            </div>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss microphone prompt"
              className="grid place-items-center min-h-[44px] min-w-[44px] rounded-lg hover:bg-hairline/[0.05]"
            >
              <FiX className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
