import * as React from 'react';
import { cn, type Tone } from '../utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  /** `subtle` tinted fill (default), `outline` border only, `solid` strong fill for counts. */
  variant?: 'subtle' | 'outline' | 'solid';
  size?: 'sm' | 'md';
  /** Leading status dot. */
  dot?: boolean;
  icon?: React.ReactNode;
}

const subtle: Record<Tone, string> = {
  neutral: 'bg-fg/[0.06] text-fg-muted',
  accent: 'bg-accent-subtle text-accent-subtle-fg',
  success: 'bg-success-subtle text-success-fg',
  warning: 'bg-warning-subtle text-warning-fg',
  danger: 'bg-danger-subtle text-danger-fg',
};
const outline: Record<Tone, string> = {
  neutral: 'border-line-strong text-fg-muted',
  accent: 'border-accent/40 text-accent-subtle-fg',
  success: 'border-success/40 text-success-fg',
  warning: 'border-warning/40 text-warning-fg',
  danger: 'border-danger/40 text-danger-fg',
};
const solid: Record<Tone, string> = {
  neutral: 'bg-fg text-canvas',
  accent: 'bg-accent text-accent-fg',
  success: 'bg-success text-canvas',
  warning: 'bg-warning text-black',
  danger: 'bg-danger text-white',
};
const dotColor: Record<Tone, string> = {
  neutral: 'bg-fg-subtle',
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

/** Compact status / metadata label. Not interactive. */
export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { tone = 'neutral', variant = 'subtle', size = 'md', dot, icon, className, children, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn(
        'inline-flex max-w-full shrink-0 items-center gap-1 whitespace-nowrap rounded-full font-regular tabular-nums',
        size === 'sm' ? 'h-4 px-1 text-[10px] leading-4' : 'h-5 px-1.5 text-label',
        variant === 'outline' && 'border',
        variant === 'subtle' && subtle[tone],
        variant === 'outline' && outline[tone],
        variant === 'solid' && solid[tone],
        '[&_svg]:size-3 [&_svg]:shrink-0',
        className,
      )}
      {...rest}
    >
      {dot && <span className={cn('size-1.5 shrink-0 rounded-full', variant === 'solid' ? 'bg-current' : dotColor[tone])} aria-hidden="true" />}
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
});
