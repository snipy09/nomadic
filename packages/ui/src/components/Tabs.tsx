import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn, focusRing } from '../utils';

type TabsVariant = 'underline' | 'segmented';
const VariantContext = React.createContext<TabsVariant>('underline');

export interface TabsProps extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root> {
  /** `underline` (drawn as Apple-style capsule filters) for page sections, `segmented` (Apple segmented control) for view switches. */
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
          variant === 'underline' && 'gap-1',
          variant === 'segmented' && 'inline-flex w-fit gap-0.5 rounded-[9px] bg-fg/[0.06] p-0.5',
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
          'h-7 rounded-full px-3 font-regular hover:bg-fg/[0.05] data-[state=active]:bg-fg/[0.08] data-[state=active]:font-strong data-[state=active]:text-fg',
        variant === 'segmented' &&
          'h-7 rounded-[7px] px-3 data-[state=active]:bg-surface-raised data-[state=active]:text-fg data-[state=active]:shadow-[0_1px_3px_rgb(0_0_0/0.12),0_0_0_0.5px_rgb(0_0_0/0.05)]',
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
      {count != null && (
        <span className="rounded-full bg-fg/[0.07] px-1.5 text-caption font-regular tabular-nums text-fg-muted group-data-[state=active]:bg-accent group-data-[state=active]:text-accent-fg">
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
