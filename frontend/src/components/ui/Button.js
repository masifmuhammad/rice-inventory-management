import React, { forwardRef } from 'react';
import { FiLoader } from 'react-icons/fi';
import { feedbackTick } from '../../utils/feedback';

const base =
  'inline-flex items-center justify-center gap-2 font-medium rounded-xl select-none ' +
  'transition-[background-color,box-shadow,transform,opacity,border-color] duration-150 ease-out ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base focus-visible:ring-primary-500 ' +
  'disabled:opacity-55 disabled:cursor-not-allowed disabled:pointer-events-none';

// The press effect is the only transform, so it never fights a parent animation.
const press = 'active:scale-[0.96] motion-reduce:active:scale-100 motion-reduce:transition-none';

const variants = {
  primary:
    'bg-primary-600 text-white shadow-[0_1px_2px_rgb(0_0_0/0.12),inset_0_1px_0_rgb(255_255_255/0.12)] hover:bg-primary-500',
  secondary:
    'bg-surface-1 text-content border border-hairline/[0.12] hover:border-hairline/20 hover:bg-surface-3',
  ghost: 'text-content-muted hover:bg-hairline/[0.06] hover:text-content',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-500 focus-visible:ring-red-500',
  dangerGhost: 'text-red-500 hover:bg-red-500/10 focus-visible:ring-red-500',
  success: 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-500 focus-visible:ring-emerald-500',
};

const sizes = {
  sm: 'text-sm px-3 py-1.5 min-h-[36px]',
  // 44px is the comfortable touch target on a phone.
  md: 'text-sm px-4 py-2.5 min-h-[44px]',
  lg: 'text-base px-6 py-3 min-h-[48px]',
  icon: 'p-2.5 min-h-[44px] min-w-[44px]',
};

const Button = forwardRef(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    icon: Icon,
    iconRight: IconRight,
    fullWidth = false,
    static: isStatic = false,
    className = '',
    children,
    disabled,
    type = 'button',
    onPointerDown,
    ...props
  },
  ref
) {
  /**
   * Haptic on press, not on click.
   *
   * The tick has to land at the moment of contact to read as the button
   * responding; fired from onClick it arrives after the handler and feels like
   * a reaction to something that already happened. `feedbackTick` respects the
   * user's haptics preference and no-ops where the API is unavailable.
   */
  const handlePointerDown = (event) => {
    if (!disabled && !loading && event.pointerType === 'touch') feedbackTick();
    onPointerDown?.(event);
  };

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      onPointerDown={handlePointerDown}
      className={[
        base,
        !isStatic && press,
        variants[variant] || variants.primary,
        sizes[size] || sizes.md,
        fullWidth ? 'w-full' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {loading ? (
        <FiLoader className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
      ) : (
        Icon && <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
      )}
      {children}
      {!loading && IconRight && <IconRight className="w-4 h-4 shrink-0" aria-hidden="true" />}
    </button>
  );
});

export default Button;
