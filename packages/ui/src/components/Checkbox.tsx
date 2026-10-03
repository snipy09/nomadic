import * as React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check, Minus } from 'lucide-react';
import { cn, focusRing } from '../utils';

export interface CheckboxProps
  extends Omit<React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>, 'children'> {
  label?: React.ReactNode;
  description?: React.ReactNode;
  invalid?: boolean;
}

/** Checkbox with optional label/description. Supports `checked="indeterminate"`. Space toggles. */
export const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(function Checkbox(
  { label, description, invalid, id, className, disabled, ...rest },
  ref,
) {
  const autoId = React.useId().replace(/:/g, '');
  const controlId = id ?? `nm-cbx-${autoId}`;
  const descId = description ? `${controlId}-desc` : undefined;

  const box = (
    <CheckboxPrimitive.Root
      ref={ref}
      id={controlId}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      aria-describedby={descId}
      className={cn(
        'peer flex size-4 shrink-0 items-center justify-center rounded border border-line-strong bg-surface text-accent-fg shadow-e1',
        'transition-colors duration-fast ease-standard hover:border-fg-disabled',
        'data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent',
        'disabled:cursor-not-allowed disabled:opacity-50',
        invalid && 'border-danger',
        focusRing,
        !label && className,
      )}
      {...rest}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center">
        {rest.checked === 'indeterminate' ? (
          <Minus className="size-3" strokeWidth={3} aria-hidden="true" />
        ) : (
          <Check className="size-3" strokeWidth={3} aria-hidden="true" />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );

  if (!label) return box;

  return (
    <div className={cn('flex items-start gap-2.5', className)}>
      <span className="flex h-5 items-center">{box}</span>
      <span className="flex min-w-0 flex-col">
        <label
          htmlFor={controlId}
          className={cn('cursor-default select-none text-body text-fg', disabled && 'text-fg-disabled')}
        >
          {label}
        </label>
        {description && (
          <span id={descId} className="text-label text-fg-subtle">
            {description}
          </span>
        )}
      </span>
    </div>
  );
});
