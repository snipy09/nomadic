import * as React from 'react';
import { cn } from '../utils';

const keyNames: Record<string, string> = {
  '⌘': 'Command',
  '⌃': 'Control',
  '⌥': 'Option',
  '⇧': 'Shift',
  '↵': 'Enter',
  '⏎': 'Enter',
  '⌫': 'Backspace',
  '⎋': 'Escape',
  '↑': 'Up arrow',
  '↓': 'Down arrow',
  '←': 'Left arrow',
  '→': 'Right arrow',
};

export interface KbdProps extends React.HTMLAttributes<HTMLElement> {
  /** Render a key combination, e.g. `['Ctrl', 'K']`. Otherwise renders children as one key. */
  keys?: string[];
  size?: 'sm' | 'md';
  /** Use inside inverted surfaces such as tooltips. */
  tone?: 'default' | 'inverted';
}

const keyClass = (size: 'sm' | 'md', tone: 'default' | 'inverted') =>
  cn(
    'inline-flex items-center justify-center rounded font-sans font-regular tabular-nums leading-none',
    size === 'sm' ? 'h-4 min-w-4 px-1 text-[10px]' : 'h-5 min-w-5 px-1.5 text-caption',
    tone === 'default'
      ? 'border border-line bg-surface text-fg-muted shadow-[inset_0_-1px_0_rgb(var(--nm-line-strong))]'
      : 'bg-canvas/15 text-canvas',
  );

/** Keyboard key or shortcut. Symbols get readable names for assistive tech. */
export function Kbd({ keys, size = 'md', tone = 'default', className, children, ...rest }: KbdProps) {
  if (keys && keys.length > 0) {
    return (
      <kbd
        className={cn('inline-flex items-center gap-0.5 font-sans', className)}
        aria-label={keys.map((k) => keyNames[k] ?? k).join(' + ')}
        {...rest}
      >
        {keys.map((k, i) => (
          <kbd key={`${k}-${i}`} className={keyClass(size, tone)} aria-hidden="true">
            {k}
          </kbd>
        ))}
      </kbd>
    );
  }
  const label = typeof children === 'string' ? keyNames[children] : undefined;
  return (
    <kbd className={cn(keyClass(size, tone), className)} aria-label={label} {...rest}>
      {children}
    </kbd>
  );
}
