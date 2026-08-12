import React from 'react';
import { Skeleton, SkeletonChart, SkeletonGate, SkeletonPageHeader, SkeletonStatCards } from '../ui/Skeleton';

export default function DashboardSkeleton() {
  return (
    <SkeletonGate className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
      <SkeletonPageHeader withActions />
      <SkeletonStatCards />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="surface-card rounded-card p-5">
          <Skeleton className="h-5 w-40 mb-4" />
          <SkeletonChart height={280} />
        </div>
        <div className="surface-card rounded-card p-5">
          <Skeleton className="h-5 w-36 mb-4" />
          <SkeletonChart height={280} />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="surface-card rounded-card p-5 space-y-3">
            <Skeleton className="h-5 w-32" />
            {Array.from({ length: 4 }).map((__, j) => (
              <div key={j} className="flex items-center gap-3">
                <Skeleton className="w-8 h-8 rounded-lg" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </SkeletonGate>
  );
}
