import usePageState from '../hooks/usePageState';
import { Input } from '../components/ui/Field';
import React, { useCallback, useMemo, useState } from 'react';
import { toast } from '../utils/toast';
import {
  FiBarChart2,
  FiDollarSign,
  FiDownload,
  FiPackage,
  FiPieChart,
  FiTrendingUp,
} from 'react-icons/fi';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import api, { getErrorMessage } from '../services/api';
import useApi from '../hooks/useApi';
import useMediaQuery from '../hooks/useMediaQuery';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useTheme } from '../context/ThemeContext';
import { formatMoney, formatQuantity } from '../utils/currency';
import { daysAgoInput, todayInput } from '../utils/date';
import PageHeader from '../components/PageHeader';
import Button from '../components/ui/Button';
import Card, { CardBody, CardHeader } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import StatCard, { StatGrid } from '../components/ui/StatCard';
import AnimatedValue from '../components/ui/AnimatedValue';
import { EmptyState, ErrorState, InlineError } from '../components/ui/States';
import { SkeletonChart, SkeletonGate, SkeletonStatCards, SkeletonTable, Skeleton } from '../components/ui/Skeleton';
import { RefetchSection } from '../components/ui/RefetchIndicator';
import { translate, useAppLanguage } from '../context/LanguageContext';

// Local dates, not UTC. `toISOString()` reports yesterday until 05:00 in PKT,
// so the default range and the presets were both off by a day overnight.
const isoDaysAgo = daysAgoInput;

