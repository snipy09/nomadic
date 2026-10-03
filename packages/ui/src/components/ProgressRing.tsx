import * as React from 'react';
import { cn } from '../utils';

export interface ProgressRingProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Current value. Omit / null for indeterminate. */
  value?: number | null;
  max?: number;
  /** Diameter in px. */
  size?: number;
  thickness?: number;
  tone?: 'accent' | 'success' | 'warning' | 'danger';
  /** Show the percentage (or custom children) in the centre. */
  showValue?: boolean;
  /** Accessible name, e.g. "Profile completeness". */
  label: string;
  /** Custom centre content. */
  children?: React.ReactNode;
}

const toneClass = { accent: 'text-accent', success: 'text-success', warning: 'text-warning', danger: 'text-danger' };

/** Circular progress (role="progressbar"). Animates value changes; static under reduced motion. */
export function ProgressRing({
  value,
  max = 100,
  size = 40,
  thickness = 4,
  tone = 'accent',
  showValue,
  label,
  className,
  children,
  ...rest
}: ProgressRingProps) {
  const indeterminate = value == null;
  const clamped = indeterminate ? 0 : Math.min(Math.max(value, 0), max);
  const pct = max > 0 ? clamped / max : 0;
  const r = (size - thickness) / 2;
  const circ = 2 * Math.PI * r;
  const dash = indeterminate ? circ * 0.25 : circ * pct;
  const text = `${Math.round(pct * 100)}%`;

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={indeterminate ? undefined : 0}
      aria-valuemax={indeterminate ? undefined : max}
      aria-valuenow={indeterminate ? undefined : clamped}
      aria-valuetext={indeterminate ? undefined : text}
      className={cn('relative inline-flex shrink-0 items-center justify-center', toneClass[tone], className)}
      style={{ width: size, height: size }}
      {...rest}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={cn('-rotate-90', indeterminate && 'animate-nm-spin')} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={thickness} className="stroke-line" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          className="transition-[stroke-dasharray] duration-slow ease-out"
          opacity={!indeterminate && pct === 0 ? 0 : 1}
        />
      </svg>
      {(showValue || children) && (
        <span
          className={cn(
            'absolute inset-0 flex items-center justify-center font-strong tabular-nums text-fg',
            size >= 56 ? 'text-body' : 'text-[10px]',
          )}
        >
          {children ?? (indeterminate ? null : text)}
        </span>
      )}
    </div>
  );
}
