import React from 'react';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';

/** Compact pager: enough to move around a long ledger without a page-number carpet. */
export default function Pagination({ page, pages, total, limit, onChange, className = '' }) {
  if (!pages || pages <= 1) return null;

  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div
      className={`flex flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-6 py-3
        border-t border-hairline/[0.07] bg-surface-sunken ${className}`}
    >
      <p className="text-sm text-content-muted tabular-nums">
        <span className="font-medium text-content">
          {from}–{to}
        </span>{' '}
        of <span className="font-medium text-content">{total}</span>
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          className="inline-flex items-center gap-1 px-3 py-2 min-h-[40px] rounded-lg text-sm font-medium
            text-content-muted bg-surface-1 border border-hairline/[0.12] hover:bg-hairline/[0.05]
            disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <FiChevronLeft className="w-4 h-4" aria-hidden="true" />
          Previous
        </button>

        <span className="text-sm text-content-muted px-2 tabular-nums whitespace-nowrap">
          {page} / {pages}
        </span>

        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={page >= pages}
          className="inline-flex items-center gap-1 px-3 py-2 min-h-[40px] rounded-lg text-sm font-medium
            text-content-muted bg-surface-1 border border-hairline/[0.12] hover:bg-hairline/[0.05]
            disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Next
          <FiChevronRight className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
