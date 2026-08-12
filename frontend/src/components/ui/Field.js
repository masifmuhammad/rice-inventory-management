import React, { Children, forwardRef, isValidElement, useId, useMemo } from 'react';
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react';
import { FiCheck, FiChevronDown } from 'react-icons/fi';

// Flat controls (filters, bare selects) keep the older single-line chrome.
const flatSizing = 'px-3.5 py-2.5 min-h-[44px]';

const controlClasses = (invalid, extra = '') =>
  ['field-control', invalid ? 'field-control-invalid' : '', extra].filter(Boolean).join(' ');

const shellClasses = (invalid, extra = '') =>
  ['field-shell', invalid ? 'field-shell-invalid' : '', extra].filter(Boolean).join(' ');

/** Hint / error sit under the shell so the control height stays predictable. */
function FieldMessage({ error, hint }) {
  if (error) {
    return (
      <p className="mt-1.5 text-sm text-red-500" role="alert">
        {error}
      </p>
    );
  }
  if (hint) {
    return <p className="mt-1.5 text-xs text-content-subtle">{hint}</p>;
  }
  return null;
}

/**
 * Revolut-style stacked field: label lives inside the control, not above it.
 * Saves a full row of vertical space on every input — critical on phone sheets.
 */
export function Field({ label, htmlFor, required, hint, error, className = '', children }) {
  // Legacy external-label layout — kept for any caller that still wraps children
  // manually. Prefer Input / Select / Textarea which own the shell themselves.
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
      <FieldMessage error={error} hint={hint} />
    </div>
  );
}

function ShellLabel({ htmlFor, label, required, as: Tag = 'label' }) {
  if (!label) return null;
  return (
    <Tag {...(Tag === 'label' ? { htmlFor } : {})} className="field-shell-label">
      {label}
      {required && (
        <span className="text-red-500 ml-0.5" aria-hidden="true">
          *
        </span>
      )}
    </Tag>
  );
}

