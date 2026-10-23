import { toast as sonnerToast } from 'sonner';
import React from 'react';
import { useAppLanguage } from '../context/LanguageContext';
import {
  feedbackDownload,
  feedbackError,
  feedbackSuccess,
  feedbackTick,
  feedbackWarning,
} from './feedback';

function ToastMessage({ value }) {
  const { t } = useAppLanguage();
  return <>{t(value)}</>;
}
const localMessage = (value) => typeof value === 'string' ? <ToastMessage value={value} /> : value;
const withFeedback = (fn, play) => (message, options) => {
  play();
  return fn(localMessage(message), options);
};

/**
 * Drop-in replacement for `sonner`'s toast — same API, plus haptics/sound
 * on success / error / warning. Use `toast.success(..., { feedback: 'download' })`
 * for report exports.
 */
export const toast = Object.assign(
  (message, options) => sonnerToast(localMessage(message), options),
  {
    ...sonnerToast,
    success: (message, options = {}) => {
      const kind = options.feedback || 'success';
      if (kind === 'download') feedbackDownload();
      else if (kind === 'tick') feedbackTick();
      else if (kind !== 'none') feedbackSuccess();
      const { feedback: _f, ...rest } = options;
      return sonnerToast.success(localMessage(message), rest);
    },
    error: withFeedback(sonnerToast.error, feedbackError),
    warning: withFeedback(sonnerToast.warning, feedbackWarning),
    message: (message, options) => sonnerToast.message(localMessage(message), options),
    info: (message, options) => (sonnerToast.info || sonnerToast.message)(localMessage(message), options),
    loading: (message, options) => sonnerToast.loading(localMessage(message), options),
    promise: sonnerToast.promise,
    dismiss: sonnerToast.dismiss,
    custom: sonnerToast.custom,
  }
);
