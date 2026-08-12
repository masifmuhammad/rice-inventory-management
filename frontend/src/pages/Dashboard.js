import React, { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from '../utils/toast';
import {
  FiActivity,
  FiAlertCircle,
  FiArrowRight,
  FiClock,
  FiDollarSign,
  FiDownload,
  FiPackage,
  FiShoppingCart,
  FiTrendingUp,
} from 'react-icons/fi';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import api from '../services/api';
import useApi from '../hooks/useApi';
import { useSettings } from '../context/SettingsContext';
import { useTheme } from '../context/ThemeContext';
import { formatCompactMoney, formatMoney, formatNumber, formatQuantity } from '../utils/currency';
import PageHeader from '../components/PageHeader';
import PillFilter from '../components/ui/PillFilter';
import Button from '../components/ui/Button';
import Card, { CardBody, CardHeader } from '../components/ui/Card';
import StatCard, { StatGrid } from '../components/ui/StatCard';
import AnimatedValue from '../components/ui/AnimatedValue';
import { EmptyState, ErrorState, InlineError } from '../components/ui/States';
import { SkeletonChart, SkeletonGate, SkeletonStatCards, Skeleton } from '../components/ui/Skeleton';
import { RefetchSection } from '../components/ui/RefetchIndicator';
import { usePrefersReducedMotion } from '../hooks/useMediaQuery';
import { staggerContainer, staggerItem as staggerItemVariants, staggerItemReduced } from '../utils/motion';

const RANGES = [
  { value: '7', label: '1W', full: 'Last 7 days' },
  { value: '30', label: '1M', full: 'Last 30 days' },
  { value: '90', label: '3M', full: 'Last 90 days' },
  { value: '180', label: '6M', full: 'Last 6 months' },
  { value: '365', label: '1Y', full: 'Last year' },
];

const CHART_COLORS = ['#0284c7', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#ef4444'];

/** Charts need a parent with a real height or ResponsiveContainer collapses to 0. */
function ChartFrame({ height = 280, loading, empty, emptyLabel, children }) {
  if (loading) return <SkeletonChart height={height} />;

  if (empty) {
    return (
      <div className="flex items-center justify-center text-sm text-content-subtle" style={{ height }}>
        {emptyLabel}
      </div>
    );
  }

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

/** Zero-fill missing days so sparse data still reads as a full timeline. */
function fillTrendDates(trends, dayCount) {
  const map = new Map((trends || []).map((row) => [row.date, row]));
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - dayCount + 1);

  const filled = [];
  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const key = cursor.toISOString().slice(0, 10);
    const row = map.get(key);
    filled.push({
      date: key,
      stock_in: row?.stock_in ?? 0,
      stock_out: row?.stock_out ?? 0,
      revenue: row?.revenue ?? 0,
    });
  }
  return filled;
}

function formatChartDate(value) {
  const text = String(value);
  const date = new Date(`${text}T12:00:00`);
  if (Number.isNaN(date.getTime())) return text.slice(5);
  return date.toLocaleDateString('en-PK', { month: 'short', day: 'numeric' });
}

function MovementTooltip({ active, payload, label, currencySymbol }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  return (
    <div className="rounded-well border border-hairline/[0.07] bg-surface-1 px-3 py-2.5 text-sm shadow-lg">
      <p className="font-medium text-content mb-1.5">{formatChartDate(label)}</p>
      <div className="space-y-1 text-xs">
        <p className="text-emerald-500 tabular-nums">Stock in: {formatNumber(row.stock_in, 2)} kg</p>
        <p className="text-red-500 tabular-nums">Stock out: {formatNumber(row.stock_out, 2)} kg</p>
        <p className="text-primary-600 dark:text-primary-400 tabular-nums">Revenue: {formatMoney(row.revenue, currencySymbol)}</p>
      </div>
    </div>
  );
}

function CategoryTooltip({ active, payload, currencySymbol }) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="rounded-well border border-hairline/[0.07] bg-surface-1 px-3 py-2 text-sm shadow-lg">
      <p className="font-medium text-content">{item.name}</p>
      <p className="text-content-muted tabular-nums mt-0.5">
        {formatMoney(item.value, currencySymbol)}
      </p>
    </div>
  );
}

