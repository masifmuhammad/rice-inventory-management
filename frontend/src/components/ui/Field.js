import React, { Children, forwardRef, isValidElement, useId, useMemo } from 'react';
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react';
import { FiCheck, FiChevronDown } from 'react-icons/fi';
import useMediaQuery from '../../hooks/useMediaQuery';

/**
 * Everything the return key should be able to reach, in document order.
 *
 * Deliberately no picker button. Headless UI's listbox button handles Enter by
 * calling `attemptSubmit` — so landing the return key on one would hand the user
 * a submitted, half-filled form where they expected to carry on. The return key
 * belongs to the fields you type into; a picker is a tap either way, and a
 * required one that gets skipped is caught by validation on submit.
 */
const FORM_FIELDS = 'input:not([type="hidden"]), textarea, select';

/**
 * Return moves to the next field rather than submitting the form.
 *
 * On a phone this is the whole difference between filling a form and fighting
 * one. The keyboard covers two thirds of the screen, so the default behaviour —
 * submit, or nothing — leaves the only way forward as dismissing the keyboard,
 * finding the next field under where it was, tapping it, and waiting for the
 * keyboard to come back. Seven fields is seven of those. With this, the whole
 * form is one hand: type, return, type, return.
 *
 * The last field still submits, because by then that is what the return key
 * genuinely means. Shift+Return is left alone for anyone on a hardware
 * keyboard, and so is anything a caller has already handled.
 */
