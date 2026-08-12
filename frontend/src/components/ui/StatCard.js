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

const figureTones = {
  neutral: 'text-content',
  success: 'text-content',
  danger: 'text-red-500',
  warning: 'text-amber-500',
};

/**
 * One headline figure — compact cell, full hint text, left-aligned like before.
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

  const positive = invertChange ? !isUp : isUp;
  const TrendIcon = isFlat ? FiMinus : isUp ? FiArrowUpRight : FiArrowDownRight;

  const figureSize = size === 'sm' ? 'stat-figure-sm' : 'stat-figure';
  // 600, not 700 — the reference's figures are semibold and tracked in tight.
  const figureClassName = `font-display font-semibold tabular-nums ${figureSize} ${
    figureTones[tone] || figureTones.neutral
  }`;
  const unitClassName = 'text-caption font-semibold text-content-subtle';

  return (
    <div className="p-3.5 sm:p-4 min-w-0">
      {/* Sentence case, not small-caps — the reference labels a figure plainly. */}
      <div className="flex items-center gap-2 min-w-0">
        {Icon && (
          <Icon className="w-4 h-4 flex-shrink-0 text-content-muted" aria-hidden="true" />
        )}
        <p className="text-caption font-medium text-content-muted truncate">{title}</p>
      </div>

      <div className="mt-1.5">
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
        /* The delta is a tinted pill in the reference, not loose coloured text. */
        <p className="mt-2 text-[11px] flex flex-wrap items-center gap-x-1.5 gap-y-0.5 min-w-0 text-pretty">
          <span
            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 ${
              isFlat
                ? 'bg-hairline/[0.06] text-content-muted'
                : positive
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'bg-red-500/10 text-red-600 dark:text-red-400'
            }`}
          >
            <TrendIcon className="w-3 h-3" aria-hidden="true" />
            {Math.abs(change).toFixed(1)}%
          </span>
          <span className="text-content-subtle">{changeLabel || 'vs previous'}</span>
        </p>
      ) : hint ? (
        <p className="mt-2 text-[11px] text-content-subtle text-pretty leading-snug">{hint}</p>
      ) : null}
    </div>
  );
}
