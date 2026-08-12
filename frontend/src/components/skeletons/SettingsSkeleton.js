import React from 'react';
import { SkeletonFormCard, SkeletonGate, SkeletonPageHeader } from '../ui/Skeleton';

export default function SettingsSkeleton() {
  return (
    <SkeletonGate className="space-y-6" aria-busy="true" aria-label="Loading settings">
      <SkeletonPageHeader withActions={false} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SkeletonFormCard fields={4} />
        <SkeletonFormCard fields={3} />
        <SkeletonFormCard fields={3} />
        <SkeletonFormCard fields={3} />
      </div>
    </SkeletonGate>
  );
}
