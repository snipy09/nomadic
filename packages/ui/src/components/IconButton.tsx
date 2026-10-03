import * as React from 'react';
import { cn, type Size } from '../utils';
import { buttonBase, buttonVariants, type ButtonVariant } from './Button';
import { Spinner } from './Spinner';
import { Tooltip, type TooltipProps } from './Tooltip';

const squareSizes: Record<Size, string> = {
  sm: 'size-ctl-sm [&_svg]:size-3.5',
  md: 'size-ctl-md [&_svg]:size-4',
  lg: 'size-ctl-lg [&_svg]:size-[18px]',
};

export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> {
  /** Accessible name. Also used as the tooltip text. Required. */
  label: string;
  icon: React.ReactNode;
  variant?: ButtonVariant;
  size?: Size;
  loading?: boolean;
  /** Show the label in a tooltip on hover/focus. Default true. */
  tooltip?: boolean;
  /** Keyboard shortcut shown in the tooltip. */
  shortcut?: string[];
  tooltipSide?: TooltipProps['side'];
  /** For toggle buttons: sets aria-pressed and a selected style. */
  pressed?: boolean;
}

/** Square icon-only button. Always has an accessible name and, by default, a tooltip. */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    label,
    icon,
    variant = 'ghost',
    size = 'md',
    loading,
    tooltip = true,
    shortcut,
    tooltipSide,
    pressed,
    className,
    onClick,
    type,
    ...rest
  },
  ref,
) {
  const button = (
    <button
      ref={ref}
      type={type ?? 'button'}
      aria-label={label}
      aria-pressed={pressed}
      aria-busy={loading || undefined}
      onClick={(e) => {
        if (loading) return e.preventDefault();
        onClick?.(e);
      }}
      className={cn(
        buttonBase,
        buttonVariants[variant],
        squareSizes[size],
        'px-0',
        pressed && 'bg-surface-active text-fg',
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size="sm" label={null} /> : icon}
    </button>
  );
  return (
    <Tooltip content={label} shortcut={shortcut} side={tooltipSide} disabled={!tooltip}>
      {button}
    </Tooltip>
  );
});
