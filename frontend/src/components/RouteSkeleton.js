import React from 'react';
import DashboardSkeleton from './skeletons/DashboardSkeleton';
import ListPageSkeleton from './skeletons/ListPageSkeleton';
import ReportsSkeleton from './skeletons/ReportsSkeleton';
import SettingsSkeleton from './skeletons/SettingsSkeleton';
import BusinessesSkeleton from './skeletons/BusinessesSkeleton';

function matchRoute(pathname) {
  if (pathname === '/' || pathname === '') return 'dashboard';
  if (pathname.startsWith('/products')) return 'products';
  if (pathname.startsWith('/transactions')) return 'transactions';
  if (pathname.startsWith('/cash-book')) return 'cash-book';
  if (pathname.startsWith('/reports')) return 'reports';
  if (pathname.startsWith('/settings')) return 'settings';
  if (pathname.startsWith('/admin/users')) return 'admin-users';
  if (pathname.startsWith('/admin/activity')) return 'admin-activity';
  if (pathname.startsWith('/admin/businesses')) return 'businesses';
  return 'list';
}

/** Route-aware Suspense fallback — layout-matched skeleton, not a spinner. */
export default function RouteSkeleton({ pathname = '/' }) {
  const route = matchRoute(pathname);

  switch (route) {
    case 'dashboard':
      return <DashboardSkeleton />;
    case 'reports':
      return <ReportsSkeleton />;
    case 'settings':
      return <SettingsSkeleton />;
    case 'businesses':
      return <BusinessesSkeleton />;
    case 'transactions':
      return <ListPageSkeleton statCards={false} tableRows={8} />;
    case 'cash-book':
      return <ListPageSkeleton statCards tableRows={8} />;
    case 'admin-users':
      return <ListPageSkeleton statCards tableRows={6} />;
    case 'admin-activity':
      return <ListPageSkeleton statCards={false} tableRows={8} />;
    case 'products':
    default:
      return <ListPageSkeleton statCards tableRows={6} />;
  }
}