export default function Dashboard() {
  const { currencySymbol, settings } = useSettings();
  const { isDark } = useTheme();
  const [range, setRange] = useState('30');
  const [exporting, setExporting] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const staggerItem = reducedMotion ? staggerItemReduced : staggerItemVariants;

  const chartTheme = useMemo(
    () => ({
      grid: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(9,9,11,0.07)',
      axis: isDark ? '#8a8a95' : '#8e8e97',
      legend: isDark ? '#9f9faa' : '#6a6a74',
    }),
    [isDark]
  );

  const rangeParams = useMemo(() => {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(range, 10));
    return { startDate: startDate.toISOString(), endDate: endDate.toISOString() };
  }, [range]);

  // Three independent requests, three independent failure modes. One slow
  // analytics query should not blank out the headline numbers.
  const stats = useApi(
    (signal) => api.get('/reports/dashboard', { signal }).then((r) => r.data),
    [],
    { keepPreviousData: true }
  );

  const analytics = useApi(
    (signal) => api.get('/reports/bi-analytics', { params: rangeParams, signal }).then((r) => r.data),
    [rangeParams],
    { keepPreviousData: true }
  );

  const profit = useApi(
    (signal) => api.get('/reports/profit-analysis', { params: rangeParams, signal }).then((r) => r.data),
    [rangeParams],
    { keepPreviousData: true }
  );

  const handleExport = useCallback(async () => {
    setExporting(true);
    const toastId = toast.loading('Building your report…');

    try {
      const { data } = await api.get('/reports/stock-value');

      if (!data.products?.length) {
        toast.error('There are no products to report on yet.', { id: toastId });
        return;
      }

      // jsPDF is ~350KB. Loading it on demand keeps it out of the main bundle.
      const { generateInventoryReportPDF } = await import('../utils/pdfGenerator');
      await generateInventoryReportPDF(data.products, data.summary, settings);

      toast.success('Report downloaded', { id: toastId, feedback: 'download' });
    } catch (error) {
      toast.error('Could not build the report. Please try again.', { id: toastId });
    } finally {
      setExporting(false);
    }
  }, [settings]);

  const trends = stats.data?.trends || {};
  const activity = stats.data?.recentActivity || {};

  const categoryChart = useMemo(
    () =>
      (analytics.data?.categoryAnalysis || [])
        .map((c) => ({
          name: c.category,
          value: c.totalValue > 0 ? c.totalValue : c.totalPotentialValue || 0,
          stock: c.totalStock || 0,
        }))
        .filter((c) => c.value > 0 || c.stock > 0)
        .sort((a, b) => b.value - a.value),
    [analytics.data]
  );

  const trendChartData = useMemo(
    () => fillTrendDates(analytics.data?.transactionTrends, parseInt(range, 10)),
    [analytics.data, range]
  );

  const trendTotals = useMemo(
    () =>
      trendChartData.reduce(
        (acc, row) => ({
          stockIn: acc.stockIn + row.stock_in,
          stockOut: acc.stockOut + row.stock_out,
          revenue: acc.revenue + row.revenue,
        }),
        { stockIn: 0, stockOut: 0, revenue: 0 }
      ),
    [trendChartData]
  );

  const hasMovement = trendTotals.stockIn > 0 || trendTotals.stockOut > 0 || trendTotals.revenue > 0;

  // The headline numbers are the page. If they fail, there is nothing to show.
  if (stats.error && !stats.data) {
    return (
      <ErrorState
        title="Could not load the dashboard"
        message={stats.error}
        onRetry={stats.refetch}
      />
    );
  }

  const loadingStats = stats.loading && !stats.data;
  const refetchingAnalytics = analytics.loading && Boolean(analytics.data);
  const refetchingProfit = profit.loading && Boolean(profit.data);
  const loadingProfit = profit.loading && !profit.data;

  return (
    <motion.div
      className="space-y-6"
      variants={staggerContainer}
      initial="hidden"
      animate="show"
    >
      <motion.div variants={staggerItem}>
      <PageHeader
        title="Dashboard"
        description="Stock, sales and cash at a glance."
        actions={
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
            <PillFilter
              options={RANGES.map((r) => ({ value: r.value, label: r.label }))}
              value={range}
              onChange={setRange}
              ariaLabel="Reporting period"
            />
            <Button icon={FiDownload} onClick={handleExport} loading={exporting} className="sm:shrink-0">
              Export report
            </Button>
          </div>
        }
      />
      </motion.div>

      {/* Headline numbers */}
      <motion.div variants={staggerItem}>
      {loadingStats ? (
        <SkeletonStatCards />
      ) : (
        <StatGrid>
          <StatCard
            title="Inventory value"
            rawValue={stats.data?.totalStockValue}
            valueType="compactMoney"
            currencySymbol={currencySymbol}
            fullValue={formatMoney(stats.data?.totalStockValue, currencySymbol)}
            hint={`${formatNumber(stats.data?.totalStockQuantity, 2)} units in stock`}
            icon={FiDollarSign}
          />
          <StatCard
            title="Products"
            rawValue={stats.data?.totalProducts}
            hint={`${formatCompactMoney(stats.data?.totalPotentialValue, currencySymbol)} at retail`}
            icon={FiPackage}
          />
          <StatCard
            title="Revenue (30 days)"
            rawValue={activity.revenue}
            valueType="compactMoney"
            currencySymbol={currencySymbol}
            fullValue={formatMoney(activity.revenue, currencySymbol)}
            change={trends.revenue}
            changeLabel="vs previous 30 days"
            icon={FiShoppingCart}
          />
          <StatCard
            title="Low stock alerts"
            rawValue={stats.data?.lowStockCount}
            hint={
              stats.data?.lowStockCount > 0 ? 'Needs restocking' : 'Everything is above minimum'
            }
            icon={FiAlertCircle}
            tone={stats.data?.lowStockCount > 0 ? 'danger' : 'neutral'}
          />
        </StatGrid>
      )}
      </motion.div>

      {analytics.error && (
        <InlineError message={`Analytics: ${analytics.error}`} onRetry={analytics.refetch} />
      )}

      {/* Trends + category mix */}
      <motion.div variants={staggerItem}>
      <RefetchSection active={refetchingAnalytics}>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Stock movement"
            subtitle={RANGES.find((r) => r.value === range)?.full}
            icon={FiActivity}
          />
          <CardBody className="pt-2">
            {!analytics.loading && analytics.data && (
              <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
                {[
                  { label: 'Stock in', value: `${formatNumber(trendTotals.stockIn, 1)} kg`, tone: 'text-emerald-500' },
                  { label: 'Stock out', value: `${formatNumber(trendTotals.stockOut, 1)} kg`, tone: 'text-red-500' },
                  { label: 'Revenue', value: formatCompactMoney(trendTotals.revenue, currencySymbol), tone: 'text-primary-600 dark:text-primary-400' },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg bg-surface-sunken px-3 py-2">
                    <p className="text-[10px] sm:text-xs font-medium text-content-subtle uppercase tracking-wide">{item.label}</p>
                    <p className={`text-sm sm:text-base font-semibold tabular-nums mt-0.5 ${item.tone}`}>{item.value}</p>
                  </div>
                ))}
              </div>
            )}
            <ChartFrame
              height={300}
              loading={analytics.loading && !analytics.data}
              empty={!hasMovement}
              emptyLabel="No stock movement in this period"
            >
              <ComposedChart data={trendChartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: chartTheme.axis }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={28}
                  tickFormatter={formatChartDate}
                />
                <YAxis
                  yAxisId="qty"
                  tick={{ fontSize: 11, fill: chartTheme.axis }}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  tickFormatter={(v) => formatNumber(v, 0)}
                />
                <YAxis
                  yAxisId="money"
                  orientation="right"
                  tick={{ fontSize: 11, fill: chartTheme.axis }}
                  tickLine={false}
                  axisLine={false}
                  width={52}
                  tickFormatter={(v) => formatCompactMoney(v, currencySymbol)}
                />
                <Tooltip content={<MovementTooltip currencySymbol={currencySymbol} />} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 8, color: chartTheme.legend }} />
                <Bar yAxisId="qty" dataKey="stock_in" name="Stock in" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={18} />
                <Bar yAxisId="qty" dataKey="stock_out" name="Stock out" fill="#fca5a5" radius={[3, 3, 0, 0]} maxBarSize={18} />
                <Line
                  yAxisId="money"
                  type="monotone"
                  dataKey="revenue"
                  name="Revenue"
                  stroke="#0284c7"
                  strokeWidth={2}
                  dot={{ r: 2, fill: '#0284c7' }}
                  activeDot={{ r: 4 }}
                />
              </ComposedChart>
            </ChartFrame>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Value by category" icon={FiPackage} />
          <CardBody className="pt-2">
            <ChartFrame
              height={300}
              loading={analytics.loading && !analytics.data}
              empty={!categoryChart.length}
              emptyLabel="No stock to break down yet"
            >
              <PieChart>
                <Pie
                  data={categoryChart}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="52%"
                  outerRadius="78%"
                  paddingAngle={2}
                  stroke="none"
                  label={({ name, percent }) => (percent >= 0.08 ? `${name} ${(percent * 100).toFixed(0)}%` : '')}
                  labelLine={false}
                >
                  {categoryChart.map((entry, index) => (
                    <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CategoryTooltip currencySymbol={currencySymbol} />} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: chartTheme.legend }} />
              </PieChart>
            </ChartFrame>
          </CardBody>
        </Card>
      </div>
      </RefetchSection>
      </motion.div>
      <motion.div variants={staggerItem}>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader
            title="Top selling products"
            subtitle="By revenue in the selected period"
            icon={FiTrendingUp}
            action={
              <Link
                to="/reports"
                className="text-sm font-medium text-primary-600 hover:text-primary-700 inline-flex items-center gap-1"
              >
                Reports <FiArrowRight className="w-4 h-4" />
              </Link>
            }
          />
          {analytics.loading && !analytics.data ? (
            <CardBody>
              <SkeletonGate className="space-y-3">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
                ))}
              </SkeletonGate>
            </CardBody>
          ) : analytics.data?.topProducts?.length ? (
            <ul className="divide-y divide-hairline">
              {analytics.data.topProducts.slice(0, 5).map((product, index) => (
                <li
                  key={product.id}
                  className="flex items-center gap-3 px-4 sm:px-6 py-3.5 hover:bg-hairline/[0.05] transition-colors"
                >
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-primary-500/12 text-primary-600 dark:text-primary-400 text-xs font-semibold flex items-center justify-center tabular-nums">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-content truncate">{product.name}</p>
                    <p className="text-xs text-content-subtle">
                      {formatQuantity(product.totalQuantitySold, product.unit)} sold ·{' '}
                      {product.category}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-content tabular-nums whitespace-nowrap">
                    {formatMoney(product.totalRevenue, currencySymbol)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={FiTrendingUp}
              title="No sales yet"
              description="Record a stock-out transaction and your best sellers will appear here."
              action={
                <Link to="/transactions">
                  <Button size="sm" variant="secondary">
                    Record a sale
                  </Button>
                </Link>
              }
            />
          )}
        </Card>

        <Card>
          <CardHeader title="Last 30 days" icon={FiActivity} />
          <CardBody>
            {loadingStats ? (
              <SkeletonGate className="space-y-4">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-lg" />
                ))}
              </SkeletonGate>
            ) : (
              <dl className="divide-y divide-hairline">
                {[
                  {
                    label: 'Stock in',
                    detail: 'Received into the warehouse',
                    value: activity.stockIn,
                    suffix: 'units',
                    tone: 'text-emerald-500',
                  },
                  {
                    label: 'Stock out',
                    detail: 'Sold or issued',
                    value: activity.stockOut,
                    suffix: 'units',
                    tone: 'text-red-500',
                  },
                  {
                    label: 'Transactions',
                    detail: 'All movements recorded',
                    value: activity.transactions,
                    tone: 'text-content',
                  },
                  {
                    label: 'Cash withdrawn',
                    detail: `${formatNumber(activity.cashWithdrawals)} withdrawals`,
                    value: activity.totalWithdrawn,
                    type: 'compactMoney',
                    tone: 'text-amber-500',
                  },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <dt className="text-sm font-medium text-content">{row.label}</dt>
                      <dd className="text-xs text-content-subtle truncate">{row.detail}</dd>
                    </div>
                    <dd className={`text-sm font-semibold tabular-nums whitespace-nowrap ${row.tone}`}>
                      <AnimatedValue
                        value={row.value}
                        type={row.type || 'number'}
                        symbol={currencySymbol}
                        figureClassName="font-semibold"
                        unitClassName="text-content-subtle font-normal"
                      />
                      {row.suffix && <span className="text-content-subtle font-normal ml-1">{row.suffix}</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </CardBody>
        </Card>
      </div>
      </motion.div>

      {/* Attention needed */}
      <motion.div variants={staggerItem}>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader
            title="Low stock"
            subtitle="At or below the minimum level"
            icon={FiAlertCircle}
            action={
              <Link
                to="/products"
                className="text-sm font-medium text-primary-600 hover:text-primary-700 inline-flex items-center gap-1"
              >
                Products <FiArrowRight className="w-4 h-4" />
              </Link>
            }
          />
          {loadingStats ? (
            <CardBody>
              <SkeletonGate className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-lg" />
                ))}
              </SkeletonGate>
            </CardBody>
          ) : stats.data?.lowStockProducts?.length ? (
            <ul className="divide-y divide-hairline">
              {stats.data.lowStockProducts.map((product) => (
                <li key={product.id} className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-content truncate">{product.name}</p>
                    <p className="text-xs text-content-subtle">{product.sku || 'No SKU'}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-red-500 tabular-nums">
                      {formatQuantity(product.currentStock, product.unit)}
                    </p>
                    <p className="text-xs text-content-subtle tabular-nums">
                      min {formatQuantity(product.minStockLevel, product.unit)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={FiPackage}
              title="Everything is well stocked"
              description="No product is at or below its minimum level."
            />
          )}
        </Card>

        <Card>
          <CardHeader title="Expiring soon" subtitle="Within the next 30 days" icon={FiClock} />
          {loadingStats ? (
            <CardBody>
              <SkeletonGate className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-lg" />
                ))}
              </SkeletonGate>
            </CardBody>
          ) : stats.data?.expiringSoon?.length ? (
            <ul className="divide-y divide-hairline">
              {stats.data.expiringSoon.map((product) => (
                <li key={product.id} className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-content truncate">{product.name}</p>
                    <p className="text-xs text-content-subtle">
                      {formatQuantity(product.currentStock, product.unit)} in stock
                    </p>
                  </div>
                  <p className="text-sm font-medium text-amber-500 flex-shrink-0 tabular-nums">
                    {new Date(product.expiryDate).toLocaleDateString('en-PK', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={FiClock}
              title="Nothing expiring soon"
              description="Products with an expiry date in the next 30 days will show up here."
            />
          )}
        </Card>
      </div>
      </motion.div>

      {loadingProfit ? (
        <Card>
          <CardHeader title="Profit" subtitle={RANGES.find((r) => r.value === range)?.label} icon={FiDollarSign} />
          <CardBody>
            <SkeletonGate className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </SkeletonGate>
          </CardBody>
        </Card>
      ) : profit.error ? (
        <InlineError message={`Profit: ${profit.error}`} onRetry={profit.refetch} />
      ) : profit.data?.summary?.transactionCount > 0 ? (
        <RefetchSection active={refetchingProfit}>
        <Card>
          <CardHeader title="Profit" subtitle={RANGES.find((r) => r.value === range)?.label} icon={FiDollarSign} />
          <CardBody>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: 'Revenue', value: profit.data.summary.totalRevenue, type: 'compactMoney' },
                { label: 'Profit', value: profit.data.summary.totalProfit, type: 'compactMoney' },
                { label: 'Average margin', value: profit.data.summary.averageMargin ?? 0, suffix: '%' },
              ].map((item) => (
                <div key={item.label} className="rounded-well bg-surface-sunken px-4 py-3">
                  <p className="text-xs font-medium text-content-subtle uppercase tracking-wide">{item.label}</p>
                  <p className="text-lg font-semibold text-content mt-1 tabular-nums">
                    <AnimatedValue
                      value={item.value}
                      type={item.type || 'decimal'}
                      symbol={currencySymbol}
                      figureClassName="font-semibold"
                      unitClassName="text-content-subtle text-sm font-medium"
                    />
                    {item.suffix && <span className="text-content-subtle font-medium">{item.suffix}</span>}
                  </p>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
        </RefetchSection>
      ) : null}
    </motion.div>
  );
}
