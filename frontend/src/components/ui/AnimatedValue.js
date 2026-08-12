import React, { useMemo } from 'react';
import NumberFlow, { useCanAnimate } from '@number-flow/react';
import { usePrefersReducedMotion } from '../../hooks/useMediaQuery';

const parseNumeric = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'string' ? parseFloat(value) : value;
  return Number.isFinite(n) ? n : null;
};

/** South Asian scale: thousands, Lac (100k), Crore (10m). */
const toCompact = (value) => {
  const magnitude = Math.abs(value);
  if (magnitude >= 10000000) return { amount: value / 10000000, unit: 'Cr', digits: 2 };
  if (magnitude >= 100000) return { amount: value / 100000, unit: 'Lac', digits: 2 };
  if (magnitude >= 1000) return { amount: value / 1000, unit: 'K', digits: 1 };
  return { amount: value, unit: '', digits: magnitude === 0 ? 0 : 2 };
};

const SCROLL_EASE = 'cubic-bezier(0.2, 0, 0, 1)';
const scrollTiming = { duration: 780, easing: SCROLL_EASE };
const fadeTiming = { duration: 320, easing: 'ease-out' };

/**
 * An animated figure with a digit-reel scroll when the value changes.
 */
export default function AnimatedValue({
  value,
  type = 'number',
  symbol = 'Rs.',
  figureClassName = '',
  unitClassName = '',
  animate = true,
  title,
}) {
  const reducedMotion = usePrefersReducedMotion();
  const canAnimate = useCanAnimate({ respectMotionPreference: true });
  const numeric = parseNumeric(value);

  const compact = useMemo(
    () => (numeric === null || type !== 'compactMoney' ? null : toCompact(numeric)),
    [numeric, type]
  );

  if (numeric === null) {
    return <span className={figureClassName}>—</span>;
  }

  const isMoney = type === 'money' || type === 'compactMoney';
  const amount = compact ? compact.amount : numeric;
  const unit = compact ? compact.unit : '';

  let format = { maximumFractionDigits: 0 };
  if (compact) {
    format = { minimumFractionDigits: 0, maximumFractionDigits: compact.digits };
  } else if (type === 'money') {
    format = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  } else if (type === 'decimal') {
    format = { minimumFractionDigits: 1, maximumFractionDigits: 1 };
  }

  const shouldAnimate = animate && canAnimate && !reducedMotion;

  return (
    <span className="inline-flex items-baseline gap-1 tabular-nums" title={title}>
      {isMoney && symbol && <span className={unitClassName}>{symbol}</span>}
      {shouldAnimate ? (
        <NumberFlow
          value={amount}
          format={format}
          locales="en-PK"
          className={figureClassName}
          willChange
          transformTiming={scrollTiming}
          spinTiming={scrollTiming}
          opacityTiming={fadeTiming}
        />
      ) : (
        <span className={figureClassName}>{amount.toLocaleString('en-PK', format)}</span>
      )}
      {unit && <span className={unitClassName}>{unit}</span>}
    </span>
  );
}
