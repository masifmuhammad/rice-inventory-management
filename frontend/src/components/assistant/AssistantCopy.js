import React from 'react';

/**
 * Assistant typography.
 *
 * The assistant replies in English only. It still *understands* Urdu — spoken
 * or typed input is parsed as before — but it no longer answers in both
 * languages, which halved every reply and made the panel scroll for no gain.
 *
 * The `ur` prop is accepted and ignored throughout so the many call sites that
 * still pass it stay valid; there is one place to change if Urdu output ever
 * comes back.
 */

/** Body block from an AI reply. */
export function BilingualBlock({ text, className = '' }) {
  if (!text) return null;

  // Defensive: a model occasionally still appends an "اردو:" section despite the
  // prompt. Cut it rather than render a half-Urdu answer.
  const english = String(text).split(/\n\s*اردو\s*:/)[0].trim();
  if (!english) return null;

  return (
    <div className={`assistant-en text-content whitespace-pre-wrap ${className}`} lang="en">
      {english}
    </div>
  );
}

/** Title / button / short chrome copy. */
export function BiLine({ en, size = 'md', align = 'start', className = '' }) {
  if (!en) return null;
  const enClass =
    size === 'sm' ? 'assistant-en-sm font-semibold leading-snug' : 'assistant-en font-medium';

  return (
    <span
      className={`inline-flex flex-col ${
        align === 'center' ? 'items-center text-center' : 'items-start text-left'
      } ${className}`}
    >
      <span className={enClass} lang="en">
        {en}
      </span>
    </span>
  );
}

/** One-line copy for compact chrome (hub tiles, placeholders). */
export function BiPair({ en, className = '' }) {
  if (!en) return null;
  return (
    <span className={`assistant-en-sm text-content ${className}`} lang="en">
      {en}
    </span>
  );
}
