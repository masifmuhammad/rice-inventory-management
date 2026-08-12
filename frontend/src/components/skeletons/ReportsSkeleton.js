import React from 'react';
import {
  Skeleton,
  SkeletonChart,
  SkeletonGate,
  SkeletonPageHeader,
  SkeletonStatCards,
  SkeletonTable,
} from '../ui/Skeleton';

export default function ReportsSkeleton() {
  return (
    <SkeletonGate className="space-y-6" aria-busy="true" aria-label="Loading reports">
      <SkeletonPageHeader />
      <SkeletonStatCards count={3} />
      <div className="surface-card rounded-card p-5">
        <Skeleton className="h-5 w-44 mb-4" />
        <SkeletonChart height={300} />
      </div>
      <div className="surface-card rounded-card overflow-hidden">
        <SkeletonTable rows={5} columns={4} />
      </div>
    </SkeletonGate>
  );
}
