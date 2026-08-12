import React from 'react';

/**
 * Shared bilingual typography for the assistant.
 * English → Inter. Urdu → Noto Nastaliq Urdu (loaded in index.html).
 */

/** Body block from AI replies shaped as "English…\n\nاردو: …" */
export function BilingualBlock({ text, className = '' }) {
  if (!text) return null;
  const parts = String(text).split(/\n\s*اردو\s*:/);
  const english = parts[0]?.trim();
  const urdu = parts[1]?.trim();

  return (
    <div className={`space-y-3.5 ${className}`}>
      {english && (
        <div>
          {urdu && <p className="assistant-lang-label mb-1.5">English</p>}
          <div className="assistant-en text-content whitespace-pre-wrap" lang="en">
            {english}
          </div>
        </div>
      )}
      {urdu && (
        <div className="border-t border-hairline/[0.07] pt-3.5">
          <p className="assistant-lang-label mb-1.5" dir="rtl" lang="ur">
            اردو
          </p>
          <div className="assistant-ur text-content whitespace-pre-wrap" dir="rtl" lang="ur">
            {urdu}
          </div>
        </div>
      )}
    </div>
  );
}

/** Stacked English + Urdu for titles, buttons, and short UI chrome. */
export function BiLine({ en, ur, size = 'md', align = 'start', className = '' }) {
  if (!en && !ur) return null;
  const urClass = size === 'sm' ? 'assistant-ur-sm leading-snug' : 'assistant-ur';
  const enClass =
    size === 'sm' ? 'assistant-en-sm font-semibold leading-snug' : 'assistant-en font-medium';

  return (
    <span
      className={`inline-flex flex-col gap-0.5 ${
        align === 'center' ? 'items-center text-center' : 'items-start text-left'
      } ${className}`}
    >
      {en && (
        <span className={enClass} lang="en">
          {en}
        </span>
      )}
      {ur && (
        <span className={`${urClass} opacity-90`} dir="rtl" lang="ur">
          {ur}
        </span>
      )}
    </span>
  );
}

/** One-line English · Urdu for compact chrome (hub tiles, placeholders). */
export function BiPair({ en, ur, className = '' }) {
  return (
    <span className={`inline-flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 ${className}`}>
      {en && (
        <span className="assistant-en-sm text-content" lang="en">
          {en}
        </span>
      )}
      {en && ur && <span className="text-content-subtle/50 select-none" aria-hidden="true">·</span>}
      {ur && (
        <span className="assistant-ur-sm text-content-muted" dir="rtl" lang="ur">
          {ur}
        </span>
      )}
    </span>
  );
}
