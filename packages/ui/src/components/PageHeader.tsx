import * as React from 'react';
import { cn } from '../utils';

export interface PageHeaderProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  title: React.ReactNode;
  /** One short line under the title: what the page is for, or a count. */
  description?: React.ReactNode;
  /** Buttons on the right; keep to one primary action. */
  actions?: React.ReactNode;
}

/** The one page title style (an Apple large title): same size, spacing and action placement on every screen. */
export function PageHeader({ title, description, actions, className, ...rest }: PageHeaderProps) {
  return (
    <header className={cn('flex flex-wrap items-end gap-x-4 gap-y-2', className)} {...rest}>
      <div className="mr-auto min-w-0">
        <h1 className="text-headline font-bold text-fg">{title}</h1>
        {description && <p className="mt-0.5 text-body text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export type FilterBarProps = React.HTMLAttributes<HTMLDivElement>;

/**
 * One row of filters: a growing search field followed by compact selects.
 * Selects inside keep their content width instead of stretching to a row each.
 */
export function FilterBar({ className, children, ...rest }: FilterBarProps) {
  return (
    <div
      role="group"
      className={cn('flex flex-wrap items-center gap-2 [&>button[role=combobox]]:w-auto [&>button[role=combobox]]:min-w-[9.5rem]', className)}
      {...rest}
    >
      {children}
    </div>
  );
}
