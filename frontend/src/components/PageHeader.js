import React, { useEffect } from 'react';
import { usePageTitle } from '../context/PageTitleContext';

/**
 * Page chrome: publishes the title into the app header, keeps description +
 * actions in the page body so the top bar never feels empty on desktop.
 */
export default function PageHeader({ title, description, actions, className = '' }) {
  const { setTitle } = usePageTitle();

  useEffect(() => {
    setTitle(title || '');
    return () => setTitle('');
  }, [title, setTitle]);

  // The header's own <h1> is `hidden lg:block`, and the mobile one lives here —
  // so returning nothing left a title-only page with no heading at all under
  // 1024px. Every current page passes a description, but the next one might not.
  if (!description && !actions) {
    return <h1 className="lg:hidden font-display text-heading text-content">{title}</h1>;
  }

  return (
    <div className={`flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between ${className}`}>
      <div className="min-w-0">
        {/* Mobile still needs a visible page name — desktop reads it from the header. */}
        <h1 className="lg:hidden font-display text-heading text-content">{title}</h1>
        {description && (
          <p className={`text-caption text-content-muted max-w-2xl ${title ? 'mt-1 lg:mt-0' : ''}`}>
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 sm:flex-shrink-0">{actions}</div>
      )}
    </div>
  );
}
