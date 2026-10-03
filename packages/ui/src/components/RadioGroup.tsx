import * as React from 'react';
import * as RadioPrimitive from '@radix-ui/react-radio-group';
import { cn, focusRing } from '../utils';

export interface RadioOption {
  value: string;
  label: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
}

export interface RadioGroupProps
  extends Omit<React.ComponentPropsWithoutRef<typeof RadioPrimitive.Root>, 'children' | 'orientation'> {
  options: RadioOption[];
  orientation?: 'vertical' | 'horizontal';
  /** `cards` renders each option as a bordered, selectable tile. */
  variant?: 'default' | 'cards';
}

/** Radio group with roving focus: arrow keys move and select, Tab leaves the group. */
export const RadioGroup = React.forwardRef<HTMLDivElement, RadioGroupProps>(function RadioGroup(
  { options, orientation = 'vertical', variant = 'default', className, ...rest },
  ref,
) {
  const base = React.useId().replace(/:/g, '');
  return (
    <RadioPrimitive.Root
      ref={ref}
      orientation={orientation}
      className={cn(
        'flex',
        orientation === 'vertical' ? 'flex-col' : 'flex-row flex-wrap',
        variant === 'cards' ? 'gap-2' : orientation === 'vertical' ? 'gap-2.5' : 'gap-5',
        className,
      )}
      {...rest}
    >
      {options.map((o) => {
        const id = `nm-radio-${base}-${o.value}`;
        const descId = o.description ? `${id}-desc` : undefined;
        const item = (
          <RadioPrimitive.Item
            id={id}
            value={o.value}
            disabled={o.disabled}
            aria-describedby={descId}
            className={cn(
              'flex size-4 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface shadow-e1',
              'transition-colors duration-fast ease-standard hover:border-fg-disabled',
              'data-[state=checked]:border-accent data-[state=checked]:bg-accent',
              'disabled:cursor-not-allowed disabled:opacity-50',
              focusRing,
            )}
          >
            <RadioPrimitive.Indicator className="size-1.5 rounded-full bg-accent-fg" />
          </RadioPrimitive.Item>
        );
        return (
          <div
            key={o.value}
            className={cn(
              'flex items-start gap-2.5',
              variant === 'cards' &&
                'relative rounded-lg border border-line bg-surface p-3 transition-colors duration-fast hover:border-line-strong has-[[data-state=checked]]:border-accent has-[[data-state=checked]]:bg-accent-subtle/40',
            )}
          >
            <span className="flex h-5 items-center">{item}</span>
            <span className="flex min-w-0 flex-col">
              <label
                htmlFor={id}
                className={cn(
                  'cursor-default select-none text-body text-fg',
                  variant === 'cards' && 'font-strong after:absolute after:inset-0 after:content-[""]',
                  o.disabled && 'text-fg-disabled',
                )}
              >
                {o.label}
              </label>
              {o.description && (
                <span id={descId} className="text-label text-fg-subtle">
                  {o.description}
                </span>
              )}
            </span>
          </div>
        );
      })}
    </RadioPrimitive.Root>
  );
});
