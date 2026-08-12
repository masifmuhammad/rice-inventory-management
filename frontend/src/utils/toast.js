import { toast as sonnerToast } from 'sonner';
import {
  feedbackDownload,
  feedbackError,
  feedbackSuccess,
  feedbackTick,
  feedbackWarning,
} from './feedback';

const withFeedback = (fn, play) => (message, options) => {
  play();
  return fn(message, options);
};

/**
 * Drop-in replacement for `sonner`'s toast — same API, plus haptics/sound
 * on success / error / warning. Use `toast.success(..., { feedback: 'download' })`
 * for report exports.
 */
export const toast = Object.assign(
  (...args) => sonnerToast(...args),
  {
    ...sonnerToast,
    success: (message, options = {}) => {
      const kind = options.feedback || 'success';
      if (kind === 'download') feedbackDownload();
      else if (kind === 'tick') feedbackTick();
      else if (kind !== 'none') feedbackSuccess();
      const { feedback: _f, ...rest } = options;
      return sonnerToast.success(message, rest);
    },
    error: withFeedback(sonnerToast.error, feedbackError),
    warning: withFeedback(sonnerToast.warning, feedbackWarning),
    message: sonnerToast.message,
    info: sonnerToast.info || sonnerToast.message,
    loading: sonnerToast.loading,
    promise: sonnerToast.promise,
    dismiss: sonnerToast.dismiss,
    custom: sonnerToast.custom,
  }
);
