import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn, focusRing } from '../utils';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** `outline` (default, flat with border), `raised` (adds e1 shadow), `sunken` (inset panel). */
  variant?: 'outline' | 'raised' | 'sunken';
  /** Hover and focus styles for clickable cards. Combine with asChild + <button>/<a>. */
  interactive?: boolean;
  /** Mark as selected (e.g. in a list of choosable cards). */
  selected?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  asChild?: boolean;
}

const paddings = { none: '', sm: 'p-3', md: 'p-4', lg: 'p-6' };

export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { variant = 'outline', interactive, selected, padding = 'none', asChild, className, ...rest },
  ref,
) {
  const Comp = asChild ? Slot : 'div';
  return (
    <Comp
      ref={ref}
      data-selected={selected || undefined}
      className={cn(
        'relative flex flex-col rounded-lg border text-left text-fg',
        variant === 'outline' && 'border-line/70 bg-surface shadow-e1',
        variant === 'raised' && 'border-line/70 bg-surface shadow-e2',
        variant === 'sunken' && 'border-line bg-surface-sunken',
        interactive &&
          cn('cursor-default transition-[border-color,background-color,box-shadow] duration-fast ease-standard hover:border-line-strong hover:bg-surface-hover/50', focusRing),
        selected && 'border-accent ring-1 ring-inset ring-accent',
        paddings[padding],
        className,
      )}
      {...rest}
    />
  );
});

export interface CardHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Right-aligned actions (buttons, menus). */
  actions?: React.ReactNode;
  /** Leading icon or avatar. */
  icon?: React.ReactNode;
}

export function CardHeader({ title, description, actions, icon, className, children, ...rest }: CardHeaderProps) {
  return (
    <div className={cn('flex items-start gap-3 px-4 pb-0 pt-4', className)} {...rest}>
      {icon && (
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent [&_svg]:size-4">
          {icon}
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {title && <h3 className="truncate text-body-lg font-strong text-fg">{title}</h3>}
        {description && <p className="text-body text-fg-muted">{description}</p>}
        {children}
      </div>
      {actions && <div className="-mr-1 -mt-0.5 flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  );
}

export function CardContent({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-4 py-4', className)} {...rest} />;
}

export function CardFooter({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-auto flex items-center gap-2 border-t border-line px-4 py-3', className)} {...rest} />;
}
