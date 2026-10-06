import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn, focusRing } from '../utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export const overlayClass = cn(
  'fixed inset-0 z-overlay bg-[rgb(var(--nm-overlay)/var(--nm-overlay-alpha))]',
  'data-[state=open]:animate-nm-fade-in data-[state=closed]:animate-nm-fade-out',
);

export function CloseButton({ className, label = 'Close' }: { className?: string; label?: string }) {
  return (
    <DialogPrimitive.Close
      aria-label={label}
      className={cn(
        'inline-flex size-7 shrink-0 items-center justify-center rounded-md text-fg-subtle transition-colors duration-fast',
        'hover:bg-surface-hover hover:text-fg',
        focusRing,
        className,
      )}
    >
      <X className="size-4" aria-hidden="true" />
    </DialogPrimitive.Close>
  );
}

const widths = { sm: 'max-w-[400px]', md: 'max-w-[520px]', lg: 'max-w-[720px]', xl: 'max-w-[960px]' };

export interface DialogContentProps
  extends Omit<React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>, 'title'> {
  /** Required accessible title, rendered as the heading. */
  title: React.ReactNode;
  description?: React.ReactNode;
  size?: keyof typeof widths;
  /** Hide the corner close button (Escape and overlay click still close unless prevented). */
  hideClose?: boolean;
  /** Visually hide the title while keeping it for assistive tech. */
  hideTitle?: boolean;
  /** Pinned footer, usually right-aligned buttons. */
  footer?: React.ReactNode;
  /** Classes for the scrolling body wrapper. */
  bodyClassName?: string;
}

/**
 * Modal dialog. Focus is trapped inside and returned to the trigger on close;
 * Escape and overlay click close it; background is inert to assistive tech.
 */
export const DialogContent = React.forwardRef<HTMLDivElement, DialogContentProps>(function DialogContent(
  { title, description, size = 'md', hideClose, hideTitle, footer, bodyClassName, className, children, ...rest },
  ref,
) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayClass} />
      <DialogPrimitive.Content
        ref={ref}
        {...(description ? {} : { 'aria-describedby': undefined })}
        className={cn(
          'fixed inset-x-0 top-[12vh] z-modal mx-auto flex max-h-[76vh] w-[calc(100%-32px)] flex-col',
          'rounded-xl border border-line bg-surface-raised text-fg shadow-e3 outline-none',
          'data-[state=open]:animate-nm-pop-in data-[state=closed]:animate-nm-pop-out',
          widths[size],
          className,
        )}
        {...rest}
      >
        {hideTitle && hideClose ? (
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
        ) : (
          <div className={cn('flex items-start gap-3 px-5 pt-4', hideTitle ? 'pb-0' : 'pb-3')}>
            <div className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
              <DialogPrimitive.Title className={cn('text-heading font-strong text-fg', hideTitle && 'sr-only')}>
                {title}
              </DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className="text-body text-fg-muted">{description}</DialogPrimitive.Description>
              )}
            </div>
            {!hideClose && <CloseButton className="-mr-2" />}
          </div>
        )}
        <div className={cn('min-h-0 flex-1 overflow-y-auto px-5 pb-5', bodyClassName)}>{children}</div>
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});

export function DialogFooter({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex shrink-0 items-center justify-end gap-2 rounded-b-xl border-t border-line bg-surface-sunken/60 px-5 py-3', className)}
      {...rest}
    />
  );
}
