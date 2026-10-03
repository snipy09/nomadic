import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '../utils';
import { Kbd } from './Kbd';

export interface TooltipProviderProps {
  children: React.ReactNode;
  /** ms before a tooltip opens. */
  delayDuration?: number;
  /** ms window in which moving to another trigger opens instantly. */
  skipDelayDuration?: number;
}

/** Required once near the app root (UIProvider includes it). */
export function TooltipProvider({ children, delayDuration = 400, skipDelayDuration = 250 }: TooltipProviderProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration} skipDelayDuration={skipDelayDuration}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

export interface TooltipProps {
  /** The trigger. Must be a single focusable element that forwards refs. */
  children: React.ReactElement;
  content: React.ReactNode;
  /** Optional keyboard shortcut rendered after the content, e.g. `['Ctrl', 'K']`. */
  shortcut?: string[];
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  delayDuration?: number;
  /** Render nothing extra and just return the trigger. */
  disabled?: boolean;
  className?: string;
}

/**
 * Short, non-interactive hint shown on hover and keyboard focus, dismissed with Escape.
 * Content is wired to the trigger via aria-describedby by Radix.
 */
export function Tooltip({
  children,
  content,
  shortcut,
  side = 'top',
  align = 'center',
  sideOffset = 6,
  open,
  defaultOpen,
  onOpenChange,
  delayDuration,
  disabled,
  className,
}: TooltipProps) {
  if (disabled || content == null || content === '') return children;
  return (
    <TooltipPrimitive.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange} delayDuration={delayDuration}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={sideOffset}
          collisionPadding={8}
          className={cn(
            'z-tooltip flex max-w-[280px] select-none items-center gap-2 rounded-md bg-fg px-2 py-1 text-label text-canvas shadow-e2',
            'data-[state=delayed-open]:animate-nm-fade-in data-[state=instant-open]:animate-nm-fade-in data-[state=closed]:animate-nm-fade-out',
            className,
          )}
        >
          <span>{content}</span>
          {shortcut && shortcut.length > 0 && <Kbd keys={shortcut} size="sm" tone="inverted" />}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
