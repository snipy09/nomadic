import * as React from 'react';
import { cn, type Size } from '../utils';
import { useFieldProps } from './Field';

/** Shared look for text-like controls (Input wrapper, Textarea, Select trigger, Combobox). */
export const fieldShell = cn(
  'w-full rounded-md border border-line-strong/80 bg-surface text-fg',
  'transition-[border-color,box-shadow,background-color] duration-fast ease-standard',
  'hover:border-line-strong',
);
export const fieldShellFocus = 'focus-within:border-accent/70 focus-within:ring-[3.5px] focus-within:ring-focus/25';
export const fieldShellInvalid =
  'border-danger hover:border-danger focus-within:border-danger focus-within:ring-danger/20';
export const fieldShellDisabled = 'cursor-not-allowed bg-surface-sunken text-fg-disabled shadow-none hover:border-line-strong';

export const fieldHeights: Record<Size, string> = {
  sm: 'h-ctl-sm text-label px-2 gap-1.5 [&_svg]:size-3.5',
  md: 'h-ctl-md text-body px-2.5 gap-2 [&_svg]:size-4',
  lg: 'h-ctl-lg text-body-lg px-3 gap-2 [&_svg]:size-4',
};

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: Size;
  invalid?: boolean;
  /** Icon or text before the value (e.g. a search icon). Decorative. */
  leftIcon?: React.ReactNode;
  /** Trailing content: a Kbd hint, unit, clear IconButton... */
  rightSlot?: React.ReactNode;
  /** Classes for the outer wrapper (className goes to the <input>). */
  wrapperClassName?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { size = 'md', invalid, leftIcon, rightSlot, className, wrapperClassName, disabled, required, id, ...rest },
  ref,
) {
  const f = useFieldProps({ id, invalid, disabled, required, 'aria-describedby': rest['aria-describedby'], 'aria-invalid': rest['aria-invalid'] });
  return (
    <div
      className={cn(
        'flex items-center',
        fieldShell,
        fieldShellFocus,
        fieldHeights[size],
        f.invalid && fieldShellInvalid,
        f.disabled && fieldShellDisabled,
        wrapperClassName,
      )}
      data-invalid={f.invalid || undefined}
      data-disabled={f.disabled || undefined}
    >
      {leftIcon && (
        <span className="flex shrink-0 items-center text-fg-subtle" aria-hidden="true">
          {leftIcon}
        </span>
      )}
      <input
        ref={ref}
        {...rest}
        id={f.id}
        disabled={f.disabled}
        required={f.required}
        aria-invalid={f['aria-invalid']}
        aria-describedby={f['aria-describedby']}
        className={cn(
          'h-full min-w-0 flex-1 bg-transparent text-inherit outline-none placeholder:text-fg-subtle',
          'disabled:cursor-not-allowed [&::-webkit-search-cancel-button]:hidden',
          className,
        )}
      />
      {rightSlot && <span className="flex shrink-0 items-center text-fg-subtle">{rightSlot}</span>}
    </div>
  );
});

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  /** Grow with content up to maxRows. */
  autoResize?: boolean;
  maxRows?: number;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, autoResize, maxRows = 12, className, disabled, required, id, rows = 3, onChange, ...rest },
  forwardedRef,
) {
  const f = useFieldProps({ id, invalid, disabled, required, 'aria-describedby': rest['aria-describedby'], 'aria-invalid': rest['aria-invalid'] });
  const innerRef = React.useRef<HTMLTextAreaElement | null>(null);

  const resize = React.useCallback(() => {
    const el = innerRef.current;
    if (!el || !autoResize) return;
    el.style.height = 'auto';
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 20;
    el.style.height = `${Math.min(el.scrollHeight + 2, lh * maxRows + 18)}px`;
  }, [autoResize, maxRows]);

  React.useLayoutEffect(resize, [resize, rest.value]);

  return (
    <textarea
      ref={(node) => {
        innerRef.current = node;
        if (typeof forwardedRef === 'function') forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      }}
      rows={rows}
      {...rest}
      id={f.id}
      disabled={f.disabled}
      required={f.required}
      aria-invalid={f['aria-invalid']}
      aria-describedby={f['aria-describedby']}
      onChange={(e) => {
        onChange?.(e);
        resize();
      }}
      className={cn(
        fieldShell,
        'block px-2.5 py-1.5 text-body outline-none placeholder:text-fg-subtle',
        'focus:border-accent focus:ring-[3px] focus:ring-focus/20',
        autoResize ? 'resize-none overflow-auto' : 'resize-y',
        f.invalid && 'border-danger hover:border-danger focus:border-danger focus:ring-danger/20',
        f.disabled && fieldShellDisabled,
        className,
      )}
    />
  );
});
