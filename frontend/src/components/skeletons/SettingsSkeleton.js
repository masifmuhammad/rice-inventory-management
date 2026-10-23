import React from 'react';
import { SkeletonFormCard, SkeletonGate, SkeletonPageHeader } from '../ui/Skeleton';
import { translate, useAppLanguage } from '../../context/LanguageContext';

export default function SettingsSkeleton() {
  useAppLanguage();
  return (
    <SkeletonGate className="space-y-6" aria-busy="true" aria-label={translate("Loading settings")}>
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
