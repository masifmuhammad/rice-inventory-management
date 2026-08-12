import React from 'react';
import { Skeleton, SkeletonGate, SkeletonPageHeader } from '../ui/Skeleton';

export default function BusinessesSkeleton() {
  return (
    <SkeletonGate className="space-y-6" aria-busy="true" aria-label="Loading businesses">
      <SkeletonPageHeader />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="surface-card rounded-card p-5 space-y-4"
          >
            <div className="flex items-center gap-3">
              <Skeleton className="w-12 h-12 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </SkeletonGate>
  );
}
