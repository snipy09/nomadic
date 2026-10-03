import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn, focusRing } from '../utils';

type TabsVariant = 'underline' | 'segmented';
const VariantContext = React.createContext<TabsVariant>('underline');

export interface TabsProps extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root> {
  /** `underline` for page sections, `segmented` for compact view switches. */
  variant?: TabsVariant;
}

/**
 * Tabs (Radix). Arrow keys move between tabs (automatic activation by default;
 * pass `activationMode="manual"` to require Enter/Space), Home/End jump.
 */
export const Tabs = React.forwardRef<HTMLDivElement, TabsProps>(function Tabs({ variant = 'underline', className, ...rest }, ref) {
  return (
    <VariantContext.Provider value={variant}>
      <TabsPrimitive.Root ref={ref} className={cn('flex flex-col', className)} {...rest} />
    </VariantContext.Provider>
  );
});

export const TabsList = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>>(
  function TabsList({ className, ...rest }, ref) {
    const variant = React.useContext(VariantContext);
    return (
      <TabsPrimitive.List
        ref={ref}
        className={cn(
          'flex shrink-0 items-center',
          variant === 'underline' && 'gap-4 border-b border-line',
          variant === 'segmented' && 'inline-flex w-fit gap-0.5 rounded-md bg-surface-sunken p-0.5 ring-1 ring-inset ring-line',
          className,
        )}
        {...rest}
      />
    );
  },
);

export interface TabsTriggerProps extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> {
  icon?: React.ReactNode;
  /** Small count after the label. */
  count?: number;
}

export const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(function TabsTrigger(
  { className, icon, count, children, ...rest },
  ref,
) {
  const variant = React.useContext(VariantContext);
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        'group relative inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap text-body font-strong text-fg-muted',
        'transition-colors duration-fast ease-standard hover:text-fg disabled:pointer-events-none disabled:opacity-50',
        '[&_svg]:size-4 [&_svg]:shrink-0',
        focusRing,
        variant === 'underline' &&
          'h-9 rounded-sm px-0.5 data-[state=active]:text-fg after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-transparent after:transition-colors after:duration-fast data-[state=active]:after:bg-accent',
        variant === 'segmented' &&
          'h-7 rounded px-3 data-[state=active]:bg-surface data-[state=active]:text-fg data-[state=active]:shadow-e1',
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
      {count != null && (
        <span className="rounded bg-surface-active px-1.5 text-caption font-regular tabular-nums text-fg-muted group-data-[state=active]:bg-accent-subtle group-data-[state=active]:text-accent-subtle-fg">
          {count}
        </span>
      )}
    </TabsPrimitive.Trigger>
  );
});

export const TabsContent = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>>(
  function TabsContent({ className, ...rest }, ref) {
    return <TabsPrimitive.Content ref={ref} className={cn('pt-4', focusRing, 'focus-visible:outline-offset-4 rounded-sm', className)} {...rest} />;
  },
);
