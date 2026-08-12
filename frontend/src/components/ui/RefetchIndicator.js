import React from 'react';
import { FiRefreshCw } from 'react-icons/fi';

/**
 * Non-blocking stale-while-revalidate indicator. Sits on the content region
 * so users know data is refreshing without replacing the layout.
 */
export default function RefetchIndicator({ active, className = '', label = 'Updating' }) {
  if (!active) return null;

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs text-content-subtle ${className}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <FiRefreshCw className="w-3 h-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      {label}…
    </span>
  );
}

/** Wraps a section and marks it busy while refetching with stale data visible. */
export function RefetchSection({ active, children, className = '' }) {
  return (
    <div className={`relative ${className}`} aria-busy={active || undefined}>
      {active && (
        <div className="absolute top-3 right-3 z-10">
          <RefetchIndicator active />
        </div>
      )}
      {children}
    </div>
  );
}
