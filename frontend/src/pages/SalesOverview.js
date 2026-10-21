import React, { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import api from '../services/api';
import useApi from '../hooks/useApi';
import usePageState from '../hooks/usePageState';
import { useTheme } from '../context/ThemeContext';
import { useSettings } from '../context/SettingsContext';
import { formatCompactMoney, formatMoney } from '../utils/currency';
import { daysAgoInput, formatSafe, todayInput } from '../utils/date';
import Card from '../components/ui/Card';
import { InlineError } from '../components/ui/States';
const dateLabel = (value) => formatSafe(value + 'T12:00:00', 'd MMM', '');
export default function SalesOverview() {
  const { currencySymbol } = useSettings();
  const { isDark } = useTheme();
  const [range, setRange] = usePageState('dashboard.range', '7');
  const canReport = true;
  const params = useMemo(() => ({ startDate: daysAgoInput(Number(range) - 1), endDate: todayInput() }), [range]);
  const analytics = useApi((signal) => api.get('/reports/bi-analytics', { params, signal }).then((r) => r.data), [params], { immediate: canReport, keepPreviousData: true, cacheKey: 'reports/home-trend' });
  const chart = useMemo(() => {
    const rows = new Map((analytics.data?.transactionTrends || []).map((row) => [row.date, row]));
    return Array.from({ length: Number(range) }, (_, index) => {
      const date = daysAgoInput(Number(range) - index - 1);
      return { date, revenue: rows.get(date)?.revenue || 0 };
    });
  }, [analytics.data, range]);
    return (<Card className="p-4 sm:p-6">
            <div className="flex items-center justify-between gap-2"><h2 className="text-base font-semibold tracking-tight text-content">Sales overview</h2><div className="inline-flex rounded-lg bg-surface-3 p-0.5" role="group" aria-label="Sales period">{[['7', '7 days'], ['30', '30 days']].map(([value, label]) => <button key={value} type="button" onClick={() => setRange(value)} aria-pressed={range === value} className={['px-2.5 min-h-[44px] text-xs rounded-md transition-colors', range === value ? 'bg-surface-1 text-content font-medium' : 'text-content-muted'].join(' ')}>{label}</button>)}</div></div>
            {analytics.error ? <InlineError message={analytics.error} onRetry={analytics.refetch} className="mt-4" /> : <>
              <p className="text-[28px] font-money font-bold tracking-tight tabular-nums text-content mt-4">{analytics.loading && !analytics.data ? '\u2014' : formatMoney(analytics.data?.summary?.totalRevenue, currencySymbol)}</p><p className="text-xs text-content-subtle mt-1">Recorded sales &middot; last {range} days</p>
              <div className="h-[180px] mt-5" aria-label={'Sales revenue over ' + range + ' days'}>
                <ResponsiveContainer width="100%" height="100%"><LineChart data={chart} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}><CartesianGrid vertical={false} stroke="rgb(var(--hairline) / 0.08)" /><XAxis dataKey="date" tickFormatter={dateLabel} tick={{ fill: 'rgb(var(--content-subtle))', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={35} /><YAxis tickFormatter={(value) => formatCompactMoney(value, '')} tick={{ fill: 'rgb(var(--content-subtle))', fontSize: 11 }} axisLine={false} tickLine={false} width={72} /><Tooltip formatter={(value) => [formatMoney(value, currencySymbol), 'Sales']} labelFormatter={dateLabel} contentStyle={{ borderRadius: 8, border: '1px solid rgb(var(--hairline) / 0.1)', background: 'rgb(var(--surface-1))', color: 'rgb(var(--content))', fontSize: 12 }} /><Line type="linear" dataKey="revenue" stroke={isDark ? "#34d399" : "#047857"} strokeWidth={2} dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer>
              </div>
            </>}
          </Card>
  );
}
