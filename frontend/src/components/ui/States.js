import React from 'react';
import { FiAlertTriangle, FiInbox, FiRefreshCw, FiWifiOff } from 'react-icons/fi';
import Button from './Button';

/** Shown when a request succeeded but there is nothing yet. Always offers the next step. */
export function EmptyState({ icon: Icon = FiInbox, title, description, action, className = '' }) {
  return (
    <div className={`text-center px-6 py-14 ${className}`}>
      <div className="w-14 h-14 rounded-full bg-hairline/[0.08] flex items-center justify-center mx-auto mb-4">
        <Icon className="w-6 h-6 text-content-subtle" aria-hidden="true" />
      </div>
      <p className="text-content font-medium">{title}</p>
      {description && <p className="text-sm text-content-subtle mt-1 max-w-sm mx-auto">{description}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

/**
 * Shown when a request failed. A dead end with no way back is the most
 * frustrating state in an app, so this always carries a retry.
 */
export function ErrorState({ title = 'Could not load this', message, onRetry, className = '' }) {
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const Icon = offline ? FiWifiOff : FiAlertTriangle;

  return (
    <div className={`text-center px-6 py-14 ${className}`} role="alert">
      <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
        <Icon className="w-6 h-6 text-red-500" aria-hidden="true" />
      </div>
      <p className="text-content font-medium">{offline ? 'You are offline' : title}</p>
      <p className="text-sm text-content-subtle mt-1 max-w-sm mx-auto">
        {offline ? 'Reconnect to load this page.' : message}
      </p>
      {onRetry && (
        <div className="mt-5 flex justify-center">
          <Button variant="secondary" icon={FiRefreshCw} onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}

/** A small inline banner for non-blocking problems (a widget failed, the page did not). */
export function InlineError({ message, onRetry, className = '' }) {
  return (
    <div
      className={`flex items-start gap-3 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 ${className}`}
      role="alert"
    >
      <FiAlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
      <p className="text-sm text-red-500 flex-1">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="text-sm font-medium text-red-500 hover:text-red-400 underline underline-offset-2 flex-shrink-0"
        >
          Retry
        </button>
      )}
    </div>
  );
}
