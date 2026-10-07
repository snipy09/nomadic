import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '../utils';
import { CloseButton, DialogFooter, overlayClass } from './Dialog';

export const Drawer = DialogPrimitive.Root;
export const DrawerTrigger = DialogPrimitive.Trigger;
export const DrawerClose = DialogPrimitive.Close;

const widths = { sm: 'max-w-[360px]', md: 'max-w-[440px]', lg: 'max-w-[600px]', xl: 'max-w-[800px]' };

export interface DrawerContentProps
  extends Omit<React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>, 'title'> {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** 'bottom' is a phone bottom sheet (full width, up to 90% of the screen). */
  side?: 'right' | 'left' | 'bottom';
  size?: keyof typeof widths;
  footer?: React.ReactNode;
  /** Extra header content under the title (tabs, meta). */
  headerExtra?: React.ReactNode;
  /** Render without the dimming overlay (still modal for focus). */
  hideOverlay?: boolean;
  bodyClassName?: string;
}

/** Side sheet for detail views and review flows. Same focus/escape behaviour as Dialog. */
export const DrawerContent = React.forwardRef<HTMLDivElement, DrawerContentProps>(function DrawerContent(
  { title, description, side = 'right', size = 'md', footer, headerExtra, hideOverlay, bodyClassName, className, children, ...rest },
  ref,
) {
  return (
    <DialogPrimitive.Portal>
      {!hideOverlay && <DialogPrimitive.Overlay className={overlayClass} />}
      <DialogPrimitive.Content
        ref={ref}
        {...(description ? {} : { 'aria-describedby': undefined })}
        className={cn(
          // A floating inspector panel with rounded corners, inset from the window edge (macOS sheet style).
          'fixed inset-y-2 z-modal flex w-[calc(100%-1rem)] flex-col overflow-hidden rounded-xl border border-line/70 bg-surface-raised text-fg shadow-e3 outline-none',
          side === 'right'
            ? 'right-2 data-[state=open]:animate-nm-drawer-in-right data-[state=closed]:animate-nm-drawer-out-right'
            : side === 'left'
              ? 'left-2 data-[state=open]:animate-nm-drawer-in-left data-[state=closed]:animate-nm-drawer-out-left'
              : 'inset-x-0 bottom-0 top-auto max-h-[90dvh] w-full rounded-b-none rounded-t-2xl border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)] data-[state=open]:animate-nm-sheet-in data-[state=closed]:animate-nm-sheet-out',
          side === 'bottom' ? 'max-w-none' : widths[size],
          className,
        )}
        {...rest}
      >
        <div className="flex shrink-0 flex-col gap-3 border-b border-line/70 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
              <DialogPrimitive.Title className="text-title font-bold text-fg">{title}</DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className="text-body text-fg-muted">{description}</DialogPrimitive.Description>
              )}
            </div>
            <CloseButton className="-mr-2" />
          </div>
          {headerExtra}
        </div>
        <div className={cn('min-h-0 flex-1 overflow-y-auto px-5 py-4', bodyClassName)}>{children}</div>
        {footer && <DialogFooter className="rounded-none border-t border-line/70 py-3">{footer}</DialogFooter>}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});

export { DialogFooter as DrawerFooter };
