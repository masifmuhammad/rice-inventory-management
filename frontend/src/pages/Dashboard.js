import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiArrowDownLeft, FiArrowRight, FiArrowUpRight, FiPackage, FiTrendingUp } from 'react-icons/fi';
import api from '../services/api';
import useApi from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { formatCompactMoney, formatMoney, formatNumber, formatQuantity } from '../utils/currency';
import { formatSafe } from '../utils/date';
import PageHeader from '../components/PageHeader';
import MobileBusinessSummary from '../components/MobileBusinessSummary';
import InventoryActions from '../components/InventoryActions';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { ErrorState, InlineError } from '../components/ui/States';
import { Skeleton } from '../components/ui/Skeleton';
import { translate, useAppLanguage } from '../context/LanguageContext';

const TYPES = { stock_in: 'Delivery', stock_out: 'Sale', adjustment: 'Adjustment', transfer: 'Transfer' };


const SalesOverview = lazy(() => import('./SalesOverview'));
function DeferredSalesOverview() {
  useAppLanguage();
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!window.IntersectionObserver) { setVisible(true); return undefined; }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '160px' });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} className="min-h-[350px]">{visible ? <Suspense fallback={<Skeleton className="h-[350px] rounded-card" />}><SalesOverview /></Suspense> : <Skeleton className="h-[350px] rounded-card" />}</div>;
}

