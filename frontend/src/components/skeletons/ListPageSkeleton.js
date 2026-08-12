import React from 'react';
import { SkeletonGate, SkeletonPageHeader, SkeletonStatCards, SkeletonTable } from '../ui/Skeleton';

export default function ListPageSkeleton({ statCards = true, tableRows = 6 }) {
  return (
    <SkeletonGate className="space-y-6" aria-busy="true" aria-label="Loading page">
      <SkeletonPageHeader />
      {statCards && <SkeletonStatCards count={4} />}
      <div className="surface-card rounded-card overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-hairline/[0.07] flex gap-3">
          <div className="h-10 w-full max-w-xs bg-hairline/[0.08] rounded-lg animate-pulse motion-reduce:animate-none" />
          <div className="h-10 w-24 bg-hairline/[0.08] rounded-lg animate-pulse motion-reduce:animate-none hidden sm:block" />
        </div>
        <SkeletonTable rows={tableRows} columns={5} />
      </div>
    </SkeletonGate>
  );
}
