import React from 'react';

/** The one surface style used across the app, so nothing looks hand-placed. */
export function Card({ className = '', interactive = false, children, ...props }) {
  return (
    <div
      className={`surface-card rounded-card ${interactive ? 'surface-card-hover' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, icon: Icon, action, className = '' }) {
  return (
    /* No rule under the title — in the reference a card header is held by space. */
    <div
      className={`flex items-start justify-between gap-3 px-4 sm:px-6 pt-5 pb-3 ${className}`}
    >
      <div className="flex items-start gap-3 min-w-0">
        {Icon && (
          <span className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-well bg-hairline/[0.05] text-content-muted flex items-center justify-center">
            <Icon className="w-4 h-4" aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="font-display text-heading text-content truncate">{title}</h2>
          {subtitle && <p className="text-caption text-content-subtle mt-1">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({ className = '', children }) {
  return <div className={`p-4 sm:p-6 ${className}`}>{children}</div>;
}

export default Card;
