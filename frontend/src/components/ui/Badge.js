import React from 'react';

const tones = {
  neutral: 'bg-hairline/[0.08] text-content-muted ring-hairline/[0.08]',
  primary: 'bg-primary-500/12 text-primary-600 dark:text-primary-400 ring-primary-500/20',
  success: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20',
  warning: 'bg-amber-500/12 text-amber-600 dark:text-amber-400 ring-amber-500/20',
  danger: 'bg-red-500/12 text-red-600 dark:text-red-400 ring-red-500/20',
  purple: 'bg-violet-500/12 text-violet-600 dark:text-violet-400 ring-violet-500/20',
};

export default function Badge({ tone = 'neutral', icon: Icon, className = '', children }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
        ring-1 ring-inset whitespace-nowrap ${tones[tone] || tones.neutral} ${className}`}
    >
      {Icon && <Icon className="w-3 h-3" aria-hidden="true" />}
      {children}
    </span>
  );
}

/** Maps a transaction type to a consistent label and colour everywhere it appears. */
export const transactionTone = {
  stock_in: { tone: 'success', label: 'Stock in' },
  stock_out: { tone: 'danger', label: 'Stock out' },
  adjustment: { tone: 'primary', label: 'Adjustment' },
  transfer: { tone: 'purple', label: 'Transfer' },
};
