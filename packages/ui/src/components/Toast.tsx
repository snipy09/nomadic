import * as React from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { cn, focusRing } from '../utils';
import { Spinner } from './Spinner';

export type ToastTone = 'neutral' | 'success' | 'warning' | 'danger' | 'loading';

export interface ToastOptions {
  title: React.ReactNode;
  description?: React.ReactNode;
  tone?: ToastTone;
  /** ms before auto-dismiss. Default 5000; `Infinity` keeps it until dismissed. */
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
    /** Describes how to do the action without the toast, for screen readers. Defaults to label. */
    altText?: string;
  };
  /** Reuse an id to update an existing toast in place (e.g. loading → success). */
  id?: string;
}

interface ToastItem extends ToastOptions {
  id: string;
  open: boolean;
}

export interface ToastApi {
  toast: (options: ToastOptions) => string;
  dismiss: (id?: string) => void;
}

const ToastContext = React.createContext<ToastApi | null>(null);

/** Imperative toast API. Must be used inside ToastProvider (or UIProvider). */
export function useToast(): ToastApi {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider> or <UIProvider>');
  return ctx;
}

const icons: Record<ToastTone, React.ReactNode> = {
  neutral: <Info className="size-4 text-fg-subtle" aria-hidden="true" />,
  success: <CheckCircle2 className="size-4 text-success" aria-hidden="true" />,
  warning: <AlertTriangle className="size-4 text-warning" aria-hidden="true" />,
  danger: <AlertCircle className="size-4 text-danger" aria-hidden="true" />,
  loading: <Spinner size="md" label={null} className="text-fg-subtle" />,
};

export interface ToastProviderProps {
  children: React.ReactNode;
  /** Max toasts visible at once; older ones are dismissed. */
  limit?: number;
  /** Default duration in ms. */
  duration?: number;
  /** Screen-reader label for the region. `{hotkey}` is replaced with the shortcut. */
  label?: string;
}

let counter = 0;

/**
 * Toast region (Radix). Toasts are announced politely (assertively for danger),
 * pause on hover/focus, can be swiped right, and F8 moves focus to the region.
 */
export function ToastProvider({ children, limit = 3, duration = 5000, label = 'Notifications ({hotkey})' }: ToastProviderProps) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const timers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());

  // Closed toasts stay mounted briefly so the exit animation can play, then are removed.
  React.useEffect(() => {
    for (const t of items) {
      if (!t.open && !timers.current.has(t.id)) {
        timers.current.set(
          t.id,
          setTimeout(() => {
            timers.current.delete(t.id);
            setItems((list) => list.filter((x) => x.id !== t.id || x.open));
          }, 240),
        );
      }
    }
  }, [items]);

  const close = React.useCallback((id?: string) => {
    setItems((list) => list.map((t) => (id === undefined || t.id === id ? { ...t, open: false } : t)));
  }, []);

  const toast = React.useCallback(
    (options: ToastOptions) => {
      const id = options.id ?? `nm-toast-${++counter}`;
      const pending = timers.current.get(id);
      if (pending) {
        clearTimeout(pending);
        timers.current.delete(id);
      }
      setItems((list) => {
        const existing = list.find((t) => t.id === id);
        if (existing) return list.map((t) => (t.id === id ? { ...t, ...options, id, open: true } : t));
        const next = [...list, { ...options, id, open: true }];
        const openCount = next.filter((t) => t.open).length;
        if (openCount > limit) {
          let toClose = openCount - limit;
          return next.map((t) => (t.open && toClose-- > 0 ? { ...t, open: false } : t));
        }
        return next;
      });
      return id;
    },
    [limit],
  );

  React.useEffect(() => {
    const map = timers.current;
    return () => map.forEach(clearTimeout);
  }, []);

  const api = React.useMemo<ToastApi>(() => ({ toast, dismiss: close }), [toast, close]);

  return (
    <ToastContext.Provider value={api}>
      <ToastPrimitive.Provider duration={duration} swipeDirection="right" label={label}>
        {children}
        {items.map((t) => {
          const tone = t.tone ?? 'neutral';
          return (
            <ToastPrimitive.Root
              key={t.id}
              open={t.open}
              onOpenChange={(open) => {
                if (!open) close(t.id);
              }}
              duration={tone === 'loading' ? Infinity : t.duration}
              type={tone === 'danger' ? 'foreground' : 'background'}
              data-tone={tone}
              className={cn(
                'group pointer-events-auto relative flex w-full items-start gap-3 rounded-lg border border-line bg-surface-raised p-3 pr-9 text-fg shadow-e2',
                'data-[state=open]:animate-nm-toast-in data-[state=closed]:animate-nm-toast-out',
                'data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=cancel]:translate-x-0 data-[swipe=cancel]:transition-transform',
                'data-[swipe=end]:animate-nm-fade-out',
              )}
            >
              <span className="flex h-5 shrink-0 items-center">{icons[tone]}</span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <ToastPrimitive.Title className="text-body font-strong text-fg">{t.title}</ToastPrimitive.Title>
                {t.description && (
                  <ToastPrimitive.Description className="text-body text-fg-muted">{t.description}</ToastPrimitive.Description>
                )}
                {t.action && (
                  <ToastPrimitive.Action
                    altText={t.action.altText ?? t.action.label}
                    onClick={t.action.onClick}
                    className={cn(
                      'mt-1.5 inline-flex h-ctl-sm w-fit items-center rounded-md border border-line-strong bg-surface px-2.5 text-label font-strong text-fg',
                      'transition-colors duration-fast hover:bg-surface-hover',
                      focusRing,
                    )}
                  >
                    {t.action.label}
                  </ToastPrimitive.Action>
                )}
              </div>
              <ToastPrimitive.Close
                aria-label="Dismiss notification"
                className={cn(
                  'absolute right-2 top-2 inline-flex size-6 items-center justify-center rounded text-fg-subtle',
                  'transition-colors duration-fast hover:bg-surface-hover hover:text-fg',
                  focusRing,
                )}
              >
                <X className="size-3.5" aria-hidden="true" />
              </ToastPrimitive.Close>
            </ToastPrimitive.Root>
          );
        })}
        <ToastPrimitive.Viewport className="fixed bottom-0 right-0 z-toast m-0 flex w-[380px] max-w-[100vw] list-none flex-col gap-2 p-4 outline-none" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}
