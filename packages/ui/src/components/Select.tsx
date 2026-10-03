import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn, type Size } from '../utils';
import { useFieldProps } from './Field';
import { fieldHeights, fieldShell, fieldShellDisabled, fieldShellInvalid } from './Input';

export interface SelectOption {
  value: string;
  label: React.ReactNode;
  /** Plain-text label for typeahead when `label` is not a string. */
  textValue?: string;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface SelectOptionGroup {
  label: string;
  options: SelectOption[];
}

export interface SelectProps {
  options: Array<SelectOption | SelectOptionGroup>;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  size?: Size;
  invalid?: boolean;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  id?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  contentClassName?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
}

const isGroup = (o: SelectOption | SelectOptionGroup): o is SelectOptionGroup => 'options' in o;

/**
 * Single-select listbox (Radix Select): full keyboard support — arrows, Home/End,
 * typeahead, Enter/Space to choose, Escape to close.
 */
export const Select = React.forwardRef<HTMLButtonElement, SelectProps>(function Select(
  {
    options,
    value,
    defaultValue,
    onValueChange,
    placeholder = 'Select…',
    size = 'md',
    invalid,
    disabled,
    required,
    name,
    id,
    open,
    onOpenChange,
    className,
    contentClassName,
    ...aria
  },
  ref,
) {
  const f = useFieldProps({ id, invalid, disabled, required, 'aria-describedby': aria['aria-describedby'] });

  const renderItem = (o: SelectOption) => (
    <SelectPrimitive.Item
      key={o.value}
      value={o.value}
      disabled={o.disabled}
      textValue={o.textValue ?? (typeof o.label === 'string' ? o.label : o.value)}
      className={cn(
        'relative flex cursor-default select-none items-center gap-2 rounded-md py-1.5 pl-2 pr-8 text-body text-fg outline-none',
        'data-[highlighted]:bg-surface-hover data-[disabled]:pointer-events-none data-[disabled]:text-fg-disabled',
        '[&_svg]:size-4',
      )}
    >
      {o.icon && <span className="flex shrink-0 text-fg-subtle">{o.icon}</span>}
      <span className="flex min-w-0 flex-col">
        <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
        {o.description && <span className="text-label text-fg-subtle">{o.description}</span>}
      </span>
      <SelectPrimitive.ItemIndicator className="absolute right-2 flex items-center text-accent">
        <Check aria-hidden="true" strokeWidth={2.25} />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );

  return (
    <SelectPrimitive.Root
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      disabled={f.disabled}
      required={f.required}
      name={name}
      open={open}
      onOpenChange={onOpenChange}
    >
      <SelectPrimitive.Trigger
        ref={ref}
        id={f.id}
        aria-invalid={f['aria-invalid']}
        aria-describedby={f['aria-describedby']}
        aria-label={aria['aria-label']}
        aria-labelledby={aria['aria-labelledby']}
        className={cn(
          fieldShell,
          fieldHeights[size],
          'inline-flex items-center justify-between text-left outline-none',
          'focus-visible:border-accent focus-visible:ring-[3px] focus-visible:ring-focus/20 data-[state=open]:border-accent',
          'data-[placeholder]:text-fg-subtle',
          f.invalid && fieldShellInvalid,
          f.invalid && 'focus-visible:border-danger focus-visible:ring-danger/20',
          f.disabled && fieldShellDisabled,
          className,
        )}
      >
        <span className="min-w-0 truncate">
          <SelectPrimitive.Value placeholder={placeholder} />
        </span>
        <SelectPrimitive.Icon className="flex shrink-0 text-fg-subtle">
          <ChevronDown aria-hidden="true" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          collisionPadding={8}
          className={cn(
            'z-dropdown max-h-[min(320px,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden',
            'rounded-lg border border-line bg-surface-raised text-fg shadow-e2',
            'data-[state=open]:animate-nm-pop-in data-[state=closed]:animate-nm-pop-out',
            contentClassName,
          )}
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((o, i) =>
              isGroup(o) ? (
                <SelectPrimitive.Group key={`g-${o.label}`}>
                  {i > 0 && <SelectPrimitive.Separator className="-mx-1 my-1 h-px bg-line" />}
                  <SelectPrimitive.Label className="px-2 pb-1 pt-1.5 text-caption font-strong text-fg-subtle">
                    {o.label}
                  </SelectPrimitive.Label>
                  {o.options.map(renderItem)}
                </SelectPrimitive.Group>
              ) : (
                renderItem(o)
              ),
            )}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
});
