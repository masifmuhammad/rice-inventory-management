import React from 'react';
import { FiArrowDownRight, FiArrowUpRight, FiMinus } from 'react-icons/fi';
import AnimatedValue from './AnimatedValue';

/**
 * Wraps headline stats into a single instrument panel. Cells are divided by
 * hairlines (see `.stat-grid`) rather than floating as separate cards, which
 * keeps four numbers reading as one group.
 */
export function StatGrid({ children, className = '' }) {
  return (
    <div className={`surface-card rounded-card overflow-hidden ${className}`}>
      <div className="stat-grid">{children}</div>
    </div>
  );
}

// Status is carried by the figure's colour, so only one accent competes at a time.
const figureTones = {
  neutral: 'text-content',
  success: 'text-content',
  danger: 'text-red-500',
  warning: 'text-amber-500',
};

/**
 * One headline figure.
 *
 * The label sits above in small muted type and the number dominates, matching
 * how a dashboard is actually scanned. Pass `rawValue` for animated digits.
 */
export default function StatCard({
  title,
  value,
  rawValue,
  valueType = 'number',
  currencySymbol = 'Rs.',
  fullValue,
  hint,
  change = null,
  changeLabel,
  invertChange = false,
  icon: Icon,
  tone = 'neutral',
  size = 'md',
}) {
  const hasChange = typeof change === 'number' && Number.isFinite(change);
  const isUp = hasChange && change > 0;
  const isFlat = hasChange && change === 0;

  // For withdrawals or stock-out, "up" is not automatically good.
  const positive = invertChange ? !isUp : isUp;
  const TrendIcon = isFlat ? FiMinus : isUp ? FiArrowUpRight : FiArrowDownRight;

  const figureSize = size === 'sm' ? 'stat-figure-sm' : 'stat-figure';
  const figureClassName = `font-display font-bold tabular-nums ${figureSize} ${
    figureTones[tone] || figureTones.neutral
  }`;
  const unitClassName = 'text-sm font-semibold text-content-subtle';

  return (
    <div className="p-4 sm:p-5 min-w-0">
      <div className="flex items-center gap-1.5 min-w-0">
        {Icon && (
          <Icon className="w-3.5 h-3.5 flex-shrink-0 text-content-subtle" aria-hidden="true" />
        )}
        <p className="text-[10px] font-semibold uppercase tracking-[0.09em] text-content-muted truncate">
          {title}
        </p>
      </div>

      <div className="mt-2">
        {rawValue !== undefined && rawValue !== null ? (
          <AnimatedValue
            value={rawValue}
            type={valueType}
            symbol={currencySymbol}
            figureClassName={figureClassName}
            unitClassName={unitClassName}
            title={fullValue}
          />
        ) : (
          <span className={figureClassName} title={fullValue}>
            {value}
          </span>
        )}
      </div>

      {hasChange ? (
        <p className="mt-2 text-[11px] flex items-center gap-1 min-w-0">
          <span
            className={`inline-flex items-center gap-0.5 font-medium flex-shrink-0 ${
              isFlat ? 'text-content-subtle' : positive ? 'text-emerald-500' : 'text-red-500'
            }`}
          >
            <TrendIcon className="w-3 h-3" aria-hidden="true" />
            {Math.abs(change).toFixed(1)}%
          </span>
          <span className="text-content-subtle truncate">{changeLabel || 'vs previous'}</span>
        </p>
      ) : hint ? (
        <p className="mt-2 text-[11px] text-content-subtle truncate">{hint}</p>
      ) : null}
    </div>
  );
}
