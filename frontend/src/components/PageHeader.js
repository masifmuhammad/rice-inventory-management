import React from 'react';

/** Consistent title block — title hidden on mobile (shown in app header via nav). */
export default function PageHeader({ title, description, actions, className = '', hideTitleOnMobile = true }) {
  return (
    <div className={`flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between ${className}`}>
      <div className="min-w-0">
        <h1
          className={`text-2xl sm:text-[30px] leading-tight font-display font-bold text-content tracking-[-0.02em] ${
            hideTitleOnMobile ? 'hidden lg:block' : ''
          }`}
        >
          {title}
        </h1>
        {description && <p className="text-sm text-content-muted mt-1.5 max-w-2xl">{description}</p>}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 sm:flex-shrink-0">{actions}</div>
      )}
    </div>
  );
}
