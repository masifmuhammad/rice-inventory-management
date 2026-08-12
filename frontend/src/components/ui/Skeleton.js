import React, { createContext, useContext, useEffect, useState } from 'react';

/**
 * Loading placeholders are sized to match the real content they stand in for.
 * A spinner that gets replaced by a taller layout shifts the whole page; a
 * skeleton of the right height does not.
 *
 * They are also deliberately late. A placeholder that appears the instant a
 * request starts flashes for two frames on a fast connection, which reads as a
 * glitch rather than as feedback — so nothing is drawn until the wait has
 * lasted long enough to be worth acknowledging. If the data arrives first, the
 * skeleton is never painted at all and the content simply appears.
 */

/** How long a wait has to last before it earns a placeholder. */
export const SKELETON_GRACE_MS = 220;

/**
 * True when an ancestor has already served the grace period. Route-level
 * skeletons wrap whole layouts, so without this the composites nested inside
 * them would wait a second time and double the delay.
 */
const AlreadyWaited = createContext(false);

/**
 * Delays a placeholder's first paint, unless an ancestor already did the waiting.
 */
export function useSkeletonGate(delay = SKELETON_GRACE_MS) {
  const gatedByAncestor = useContext(AlreadyWaited);
  const [ready, setReady] = useState(() => gatedByAncestor || delay <= 0);

  useEffect(() => {
    if (gatedByAncestor || delay <= 0) {
      setReady(true);
      return undefined;
    }

    const timer = setTimeout(() => setReady(true), delay);
    return () => clearTimeout(timer);
  }, [gatedByAncestor, delay]);

  return ready;
}

/**
 * Wraps a group of placeholders in a single grace period. Use this around
 * hand-built skeleton layouts so the whole block appears at once, rather than
 * its container showing up empty while the bars inside are still waiting.
 */
export function SkeletonGate({ delay = SKELETON_GRACE_MS, className = '', children, ...props }) {
  const visible = useSkeletonGate(delay);
  if (!visible) return null;

  return (
    <AlreadyWaited.Provider value>
      <div className={`skeleton-appear ${className}`} {...props}>
        {children}
      </div>
    </AlreadyWaited.Provider>
  );
}

export function Skeleton({ className = '', ...props }) {
  return (
    <div
      className={`animate-pulse motion-reduce:animate-none bg-hairline/[0.08] rounded-lg ${className}`}
      aria-hidden="true"
      {...props}
    />
  );
}

export function SkeletonText({ lines = 3, className = '' }) {
  const visible = useSkeletonGate();
  if (!visible) return null;

  return (
    <div className={`skeleton-appear space-y-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-4 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </div>
  );
}

export function SkeletonStatCards({ count = 4 }) {
  const visible = useSkeletonGate();
  if (!visible) return null;

  return (
    <div className="skeleton-appear surface-card rounded-card overflow-hidden" aria-hidden="true">
      <div className="stat-grid">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="p-4 sm:p-5 space-y-2.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-2.5 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5, columns = 5 }) {
  const visible = useSkeletonGate();
  if (!visible) return null;

  return (
    <div className="skeleton-appear divide-y divide-hairline" aria-hidden="true">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 sm:px-6 py-4">
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={c} className={`h-4 ${c === 0 ? 'w-1/4' : 'flex-1'}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonChart({ height = 300 }) {
  const visible = useSkeletonGate();
  if (!visible) return null;

  return (
    <div className="skeleton-appear flex items-end gap-2 px-2" style={{ height }} aria-hidden="true">
      {[45, 70, 55, 85, 40, 65, 75, 50, 80, 60].map((h, i) => (
        <Skeleton key={i} className="flex-1 rounded-t" style={{ height: `${h}%` }} />
      ))}
    </div>
  );
}

export function SkeletonPageHeader({ withActions = true }) {
  const visible = useSkeletonGate();
  if (!visible) return null;

  return (
    <div
      className="skeleton-appear flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
      aria-hidden="true"
    >
      <div className="space-y-2 min-w-0">
        <Skeleton className="h-8 w-48 hidden lg:block" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      {withActions && (
        <div className="flex gap-2">
          <Skeleton className="h-11 w-32 rounded-xl" />
        </div>
      )}
    </div>
  );
}

export function SkeletonFormCard({ fields = 3 }) {
  const visible = useSkeletonGate();
  if (!visible) return null;

  return (
    <div className="skeleton-appear surface-card rounded-card overflow-hidden" aria-hidden="true">
      <div className="px-5 py-4 border-b border-hairline/[0.07]">
        <Skeleton className="h-5 w-36" />
      </div>
      <div className="p-5 space-y-4">
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-11 w-full rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default Skeleton;
