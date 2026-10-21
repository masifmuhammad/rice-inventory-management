import React from 'react';
import { Link } from 'react-router-dom';
import { FiArrowUpRight } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { formatMoney, formatNumber } from '../utils/currency';

export default function MobileBusinessSummary({ stats, loading }) {
  const { can } = useAuth();
  const { currencySymbol } = useSettings();
  const hasCash = can('cash.view');
  const cards = [
    { title: 'Stock on hand', to: '/products', value: can('reports.view') ? formatMoney(stats?.totalStockValue, '', false) : formatNumber(stats?.totalProducts), unit: can('reports.view') ? currencySymbol : 'Products', caption: 'At cost price' },
    hasCash && { title: 'Cash balance', to: '/cash-book', value: formatMoney(stats?.cashBalance, '', false), unit: currencySymbol, caption: 'Cash book total' },
  ].filter(Boolean);
  return (
    <section className={['grid surface-card rounded-card overflow-hidden divide-x divide-hairline/[0.08]', hasCash ? 'grid-cols-2' : 'grid-cols-1'].join(' ')} aria-label="Business overview" aria-busy={loading}>
      {cards.map((card) => (
        <Link key={card.title} to={card.to} className="group min-w-0 p-4 sm:p-6 hover:bg-surface-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-content">
          <div className="flex items-center justify-between gap-1 text-content-muted"><h2 className="text-[13px] sm:text-sm font-medium">{card.title}</h2><FiArrowUpRight className="w-4 h-4 shrink-0" aria-hidden="true" /></div>
          <p className="mt-5 text-xs text-content-subtle">{card.unit}</p>
          <p className="text-[clamp(1.25rem,5.2vw,2rem)] sm:text-[2rem] leading-tight font-money font-bold tracking-[-0.035em] tabular-nums text-content break-words mt-1">{loading ? '\u2014' : card.value}</p>
          <p className="text-xs text-content-muted mt-2">{card.caption}</p>
        </Link>
      ))}
    </section>
  );
}
