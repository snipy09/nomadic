import * as React from 'react';
import { cn } from '../utils';

const sizes = { xs: 12, sm: 14, md: 16, lg: 20, xl: 24 } as const;

export interface SpinnerProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
  size?: keyof typeof sizes | number;
  /**
   * Accessible label announced via role="status". Pass `null` when the spinner is
   * decorative (e.g. inside a button that already sets aria-busy).
   */
  label?: string | null;
}

/** Indeterminate activity indicator. Slows down under prefers-reduced-motion. */
export const Spinner = React.forwardRef<HTMLSpanElement, SpinnerProps>(function Spinner(
  { size = 'md', label = 'Loading', className, ...rest },
  ref,
) {
  const px = typeof size === 'number' ? size : sizes[size];
  const decorative = label === null || label === '';
  return (
    <span
      ref={ref}
      role={decorative ? undefined : 'status'}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative ? true : undefined}
      className={cn('inline-flex shrink-0 items-center justify-center text-current', className)}
      {...rest}
    >
      <svg
        width={px}
        height={px}
        viewBox="0 0 16 16"
        fill="none"
        className="animate-nm-spin"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1.75" />
        <path d="M14.25 8A6.25 6.25 0 0 0 8 1.75" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    </span>
  );
});