export default function Dashboard() {
  useAppLanguage();
  const { can } = useAuth();
  const { currencySymbol } = useSettings();
  const navigate = useNavigate();
  const canReport = can('reports.view');
  const stats = useApi((signal) => api.get('/reports/dashboard', { signal }).then((r) => r.data), [], { keepPreviousData: true, cacheKey: 'reports/dashboard' });
  const recent = useApi((signal) => api.get('/transactions', { params: { limit: 5 }, signal }).then((r) => r.data), [], { cacheKey: 'transactions/home', keepPreviousData: true });
  const actions = [
    can('transactions.create') && { label: 'Record sale', icon: FiTrendingUp, path: '/transactions', state: { openCreate: true, transactionType: 'stock_out' } },
    can('cash.manage') && { label: 'Money in', icon: FiArrowDownLeft, path: '/cash-book', state: { openCreate: 'in' } },
    can('transactions.create') && { label: 'Add delivery', icon: FiPackage, path: '/transactions', state: { openCreate: true, transactionType: 'stock_in' } },
    can('cash.manage') && { label: 'Money out', icon: FiArrowUpRight, path: '/cash-book', state: { openCreate: 'out' } },
  ].filter(Boolean);
  const totalProducts = stats.data?.totalProducts || 0;
  const lowStockCount = stats.data?.lowStockCount || 0;
  const healthy = Math.max(0, totalProducts - lowStockCount);
  const transactions = recent.data?.data || [];
  if (stats.error && !stats.data) return <ErrorState title={translate("Could not load the dashboard")} message={translate(stats.error)} onRetry={stats.refetch} />;
  return (
    <div className="space-y-5 sm:space-y-6 max-w-[1400px] mx-auto">
      <PageHeader summary={translate(canReport && stats.data ? 'Stock ' + formatCompactMoney(stats.data.totalStockValue, currencySymbol) + (can('cash.view') ? ' | Cash ' + formatCompactMoney(stats.data.cashBalance, currencySymbol) : '') : totalProducts + ' products')} title={translate("Dashboard")} description={translate("Your business, in balance.")} actions={canReport && <Link to="/reports" className="hidden sm:inline-flex items-center gap-2 text-sm text-content-muted min-h-[44px]">{translate("View reports ")}<FiArrowUpRight aria-hidden="true" /></Link>} />
      {stats.error && <InlineError message={translate(stats.error)} onRetry={stats.refetch} />}
      <InventoryActions />
      <MobileBusinessSummary stats={stats.data} loading={stats.loading && !stats.data} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5" aria-label={translate("Quick actions")}>
        {actions.map(({ label, icon, path, state }) => <Button key={label} variant="secondary" icon={icon} onClick={() => navigate(path, { state })} className="min-h-[50px] text-[13px] sm:text-sm">{translate(label)}</Button>)}
      </div>
      <div className="grid xl:grid-cols-[1.4fr_1fr] gap-5 sm:gap-6 items-start">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 sm:px-6 pt-5 pb-3"><h2 className="text-base font-semibold tracking-tight text-content">{translate("Recent activity")}</h2><Link to="/transactions" className="text-xs text-content-muted min-h-[44px] inline-flex items-center gap-1">{translate("View all ")}<FiArrowRight aria-hidden="true" /></Link></div>
          {recent.error ? <div className="p-4"><InlineError message={translate(recent.error)} onRetry={recent.refetch} /></div> : recent.loading && !recent.data ? <div className="px-5 pb-5 space-y-4">{[1, 2, 3].map((n) => <Skeleton key={n} className="h-12 w-full" />)}</div> : transactions.length ? <ul className="divide-y divide-hairline/[0.06] px-4 sm:px-6">
            {transactions.map((entry) => <li key={entry._id} className="flex items-center gap-3 py-4">
              <span className="text-content-muted shrink-0" aria-hidden="true">{entry.type === 'stock_in' ? <FiArrowDownLeft className="w-5 h-5" /> : <FiArrowUpRight className="w-5 h-5" />}</span>
              <div className="min-w-0 flex-1"><p className="text-sm text-content font-medium truncate">{translate(entry.product?.name || 'Archived product')}</p><p className="text-xs text-content-subtle mt-1">{translate(TYPES[entry.type] || entry.type)} &middot; {translate(formatSafe(entry.createdAt, 'd MMM, h:mm a'))}</p></div>
              <div className="text-right min-w-0"><p className="text-sm text-content tabular-nums font-medium">{translate(formatQuantity(entry.quantity, entry.unit))}</p>{canReport && <p className="text-xs text-content-muted tabular-nums mt-1">{translate(formatMoney(entry.totalValue, currencySymbol))}</p>}</div>
            </li>)}
          </ul> : <div className="px-5 pb-8 pt-3"><p className="text-sm text-content-muted">{translate("No stock movements yet.")}</p><p className="text-xs text-content-subtle mt-2">{translate("Record a delivery or sale to start your history.")}</p></div>}
        </Card>
        <div className="space-y-5 sm:space-y-6">
          <Card className="p-4 sm:p-6">
            <div className="flex justify-between items-center gap-3"><h2 className="text-base font-semibold tracking-tight text-content">{translate("Stock health")}</h2><Link to="/products" aria-label={translate("View stock")} className="min-h-[44px] min-w-[44px] grid place-items-center text-content-muted"><FiArrowUpRight aria-hidden="true" /></Link></div>
            {stats.loading && !stats.data ? <Skeleton className="h-16 w-full mt-3" /> : <>
              <p className="text-sm text-content-muted mt-1"><span className="text-content font-medium tabular-nums">{translate(formatNumber(healthy))}</span>{translate(" of ")}{translate(formatNumber(totalProducts))}{translate(" products above reorder level")}</p>
              <div className="flex h-1.5 overflow-hidden rounded-full bg-surface-sunken mt-4" aria-hidden="true"><div className="bg-emerald-700 h-full" style={{ width: totalProducts ? (healthy / totalProducts * 100) + '%' : '0%' }} /><div className="bg-amber-500 h-full" style={{ width: totalProducts ? (lowStockCount / totalProducts * 100) + '%' : '0%' }} /></div>
              {lowStockCount > 0 ? <button type="button" onClick={() => navigate('/products', { state: { lowStockOnly: true } })} className="flex items-center justify-between gap-3 w-full text-left min-h-[48px] mt-3 text-sm text-amber-700 dark:text-amber-400"><span>{translate(formatNumber(lowStockCount))} {translate(lowStockCount === 1 ? 'product needs' : 'products need')}{translate(" restocking")}</span><FiArrowRight aria-hidden="true" /></button> : <p className="text-xs text-content-subtle mt-4">{translate(totalProducts ? 'No low stock alerts.' : 'Add your first product to begin.')}</p>}
            </>}
          </Card>
          {canReport && <DeferredSalesOverview />}
        </div>
      </div>
    </div>
  );
}
