import React, { forwardRef, useId } from 'react';

// `.field-control` carries the themed surface, border, and focus ring so a
// field is never accidentally styled for one theme only.
const sizing = 'px-3.5 py-2.5 min-h-[44px]';

const controlClasses = (invalid, extra = '') =>
  ['field-control', invalid ? 'field-control-invalid' : '', extra].filter(Boolean).join(' ');

export function Field({ label, htmlFor, required, hint, error, className = '', children }) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={htmlFor} className="block text-sm font-medium text-content-muted mb-1.5">
          {label}
          {required && (
            <span className="text-red-500 ml-0.5" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}
      {children}
      {/* Reserve the message row only when there is something to say, and keep
          hint and error in the same slot so nothing jumps as you type. */}
      {error ? (
        <p className="mt-1.5 text-sm text-red-500" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-content-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef(function Input(
  { label, hint, error, required, icon: Icon, prefix, className = '', id, ...props },
  ref
) {
  const generatedId = useId();
  const inputId = id || generatedId;

  return (
    <Field label={label} htmlFor={inputId} required={required} hint={hint} error={error} className={className}>
      <div className="relative">
        {Icon && (
          <Icon
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-content-subtle"
            aria-hidden="true"
          />
        )}
        {prefix && (
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-content-subtle">
            {prefix}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? 'true' : undefined}
          className={controlClasses(error, `${sizing} ${Icon || prefix ? 'pl-11' : ''}`)}
          {...props}
        />
      </div>
    </Field>
  );
});

export const Select = forwardRef(function Select(
  { label, hint, error, required, bare = false, selectClassName = '', className = '', id, children, ...props },
  ref
) {
  const generatedId = useId();
  const selectId = id || generatedId;

  const selectEl = (
    <select
      ref={ref}
      id={selectId}
      aria-invalid={error ? 'true' : undefined}
      className={controlClasses(
        error,
        `${sizing} appearance-none pr-10 bg-no-repeat ${selectClassName}`.trim()
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%23949499' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3E%3C/svg%3E\")",
        backgroundPosition: 'right 0.75rem center',
        backgroundSize: '1.25rem',
      }}
      {...props}
    >
      {children}
    </select>
  );

  if (bare) return selectEl;

  return (
    <Field label={label} htmlFor={selectId} required={required} hint={hint} error={error} className={className}>
      {selectEl}
    </Field>
  );
});

export const Textarea = forwardRef(function Textarea(
  { label, hint, error, required, className = '', id, rows = 3, ...props },
  ref
) {
  const generatedId = useId();
  const textareaId = id || generatedId;

  return (
    <Field label={label} htmlFor={textareaId} required={required} hint={hint} error={error} className={className}>
      <textarea
        ref={ref}
        id={textareaId}
        rows={rows}
        aria-invalid={error ? 'true' : undefined}
        className={controlClasses(error, 'px-3.5 py-2.5 resize-y')}
        {...props}
      />
    </Field>
  );
});

export function Checkbox({ label, description, className = '', id, ...props }) {
  const generatedId = useId();
  const checkboxId = id || generatedId;

  return (
    <label
      htmlFor={checkboxId}
      className={`flex items-start gap-3 cursor-pointer select-none rounded-xl px-3.5 py-2.5 min-h-[44px]
        bg-surface-1 border border-hairline/[0.12] hover:border-hairline/20 hover:bg-surface-3
        transition-colors ${className}`}
    >
      <input
        id={checkboxId}
        type="checkbox"
        className="mt-0.5 w-[18px] h-[18px] rounded border-hairline/25 bg-surface-1 text-primary-600
          focus:ring-2 focus:ring-primary-500/40 cursor-pointer"
        {...props}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-content">{label}</span>
        {description && <span className="block text-xs text-content-subtle mt-0.5">{description}</span>}
      </span>
    </label>
  );
}

export default Field;