function advanceOnEnter(event) {
  if (event.key !== 'Enter' || event.defaultPrevented || event.shiftKey) return;

  const field = event.currentTarget;
  const form = field.form || field.closest('form');
  if (!form) return;

  const fields = Array.from(form.querySelectorAll(FORM_FIELDS)).filter(
    (node) => !node.disabled && node.tabIndex !== -1 && node.offsetParent !== null
  );

  const next = fields[fields.indexOf(field) + 1];
  if (!next) return;

  event.preventDefault();
  next.focus();
}

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
  {
    label,
    hint,
    error,
    required,
    icon: Icon,
    prefix,
    className = '',
    id,
    // Android and iOS both label the return key from this. Every form in the
    // app ends on a textarea or a picker, so "next" is the truth on every
    // <Input> there is; a caller with a one-field form can still say otherwise.
    enterKeyHint = 'next',
    onKeyDown,
    ...props
  },
  ref
) {
  const generatedId = useId();
  const inputId = id || generatedId;

  const handleKeyDown = (event) => {
    onKeyDown?.(event);
    advanceOnEnter(event);
  };

  const keyboardProps = { enterKeyHint, onKeyDown: handleKeyDown };

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
            {...keyboardProps}
            {...props}
          />
        </div>
        <FieldMessage error={error} hint={hint} />
      </div>
    );
  }

  return (
    <div className={className}>
      {/* The shell itself is the label, not just the caption inside it. A 56px
          well where only the 24px text line focuses the input is the difference
          between a field that feels solid under a thumb and one you have to aim
          at — the padding, the caption and the empty space to the right of a
          short value are all part of the control now. */}
      <label htmlFor={inputId} className={shellClasses(error, 'cursor-text')}>
        <ShellLabel as="span" label={label} required={required} />
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
            {...keyboardProps}
            {...props}
          />
        </div>
      </label>
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
  const isPhone = useMediaQuery('(max-width: 639px)');

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
            /* `...props` carries the `aria-label` that every unlabelled toolbar
               filter relies on for its accessible name. Dropping it left the
               category, sort, type and status dropdowns announcing only their
               current value — three adjacent buttons a screen reader user
               cannot tell apart. */
            {...props}
            className={`${
              compact
                ? controlClasses(
                    error,
                    `${flatSizing} relative w-full flex items-center text-left cursor-pointer`
                  )
                : shellClasses(error, 'relative w-full text-left cursor-pointer')
            }
              data-[open]:ring-2 data-[open]:ring-primary-500/35 data-[open]:border-primary-500/55
              active:bg-hairline/[0.04] transition-colors duration-100 ease-out
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
            portal
            /**
             * A phone sheet is not anchored to anything, so it must not be
             * *anchored*.
             *
             * `anchor` starts a positioning engine that measures the button and
             * writes `position`, `left`, `top` and `max-height` as inline
             * styles, and re-runs on every scroll and every viewport resize.
             * Overriding all of that with `!important` produced the right
             * picture most of the time, and the rest of the time — a keyboard
             * opening or closing underneath it, which is exactly when a picker
             * is used — the engine recomputed against a viewport that was
             * mid-resize and the sheet jumped or came back the wrong size.
             * That is the unreliability, and there is nothing to fix in it: a
             * sheet pinned to the bottom edge of the screen has no anchor to
             * compute. `portal` alone gets it out of the modal; the classes do
             * the rest, with no `!important` left to fight.
             *
             * The engine stays where it earns its keep: on a pointer device the
             * dropdown genuinely does hang off the button and genuinely does
             * need to flip when there is no room below.
             */
            anchor={isPhone ? undefined : 'bottom start'}
            transition
            /**
             * A phone gets a sheet, not a dropdown.
             *
             * A 240px scrolling list inside a bottom sheet is two scroll
             * containers competing for the same finger, which is why picking a
             * category felt unresponsive — the gesture was being arbitrated
             * rather than tracked. A sheet from the bottom edge has one scroll
             * area, full-width targets, and comes from and returns to the same
             * place, so the path in matches the path out.
             *
             * The `!` overrides beat the inline styles the positioning engine
             * writes; it still portals out of the modal, which is what makes a
             * viewport-anchored sheet possible from in here.
             *
             * On a pointer device it stays a dropdown, and now scales from the
             * corner it is anchored to rather than its own top — flipping to
             * `origin-bottom` when there is no room below and it opens upward.
             *
             * The scrim behind it is this element's own box-shadow, not a
             * separate overlay. It used to be a div portaled to `document.body`,
             * and that could never work from inside a modal: Headless UI's
             * Dialog puts nested portals *inside* the dialog element, which is
             * `z-50` and therefore its own stacking context — so a body-level
             * `z-[75]` scrim painted over the whole dialog, sheet included. That
             * is the grey wash over everything, and why no option could be
             * tapped: every touch landed on the scrim. A shadow renders in this
             * element's own layer and takes no pointer events at all, so there
             * is nothing left to intercept the tap.
             */
            className="z-[80] overflow-y-auto overscroll-contain outline-none bg-surface-1
              border border-hairline/[0.1] sm:shadow-2xl

              max-sm:fixed max-sm:inset-x-0 max-sm:top-auto
              max-sm:bottom-0 max-sm:w-full max-sm:max-h-[70dvh]
              max-sm:rounded-t-[28px] max-sm:border-x-0 max-sm:border-b-0 max-sm:p-2
              max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]
              max-sm:shadow-[0_0_0_100vmax_rgba(0,0,0,0.45)]
              max-sm:origin-bottom max-sm:transition-[transform,box-shadow] max-sm:duration-[320ms]
              max-sm:ease-[cubic-bezier(0.32,0.72,0,1)]
              max-sm:data-[closed]:translate-y-full max-sm:data-[closed]:opacity-100
              max-sm:data-[closed]:shadow-[0_0_0_100vmax_rgba(0,0,0,0)]

              sm:w-[var(--button-width)] sm:max-h-60 sm:rounded-well sm:p-1.5
              sm:origin-top data-[anchor~=top]:sm:origin-bottom
              sm:transition sm:duration-150 sm:ease-out
              sm:data-[closed]:scale-95 sm:data-[closed]:opacity-0
              [--anchor-gap:6px]"
          >
            {/* A grabber, so the sheet reads as something that came up from the
                bottom and can go back down. */}
            <div className="sm:hidden pt-1 pb-2 flex justify-center" aria-hidden="true">
              <div className="w-9 h-1 rounded-full bg-hairline/[0.14]" />
            </div>

            {options.map((option) => (
              <ListboxOption
                key={`${option.value}::${option.label}`}
                value={option.value}
                disabled={option.disabled}
                className="group flex cursor-pointer items-center gap-2 rounded-lg px-3
                  py-2.5 min-h-[44px] max-sm:min-h-[52px] max-sm:px-4 max-sm:text-[16px]
                  text-sm text-content select-none outline-none
                  data-[focus]:bg-primary-500/10 data-[selected]:bg-primary-500/12
                  data-[disabled]:opacity-40 data-[disabled]:cursor-not-allowed
                  active:bg-primary-500/[0.14] transition-colors duration-100"
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
      <label htmlFor={textareaId} className={shellClasses(error, 'cursor-text')}>
        <ShellLabel as="span" label={label} required={required} />
        <textarea
          ref={ref}
          id={textareaId}
          rows={rows}
          aria-invalid={error ? 'true' : undefined}
          className="field-shell-control resize-y min-h-[4.5rem] py-0.5"
          {...props}
        />
      </label>
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
