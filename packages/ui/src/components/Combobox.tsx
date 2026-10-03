import * as React from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn, type Size } from '../utils';
import { useFieldProps } from './Field';
import { fieldHeights, fieldShell, fieldShellDisabled, fieldShellFocus, fieldShellInvalid } from './Input';

export interface ComboboxOption {
  value: string;
  label: string;
  /** Secondary text, also searched. */
  hint?: string;
  disabled?: boolean;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  /** Controlled value. */
  value?: string | null;
  /** Initial value when uncontrolled. */
  defaultValue?: string | null;
  onChange?: (value: string | null, option: ComboboxOption | null) => void;
  placeholder?: string;
  /** Shown when nothing matches. */
  emptyText?: React.ReactNode;
  size?: Size;
  invalid?: boolean;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  name?: string;
  className?: string;
  /** Custom matcher. Default: case-insensitive substring on label and hint. */
  filter?: (option: ComboboxOption, query: string) => boolean;
  /** Max height of the list in px. */
  maxListHeight?: number;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
}

const defaultFilter = (o: ComboboxOption, q: string) => {
  const s = q.trim().toLowerCase();
  return !s || o.label.toLowerCase().includes(s) || (o.hint?.toLowerCase().includes(s) ?? false);
};

/**
 * Filterable single-select following the WAI-ARIA combobox pattern (list autocomplete).
 * Keys: ↓/↑ open and move, Enter selects, Escape closes (then restores text), Tab leaves.
 */
export const Combobox = React.forwardRef<HTMLInputElement, ComboboxProps>(function Combobox(
  {
    options,
    value: valueProp,
    defaultValue = null,
    onChange,
    placeholder = 'Search…',
    emptyText = 'No matches',
    size = 'md',
    invalid,
    disabled,
    required,
    id,
    name,
    className,
    filter = defaultFilter,
    maxListHeight = 264,
    ...aria
  },
  ref,
) {
  const f = useFieldProps({ id, invalid, disabled, required, 'aria-describedby': aria['aria-describedby'] });
  const reactId = React.useId().replace(/:/g, '');
  const listId = `nm-cb-${reactId}-list`;
  const optionId = (i: number) => `nm-cb-${reactId}-opt-${i}`;

  const [innerValue, setInnerValue] = React.useState<string | null>(defaultValue);
  const value = valueProp !== undefined ? valueProp : innerValue;
  const selected = React.useMemo(() => options.find((o) => o.value === value) ?? null, [options, value]);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState(selected?.label ?? '');
  const [dirty, setDirty] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const listRef = React.useRef<HTMLUListElement>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  // Keep text in sync with external value changes when not typing.
  React.useEffect(() => {
    if (!dirty) setQuery(selected?.label ?? '');
  }, [selected, dirty]);

  const filtered = React.useMemo(
    () => (dirty ? options.filter((o) => filter(o, query)) : options),
    [options, query, dirty, filter],
  );

  const firstEnabled = (from: number, dir: 1 | -1) => {
    const n = filtered.length;
    for (let k = 0; k < n; k++) {
      const i = (from + dir * k + n * 2) % n;
      if (!filtered[i]?.disabled) return i;
    }
    return -1;
  };

  React.useEffect(() => {
    if (!open || active < 0) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[id="${optionId(active)}"]`);
    el?.scrollIntoView?.({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, open]);

  const openList = (startAt?: number) => {
    setOpen(true);
    const selIdx = filtered.findIndex((o) => o.value === value);
    setActive(startAt ?? (selIdx >= 0 ? selIdx : firstEnabled(0, 1)));
  };

  const close = (restore = true) => {
    setOpen(false);
    setActive(-1);
    if (restore) {
      setDirty(false);
      setQuery(selected?.label ?? '');
    }
  };

  const choose = (o: ComboboxOption | undefined) => {
    if (!o || o.disabled) return;
    setInnerValue(o.value);
    onChange?.(o.value, o);
    setQuery(o.label);
    setDirty(false);
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!open) openList();
        else setActive((a) => firstEnabled(a + 1, 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!open) openList(firstEnabled(filtered.length - 1, -1));
        else setActive((a) => firstEnabled(a - 1, -1));
        break;
      case 'Enter':
        if (open && active >= 0) {
          e.preventDefault();
          choose(filtered[active]);
        }
        break;
      case 'Escape':
        if (open) {
          e.preventDefault();
          close();
        } else if (query && !required) {
          e.preventDefault();
          setQuery('');
          setDirty(false);
          setInnerValue(null);
          onChange?.(null, null);
        }
        break;
      case 'Tab':
        if (open) close();
        break;
    }
  };

  return (
    <div className={cn('relative w-full', className)}>
      <div
        className={cn(
          'flex items-center',
          fieldShell,
          fieldShellFocus,
          fieldHeights[size],
          'pr-1',
          f.invalid && fieldShellInvalid,
          f.disabled && fieldShellDisabled,
        )}
      >
        <input
          ref={(node) => {
            inputRef.current = node;
            if (typeof ref === 'function') ref(node);
            else if (ref) ref.current = node;
          }}
          id={f.id}
          name={name}
          type="text"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
          aria-invalid={f['aria-invalid']}
          aria-describedby={f['aria-describedby']}
          aria-label={aria['aria-label']}
          aria-labelledby={aria['aria-labelledby']}
          aria-required={f.required || undefined}
          disabled={f.disabled}
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setDirty(true);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => close()}
          onClick={() => (open ? undefined : openList())}
          className="h-full min-w-0 flex-1 bg-transparent text-inherit outline-none placeholder:text-fg-subtle disabled:cursor-not-allowed"
        />
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          disabled={f.disabled}
          onMouseDown={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
            if (open) close();
            else openList();
          }}
          className="flex size-6 shrink-0 items-center justify-center rounded text-fg-subtle hover:bg-surface-hover hover:text-fg"
        >
          <ChevronsUpDown />
        </button>
      </div>
      <ul
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label={aria['aria-label']}
        hidden={!open}
        style={{ maxHeight: maxListHeight }}
        className={cn(
          'absolute left-0 right-0 top-full z-dropdown mt-1 overflow-auto rounded-lg border border-line bg-surface-raised p-1 shadow-e2',
          open && 'animate-nm-pop-in',
        )}
      >
        {filtered.length === 0 ? (
          <li className="px-2 py-1.5 text-body text-fg-subtle" role="presentation">
            {emptyText}
          </li>
        ) : (
          filtered.map((o, i) => {
            const isSelected = o.value === value;
            return (
              <li
                key={o.value}
                id={optionId(i)}
                role="option"
                aria-selected={isSelected}
                aria-disabled={o.disabled || undefined}
                data-active={i === active || undefined}
                onMouseDown={(e) => e.preventDefault()}
                onMouseMove={() => !o.disabled && active !== i && setActive(i)}
                onClick={() => choose(o)}
                className={cn(
                  'relative flex cursor-default select-none items-center gap-2 rounded-md py-1.5 pl-2 pr-8 text-body text-fg',
                  'data-[active]:bg-surface-hover',
                  o.disabled && 'text-fg-disabled',
                )}
              >
                <span className="truncate">{o.label}</span>
                {o.hint && <span className="ml-auto shrink-0 text-label text-fg-subtle">{o.hint}</span>}
                {isSelected && <Check className="absolute right-2 size-4 text-accent" aria-hidden="true" strokeWidth={2.25} />}
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
});
