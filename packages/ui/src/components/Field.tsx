import * as React from 'react';
import { cn } from '../utils';

interface FieldContextValue {
  id: string;
  describedBy?: string;
  invalid: boolean;
  required: boolean;
  disabled: boolean;
}

const FieldContext = React.createContext<FieldContextValue | null>(null);

/** Read the surrounding Field (if any) so controls can wire id / aria attributes. */
export function useField() {
  return React.useContext(FieldContext);
}

/** Merge a control's own props with the surrounding Field's wiring. */
export function useFieldProps(props: {
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: React.AriaAttributes['aria-invalid'];
  invalid?: boolean;
  required?: boolean;
  disabled?: boolean;
}) {
  const field = useField();
  const describedBy = [props['aria-describedby'], field?.describedBy].filter(Boolean).join(' ') || undefined;
  const ariaInvalid = props['aria-invalid'] === true || props['aria-invalid'] === 'true';
  const invalid = props.invalid ?? (ariaInvalid || (field?.invalid ?? false));
  return {
    id: props.id ?? field?.id,
    'aria-describedby': describedBy,
    'aria-invalid': invalid || undefined,
    invalid,
    required: props.required ?? field?.required,
    disabled: props.disabled ?? field?.disabled,
  };
}

export interface FieldProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  label?: React.ReactNode;
  /** Help text under the control. Hidden while an error is shown. */
  hint?: React.ReactNode;
  /** Error message. Marks the control aria-invalid and announces politely. */
  error?: React.ReactNode;
  required?: boolean;
  disabled?: boolean;
  /** Supply to control the generated id. */
  id?: string;
  /** Extra content aligned right of the label (e.g. a char counter or link). */
  labelAside?: React.ReactNode;
  children: React.ReactNode;
}

/** Label + control + hint/error, with ids and aria wiring handled for you. */
export function Field({ label, hint, error, required = false, disabled = false, id, labelAside, className, children, ...rest }: FieldProps) {
  const autoId = React.useId();
  const controlId = id ?? `nm-field-${autoId.replace(/:/g, '')}`;
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;
  const hasError = error != null && error !== false && error !== '';
  const describedBy = hasError ? errorId : hint ? hintId : undefined;

  const ctx = React.useMemo<FieldContextValue>(
    () => ({ id: controlId, describedBy, invalid: hasError, required, disabled }),
    [controlId, describedBy, hasError, required, disabled],
  );

  return (
    <div className={cn('flex flex-col gap-1.5', className)} {...rest}>
      {(label || labelAside) && (
        <div className="flex items-baseline justify-between gap-2">
          {label && (
            <label htmlFor={controlId} className={cn('text-label font-strong text-fg', disabled && 'text-fg-disabled')}>
              {label}
              {required && (
                <span className="ml-0.5 text-danger" aria-hidden="true">
                  *
                </span>
              )}
            </label>
          )}
          {labelAside && <div className="text-label text-fg-subtle">{labelAside}</div>}
        </div>
      )}
      <FieldContext.Provider value={ctx}>{children}</FieldContext.Provider>
      {hasError ? (
        <p id={errorId} className="text-label text-danger-fg" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-label text-fg-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
