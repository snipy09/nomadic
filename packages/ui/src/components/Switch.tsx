import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn, focusRing } from '../utils';

export interface SwitchProps extends Omit<React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>, 'children'> {
  label?: React.ReactNode;
  description?: React.ReactNode;
  size?: 'sm' | 'md';
  /** Put the label before the switch (settings rows). Default: after. */
  labelPosition?: 'start' | 'end';
}

const track = {
  sm: 'h-4 w-7',
  md: 'h-5 w-9',
};
const thumb = {
  sm: 'size-3 data-[state=checked]:translate-x-3',
  md: 'size-4 data-[state=checked]:translate-x-4',
};

/** On/off toggle (role="switch"). Space or Enter toggles. */
export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { label, description, size = 'md', labelPosition = 'end', id, className, disabled, ...rest },
  ref,
) {
  const autoId = React.useId().replace(/:/g, '');
  const controlId = id ?? `nm-switch-${autoId}`;
  const descId = description ? `${controlId}-desc` : undefined;

  const control = (
    <SwitchPrimitive.Root
      ref={ref}
      id={controlId}
      disabled={disabled}
      aria-describedby={descId}
      className={cn(
        'relative inline-flex shrink-0 cursor-default items-center rounded-full border border-transparent p-px',
        'bg-line-strong transition-colors duration-base ease-standard',
        'hover:bg-fg-disabled data-[state=checked]:bg-accent data-[state=checked]:hover:bg-accent-hover',
        'disabled:cursor-not-allowed disabled:opacity-50',
        track[size],
        focusRing,
        !label && className,
      )}
      {...rest}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none block translate-x-0 rounded-full bg-white shadow-[0_1px_2px_rgb(10_15_44/0.25)]',
          'transition-transform duration-base ease-out',
          thumb[size],
        )}
      />
    </SwitchPrimitive.Root>
  );

  if (!label) return control;

  const text = (
    <span className="flex min-w-0 flex-col">
      <label htmlFor={controlId} className={cn('cursor-default select-none text-body text-fg', disabled && 'text-fg-disabled')}>
        {label}
      </label>
      {description && (
        <span id={descId} className="text-label text-fg-subtle">
          {description}
        </span>
      )}
    </span>
  );

  return (
    <div className={cn('flex items-start gap-3', labelPosition === 'start' && 'justify-between', className)}>
      {labelPosition === 'start' && text}
      <span className="flex h-5 items-center">{control}</span>
      {labelPosition === 'end' && text}
    </div>
  );
});