export default function Reports() {
  useAppLanguage();
  const { currencySymbol, settings } = useSettings();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const [exporting, setExporting] = useState(false);
  const [range, setRange] = usePageState('reports.range', { startDate: isoDaysAgo(30), endDate: todayInput() });

  const chartTheme = useMemo(
    () => ({
      grid: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(9,9,11,0.07)',
      axis: isDark ? '#a1a1aa' : '#62626b',
      legend: isDark ? '#9f9faa' : '#6a6a74',
      tooltip: {
        contentStyle: {
          borderRadius: 14,
          border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(9,9,11,0.08)'}`,
          background: isDark ? '#1d2024' : '#ffffff',
          color: isDark ? '#fafafa' : '#18181b',
          boxShadow: isDark
            ? '0 8px 24px -8px rgba(0,0,0,0.6)'
            : '0 8px 24px -8px rgba(9,9,11,0.12)',
          fontSize: 13,
          padding: '8px 12px',
        },
        itemStyle: { color: isDark ? '#fafafa' : '#18181b' },
        labelStyle: { color: isDark ? '#9f9faa' : '#6a6a74' },
      },
    }),
    [isDark]
  );

  // Guard against an inverted range: the API would return nothing and the page
  // would look broken rather than wrong.
  const invalidRange = range.startDate > range.endDate;

  const params = useMemo(
    () => ({ startDate: range.startDate, endDate: range.endDate }),
    [range.startDate, range.endDate]
  );

  const stockValue = useApi(
    (signal) => api.get('/reports/stock-value', { signal }).then((r) => r.data),
    [],
    { keepPreviousData: true }
  );

  const movement = useApi(
    (signal) =>
      invalidRange
        ? Promise.resolve([])
        : api.get('/reports/movement', { params, signal }).then((r) => r.data),
    [params, invalidRange],
    { keepPreviousData: true }
  );

  const profit = useApi(
    (signal) =>
      invalidRange
        ? Promise.resolve(null)
        : api.get('/reports/profit-analysis', { params, signal }).then((r) => r.data),
    [params, invalidRange],
    { keepPreviousData: true }
  );

  // Twelve grouped pairs with rotated labels need about 200px of plot width per
  // six bars; a 320px phone leaves roughly that in total, so the tick labels
  // overlapped into an unreadable smear. Six products on phones, twelve above.
  const isWide = useMediaQuery('(min-width: 640px)');

  const chartData = useMemo(
    () =>
      (movement.data || []).slice(0, isWide ? 12 : 6).map((item) => ({
        name: item.product.name.length > 16 ? `${item.product.name.slice(0, 15)}…` : item.product.name,
        unit: item.product.unit,
        'Stock in': item.stockIn,
        'Stock out': item.stockOut,
      })),
    [movement.data, isWide]
  );

  const handleExport = useCallback(async () => {
    setExporting(true);
    const toastId = toast.loading('Building your report…');

    try {
      const products = stockValue.data?.products;
      if (!products?.length) {
        toast.error('There is nothing to export yet.', { id: toastId });
        return;
      }

      const { generateInventoryReportPDF } = await import('../utils/pdfGenerator');
      const outcome = await generateInventoryReportPDF(products, stockValue.data.summary, settings, {
        generatedAt: new Date(),
        preparedBy: user?.name,
      });

      // On iPhone the file goes through the share sheet, so "downloaded" would be
      // a lie — and dismissing that sheet is a choice, not a failure.
      if (outcome === 'cancelled') {
        toast.dismiss(toastId);
      } else if (outcome === 'shared') {
        toast.success('Report ready — choose "Save to Files" to keep it', {
          id: toastId,
          feedback: 'download',
        });
      } else if (outcome === 'insecure') {
        toast.error('Open the app over https to save files on iPhone', { id: toastId });
      } else if (outcome === 'opened') {
        toast.success('Report opened — use your browser’s share menu to save it', { id: toastId });
      } else {
        toast.success('Report downloaded', { id: toastId, feedback: 'download' });
      }
    } catch (error) {
      // Surface what actually went wrong. The blanket message turned a 403
      // "you do not have permission to view reports" into "please try again",
      // which the user then did, forever.
      toast.error(getErrorMessage(error, 'Could not build the report. Please try again.'), {
        id: toastId,
      });
    } finally {
      setExporting(false);
    }
  }, [stockValue.data, settings, user?.name]);

  const summary = stockValue.data?.summary;
  const loadingValue = stockValue.loading && !stockValue.data;
  const refetchingMovement = movement.loading && Boolean(movement.data);
  const refetchingProfit = profit.loading && Boolean(profit.data);
  const loadingProfit = profit.loading && !profit.data;

  return (
    <div className="space-y-6">
      <PageHeader
        summary={translate("{0} to {1}", [range.startDate, range.endDate])}
        title={translate("Reports")}
        description={translate("What you are holding, what moved and what it earned.")}
        actions={
          <Button icon={FiDownload} onClick={handleExport} loading={exporting}>{translate("Export PDF")}</Button>
        }
      />

      {/* Range picker */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1">
            <Input label={translate("From")}
              id="start"
              type="date"
              value={range.startDate}
              max={range.endDate}
              onChange={(event) => setRange((r) => ({ ...r, startDate: event.target.value }))}

            />
          </div>
          <div className="flex-1">
            <Input label={translate("To")}
              id="end"
              type="date"
              value={range.endDate}
              min={range.startDate}
              onChange={(event) => setRange((r) => ({ ...r, endDate: event.target.value }))}

            />
          </div>
          <div className="flex gap-2">
            {[
              { label: '7d', days: 7 },
              { label: '30d', days: 30 },
              { label: '90d', days: 90 },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() =>
                  setRange({ startDate: isoDaysAgo(preset.days), endDate: todayInput() })
                }
                className="px-3 py-2.5 min-h-[44px] rounded-lg border border-hairline/[0.12] bg-surface-1 text-sm
                  font-medium text-content-muted hover:bg-hairline/[0.05] hover:text-content transition-colors"
              >
                {translate(preset.label)}
              </button>
            ))}
          </div>
        </div>

        {invalidRange && (
          <p className="mt-3 text-sm text-red-500">{translate("The start date must be on or before the end date.")}</p>
        )}
      </Card>

      {/* Inventory value */}
      {loadingValue ? (
        <SkeletonStatCards count={4} />
      ) : stockValue.error ? (
        <InlineError message={translate(stockValue.error)} onRetry={stockValue.refetch} />
      ) : (
        <StatGrid>
          <StatCard
            title={translate("Stock at cost")}
            rawValue={summary?.totalValue}
            valueType="compactMoney"
            currencySymbol={currencySymbol}
            fullValue={formatMoney(summary?.totalValue, currencySymbol)}
            icon={FiDollarSign}
          />
          <StatCard
            title={translate("Stock at retail")}
            rawValue={summary?.totalPotentialValue}
            valueType="compactMoney"
            currencySymbol={currencySymbol}
            fullValue={formatMoney(summary?.totalPotentialValue, currencySymbol)}
            icon={FiTrendingUp}
          />
          <StatCard
            title={translate("Potential profit")}
            rawValue={summary?.totalPotentialProfit}
            valueType="compactMoney"
            currencySymbol={currencySymbol}
            fullValue={formatMoney(summary?.totalPotentialProfit, currencySymbol)}
            hint={translate("If everything sold at list price")}
            icon={FiPieChart}
          />
          <StatCard title={translate("Products")} rawValue={summary?.productCount} icon={FiPackage} />
        </StatGrid>
      )}

      {/* Realised profit for the period */}
      {loadingProfit ? (
        <Card>
          <CardHeader title={translate("Sales in this period")} subtitle={translate("Actual revenue and margin")} icon={FiTrendingUp} />
          <CardBody>
            <SkeletonGate className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </SkeletonGate>
          </CardBody>
        </Card>
      ) : profit.error ? (
        <InlineError message={translate("Sales summary: {0}", [profit.error])} onRetry={profit.refetch} />
      ) : profit.data?.summary ? (
        <RefetchSection active={refetchingProfit}>
        <Card>
          <CardHeader title={translate("Sales in this period")} subtitle={translate("Actual revenue and margin")} icon={FiTrendingUp} />
          <CardBody>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Revenue', value: profit.data.summary.totalRevenue, type: 'compactMoney' },
                { label: 'Profit', value: profit.data.summary.totalProfit, type: 'compactMoney' },
                {
                  label: 'Average margin',
                  value: profit.data.summary.averageMargin ?? 0,
                  type: 'decimal',
                  suffix: '%',
                },
                { label: 'Sales', value: profit.data.summary.transactionCount },
              ].map((item) => (
                <div key={item.label} className="rounded-well bg-surface-sunken px-4 py-3">
                  <p className="text-xs font-medium text-content-subtle tracking-normal">{translate(item.label)}</p>
                  <p className="text-lg font-semibold text-content mt-1 tabular-nums">
                    <AnimatedValue
                      value={item.value}
                      type={item.type || 'number'}
                      symbol={currencySymbol}
                      figureClassName="font-semibold"
                      unitClassName="text-content-subtle text-sm font-medium"
                    />
                    {item.suffix && <span className="text-content-subtle font-medium">{translate(item.suffix)}</span>}
                  </p>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
        </RefetchSection>
      ) : null}

      {/* Movement chart */}
      <RefetchSection active={refetchingMovement}>
      <Card>
        <CardHeader title={translate("Movement by product")} subtitle={translate("Quantities in each product&apos;s own unit")} icon={FiBarChart2} />
        <CardBody className="pt-2">
          {movement.loading && !movement.data ? (
            <SkeletonChart height={340} />
          ) : movement.error ? (
            <InlineError message={translate(movement.error)} onRetry={movement.refetch} />
          ) : chartData.length === 0 ? (
            <EmptyState
              icon={FiBarChart2}
              title={translate("No stock moved in this period")}
              description={translate("Try a wider date range or record a transaction.")}
            />
          ) : (
            <div className="h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 56 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} vertical={false} />
                  <XAxis
                    dataKey="name"
                    angle={-35}
                    textAnchor="end"
                    interval={0}
                    height={70}
                    tick={{ fontSize: 11, fill: chartTheme.axis }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis tick={{ fontSize: 11, fill: chartTheme.axis }} tickLine={false} axisLine={false} width={48} />
                  <Tooltip cursor={{ fill: 'rgba(148,163,184,0.08)' }} formatter={(value, name, item) => [formatQuantity(value, item.payload.unit), name]} {...chartTheme.tooltip} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} formatter={(value) => <span style={{ color: chartTheme.legend }}>{translate(value)}</span>} />
                  <Bar dataKey="Stock in" fill={isDark ? "#34d399" : "#047857"} radius={[4, 4, 0, 0]} maxBarSize={36} />
                  <Bar dataKey="Stock out" fill={isDark ? "#a1a1aa" : "#62626b"} radius={[4, 4, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardBody>
      </Card>
      </RefetchSection>

      {/* Stock value table */}
      <Card className="overflow-hidden">
        <CardHeader
          title={translate("Stock value by product")}
          subtitle={translate(summary ? `${formatMoney(summary.totalValue, currencySymbol)} at cost` : undefined)}
          icon={FiPackage}
        />

        {loadingValue ? (
          <SkeletonTable rows={6} columns={5} />
        ) : stockValue.error ? (
          <ErrorState message={translate(stockValue.error)} onRetry={stockValue.refetch} />
        ) : !stockValue.data?.products?.length ? (
          <EmptyState icon={FiPackage} title={translate("No products to value")} description={translate("Add products to see this report.")} />
        ) : (
          <>
            <ul className="lg:hidden divide-y divide-hairline">
              {stockValue.data.products.map((product) => (
                <li key={product.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-content truncate">{product.name}</p>
                      <p className="text-xs text-content-subtle truncate">{product.sku}</p>
                    </div>
                    <span className="text-sm font-semibold text-content tabular-nums whitespace-nowrap">
                      {translate(formatMoney(product.stockValue, currencySymbol))}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-content-subtle tabular-nums">
                    {translate(formatQuantity(product.currentStock, product.unit))} ·{' '}
                    {translate(formatMoney(product.costPrice, currencySymbol))}{translate(" cost")}</p>
                </li>
              ))}
            </ul>

            <div className="hidden lg:block scroll-x">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-hairline/[0.07] bg-surface-sunken">
                    {['Product', 'Category', 'Stock', 'Cost', 'Value', 'At retail', 'Potential profit'].map(
                      (heading, index) => (
                        <th
                          key={heading}
                          scope="col"
                          className={`px-6 py-3 text-xs font-semibold text-content-subtle tracking-normal ${
                            index >= 2 ? 'text-right' : 'text-left'
                          }`}
                        >
                          {translate(heading)}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {stockValue.data.products.map((product) => (
                    <tr key={product.id} className="hover:bg-hairline/[0.05] transition-colors">
                      <td className="px-6 py-3.5">
                        <div className="font-medium text-content">{product.name}</div>
                        <div className="text-xs text-content-subtle">{product.sku}</div>
                      </td>
                      <td className="px-6 py-3.5">
                        <Badge tone="primary">{translate(product.category)}</Badge>
                      </td>
                      <td className="px-6 py-3.5 text-right text-content-muted tabular-nums">
                        {translate(formatQuantity(product.currentStock, product.unit))}
                      </td>
                      <td className="px-6 py-3.5 text-right text-content-muted tabular-nums">
                        {translate(formatMoney(product.costPrice, currencySymbol))}
                      </td>
                      <td className="px-6 py-3.5 text-right font-semibold text-content tabular-nums">
                        {translate(formatMoney(product.stockValue, currencySymbol))}
                      </td>
                      <td className="px-6 py-3.5 text-right text-content-muted tabular-nums">
                        {translate(formatMoney(product.potentialValue, currencySymbol))}
                      </td>
                      <td className="px-6 py-3.5 text-right text-emerald-700 dark:text-emerald-400 font-medium tabular-nums">
                        {translate(formatMoney(product.potentialProfit, currencySymbol))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-hairline/[0.14] bg-surface-sunken font-semibold text-content">
                    <td className="px-6 py-3.5" colSpan={4}>{translate("Total")}</td>
                    <td className="px-6 py-3.5 text-right tabular-nums">
                      {translate(formatMoney(summary?.totalValue, currencySymbol))}
                    </td>
                    <td className="px-6 py-3.5 text-right tabular-nums">
                      {translate(formatMoney(summary?.totalPotentialValue, currencySymbol))}
                    </td>
                    <td className="px-6 py-3.5 text-right text-emerald-700 dark:text-emerald-400 tabular-nums">
                      {translate(formatMoney(summary?.totalPotentialProfit, currencySymbol))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
