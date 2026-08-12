import React from 'react';
import { Skeleton, SkeletonGate, SkeletonText } from '../ui/Skeleton';

/** Centered card skeleton for login / change-password while auth initialises. */
export default function AuthShellSkeleton() {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12 app-gradient"
      aria-busy="true"
      aria-label="Loading"
    >
      <SkeletonGate className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8 space-y-3">
          <Skeleton className="w-16 h-16 rounded-2xl" />
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="surface-card rounded-card p-6 sm:p-8 space-y-5">
          <SkeletonText lines={2} />
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Skeleton className="h-3.5 w-16" />
              <Skeleton className="h-11 w-full rounded-lg" />
            </div>
            <div className="space-y-1.5">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-11 w-full rounded-lg" />
            </div>
          </div>
          <Skeleton className="h-11 w-full rounded-lg" />
        </div>
      </SkeletonGate>
    </div>
  );
}
