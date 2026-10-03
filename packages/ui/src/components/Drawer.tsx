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
  side?: 'right' | 'left';
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
          'fixed inset-y-0 z-modal flex w-full flex-col bg-surface-raised text-fg shadow-e3 outline-none',
          side === 'right'
            ? 'right-0 border-l border-line data-[state=open]:animate-nm-drawer-in-right data-[state=closed]:animate-nm-drawer-out-right'
            : 'left-0 border-r border-line data-[state=open]:animate-nm-drawer-in-left data-[state=closed]:animate-nm-drawer-out-left',
          widths[size],
          className,
        )}
        {...rest}
      >
        <div className="flex shrink-0 flex-col gap-3 border-b border-line px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
              <DialogPrimitive.Title className="text-heading font-strong text-fg">{title}</DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className="text-body text-fg-muted">{description}</DialogPrimitive.Description>
              )}
            </div>
            <CloseButton className="-mr-2" />
          </div>
          {headerExtra}
        </div>
        <div className={cn('min-h-0 flex-1 overflow-y-auto px-5 py-4', bodyClassName)}>{children}</div>
        {footer && <DialogFooter className="rounded-none">{footer}</DialogFooter>}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});

export { DialogFooter as DrawerFooter };
