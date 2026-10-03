import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn, focusRing, type Size } from '../utils';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'subtle' | 'danger';

export const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover active:bg-accent-active shadow-e1',
  secondary:
    'bg-surface text-fg border border-line-strong shadow-e1 hover:bg-surface-hover active:bg-surface-active',
  ghost: 'text-fg-muted hover:bg-surface-hover hover:text-fg active:bg-surface-active',
  subtle: 'bg-accent-subtle text-accent-subtle-fg hover:bg-accent-subtle/70 active:bg-accent-subtle/50',
  danger: 'bg-danger text-white hover:bg-danger/90 active:bg-danger/80 shadow-e1',
};

export const buttonSizes: Record<Size, string> = {
  sm: 'h-ctl-sm px-2.5 gap-1.5 text-label [&_svg]:size-3.5',
  md: 'h-ctl-md px-3 gap-2 text-body [&_svg]:size-4',
  lg: 'h-ctl-lg px-4 gap-2 text-body-lg [&_svg]:size-4',
};

export const buttonBase = cn(
  'relative inline-flex select-none items-center justify-center whitespace-nowrap rounded-md font-strong',
  'transition-[background-color,border-color,color,box-shadow] duration-fast ease-standard',
  'disabled:pointer-events-none disabled:opacity-50 aria-disabled:cursor-not-allowed',
  '[&_svg]:shrink-0',
  focusRing,
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: Size;
  /** Shows a spinner, sets aria-busy and ignores clicks while keeping focus. */
  loading?: boolean;
  /** Text announced/shown while loading. Defaults to the children. */
  loadingText?: React.ReactNode;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
  /** Render the single child element (e.g. a router `<a>`) with button styling. */
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading = false,
    loadingText,
    leftIcon,
    rightIcon,
    fullWidth,
    asChild,
    className,
    children,
    disabled,
    onClick,
    type,
    ...rest
  },
  ref,
) {
  const classes = cn(buttonBase, buttonVariants[variant], buttonSizes[size], fullWidth && 'w-full', className);

  if (asChild) {
    return (
      <Slot ref={ref} className={classes} {...rest}>
        {children}
      </Slot>
    );
  }

  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={classes}
      disabled={disabled}
      aria-busy={loading || undefined}
      aria-disabled={loading || disabled || undefined}
      data-loading={loading || undefined}
      onClick={(e) => {
        if (loading) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
      {...rest}
    >
      {loading ? <Spinner size={size === 'sm' ? 'xs' : 'sm'} label={null} /> : leftIcon}
      {loading && loadingText ? loadingText : children}
      {!loading && rightIcon}
    </button>
  );
});