export const Input = forwardRef(function Input(
  { label, hint, error, required, icon: Icon, prefix, className = '', id, ...props },
  ref
) {
  const generatedId = useId();
  const inputId = id || generatedId;

  // No label → flat control (search bars, compact toolbars).
  if (!label) {
    return (
      <div className={className}>
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
            className={controlClasses(error, `${flatSizing} ${Icon || prefix ? 'pl-11' : ''}`)}
            {...props}
          />
        </div>
        <FieldMessage error={error} hint={hint} />
      </div>
    );
  }

  return (
    <div className={className}>
      <div className={shellClasses(error)}>
        <ShellLabel htmlFor={inputId} label={label} required={required} />
        <div className="relative flex items-center min-h-[1.5rem]">
          {Icon && (
            <Icon
              className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 text-content-subtle"
              aria-hidden="true"
            />
          )}
          {prefix && (
            <span className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 text-sm font-medium text-content-subtle tabular-nums">
              {prefix}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={error ? 'true' : undefined}
            className={`field-shell-control ${Icon || prefix ? 'pl-7' : ''}`}
            {...props}
          />
        </div>
      </div>
      <FieldMessage error={error} hint={hint} />
    </div>
  );
});

/** Pull `<option>` nodes out of Select children (including mapped arrays). */
function flattenOptions(nodes) {
  return Children.toArray(nodes).flatMap((child) => {
    if (!isValidElement(child)) return [];
    if (child.type === 'option') {
      const text = Children.toArray(child.props.children)
        .map((part) => (typeof part === 'string' || typeof part === 'number' ? String(part) : ''))
        .join('')
        .trim();
      return [
        {
          value: child.props.value == null ? '' : String(child.props.value),
          label: text || String(child.props.value ?? ''),
          disabled: Boolean(child.props.disabled),
        },
      ];
    }
    if (child.props?.children) return flattenOptions(child.props.children);
    return [];
  });
}

const CHEVRON_BG =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%23949499' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3E%3C/svg%3E\")";

export const Select = forwardRef(function Select(
  {
    label,
    hint,
    error,
    required,
    bare = false,
    selectClassName = '',
    className = '',
    id,
    children,
    value,
    onChange,
    disabled,
    name,
    ...props
  },
  ref
) {
  const generatedId = useId();
  const selectId = id || generatedId;
  const options = useMemo(() => flattenOptions(children), [children]);

  const chevronStyle = {
    backgroundImage: CHEVRON_BG,
    backgroundPosition: 'right 0.75rem center',
    backgroundSize: '1.25rem',
  };

  /**
   * Only an explicit `bare` keeps a real <select>. Everything else goes through
   * the listbox below, including unlabelled toolbar filters: a native option
   * list is painted by the OS, so on Windows it drops a blue system menu into
   * the middle of the design that no stylesheet can reach.
   */
  if (bare) {
    return (
      <select
        ref={ref}
        id={selectId}
        name={name}
        value={value}
        onChange={onChange}
        disabled={disabled}
        aria-invalid={error ? 'true' : undefined}
        className={controlClasses(
          error,
          `${flatSizing} appearance-none pr-10 bg-no-repeat ${selectClassName}`.trim()
        )}
        style={chevronStyle}
        {...props}
      >
        {children}
      </select>
    );
  }

  const selected = options.find((option) => option.value === String(value ?? '')) || null;
  const display = selected?.label || 'Select…';
  const placeholderLike = !selected || selected.value === '';

  const emitChange = (next) => {
    if (typeof onChange !== 'function') return;
    onChange({ target: { value: next, name: name || undefined }, currentTarget: { value: next } });
  };

  // Labelled fields get the tall stacked shell; unlabelled toolbar filters keep
  // the compact single-line chrome they had, just with a styled option list.
  const compact = !label;

  return (
    <div className={className}>
      <Listbox value={String(value ?? '')} onChange={emitChange} disabled={disabled} name={name}>
        <div className="relative">
          <ListboxButton
            ref={ref}
            id={selectId}
            aria-invalid={error ? 'true' : undefined}
            className={`${
              compact
                ? controlClasses(
                    error,
                    `${flatSizing} relative w-full flex items-center text-left cursor-pointer`
                  )
                : shellClasses(error, 'relative w-full text-left cursor-pointer')
            }
              data-[open]:ring-2 data-[open]:ring-primary-500/35 data-[open]:border-primary-500/55
              disabled:cursor-not-allowed disabled:opacity-65`}
          >
            <ShellLabel as="span" label={label} required={required} />
            <span
              className={`block pr-7 truncate ${compact ? 'w-full' : 'field-shell-control'} ${
                placeholderLike ? 'text-content-subtle' : ''
              } ${selectClassName}`.trim()}
            >
              {display}
            </span>
            <FiChevronDown
              className={`pointer-events-none absolute right-3.5 w-4 h-4 text-content-subtle ${
                compact ? 'top-1/2 -translate-y-1/2' : 'bottom-3'
              }`}
              aria-hidden="true"
            />
          </ListboxButton>

          <ListboxOptions
            anchor="bottom start"
            transition
            className="z-[80] w-[var(--button-width)] !max-h-60 overflow-auto rounded-well
              border border-hairline/[0.1] bg-surface-1 p-1.5 shadow-xl outline-none
              origin-top transition duration-150 ease-out
              data-[closed]:scale-95 data-[closed]:opacity-0
              [--anchor-gap:6px]"
          >
            {options.map((option) => (
              <ListboxOption
                key={`${option.value}::${option.label}`}
                value={option.value}
                disabled={option.disabled}
                className="group flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 min-h-[44px]
                  text-sm text-content select-none outline-none
                  data-[focus]:bg-primary-500/10 data-[selected]:bg-primary-500/12
                  data-[disabled]:opacity-40 data-[disabled]:cursor-not-allowed"
              >
                <span className="min-w-0 flex-1 truncate group-data-[selected]:font-medium">{option.label}</span>
                <FiCheck
                  className="w-4 h-4 shrink-0 text-primary-600 dark:text-primary-400 opacity-0 group-data-[selected]:opacity-100"
                  aria-hidden="true"
                />
              </ListboxOption>
            ))}
          </ListboxOptions>
        </div>
      </Listbox>
      <FieldMessage error={error} hint={hint} />
    </div>
  );
});

export const Textarea = forwardRef(function Textarea(
  { label, hint, error, required, className = '', id, rows = 3, ...props },
  ref
) {
  const generatedId = useId();
  const textareaId = id || generatedId;

  if (!label) {
    return (
      <div className={className}>
        <textarea
          ref={ref}
          id={textareaId}
          rows={rows}
          aria-invalid={error ? 'true' : undefined}
          className={controlClasses(error, 'px-3.5 py-2.5 resize-y')}
          {...props}
        />
        <FieldMessage error={error} hint={hint} />
      </div>
    );
  }

  return (
    <div className={className}>
      <div className={shellClasses(error)}>
        <ShellLabel htmlFor={textareaId} label={label} required={required} />
        <textarea
          ref={ref}
          id={textareaId}
          rows={rows}
          aria-invalid={error ? 'true' : undefined}
          className="field-shell-control resize-y min-h-[4.5rem] py-0.5"
          {...props}
        />
      </div>
      <FieldMessage error={error} hint={hint} />
    </div>
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
