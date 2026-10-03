import * as React from 'react';
import { cn } from '../utils';

export interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  icon?: React.ReactNode;
  title: React.ReactNode;
  /** One or two sentences: why it is empty and what to do next. */
  description?: React.ReactNode;
  /** Primary (and optional secondary) actions. */
  actions?: React.ReactNode;
  size?: 'sm' | 'md';
  /** Dashed border panel (for in-page regions). */
  bordered?: boolean;
  /** `danger` for error states with a recovery action. */
  tone?: 'neutral' | 'danger';
}

/** Empty, zero-data, or error state with a clear next action. */
export function EmptyState({
  icon,
  title,
  description,
  actions,
  size = 'md',
  bordered,
  tone = 'neutral',
  className,
  ...rest
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        size === 'md' ? 'gap-3 px-6 py-12' : 'gap-2 px-4 py-6',
        bordered && 'rounded-lg border border-dashed border-line-strong',
        className,
      )}
      {...rest}
    >
      {icon && (
        <div
          className={cn(
            'flex items-center justify-center rounded-lg border',
            size === 'md' ? 'size-10 [&_svg]:size-5' : 'size-8 [&_svg]:size-4',
            tone === 'danger' ? 'border-danger/20 bg-danger-subtle text-danger' : 'border-line bg-surface-sunken text-fg-subtle',
          )}
          aria-hidden="true"
        >
          {icon}
        </div>
      )}
      <div className="flex max-w-[360px] flex-col gap-1">
        <h3 className={cn('font-strong text-fg', size === 'md' ? 'text-body-lg' : 'text-body')}>{title}</h3>
        {description && <p className="text-body text-fg-muted">{description}</p>}
      </div>
      {actions && <div className={cn('flex flex-wrap items-center justify-center gap-2', size === 'md' && 'mt-1')}>{actions}</div>}
    </div>
  );
}
