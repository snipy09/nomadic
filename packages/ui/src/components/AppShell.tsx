import * as React from 'react';
import { cn, focusRing } from '../utils';
import { Tooltip } from './Tooltip';

export interface AppShellProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Left navigation column. */
  sidebar?: React.ReactNode;
  /** Top bar inside the content column (title, search, actions). */
  topbar?: React.ReactNode;
  /** Collapse the sidebar to an icon rail. NavItems read this to hide labels. */
  sidebarCollapsed?: boolean;
  sidebarWidth?: number;
  collapsedWidth?: number;
  /** Label for the skip link (first tab stop). */
  skipLinkLabel?: string;
  mainClassName?: string;
  mainId?: string;
}

const ShellContext = React.createContext<{ collapsed: boolean }>({ collapsed: false });
export const useAppShell = () => React.useContext(ShellContext);

/**
 * Desktop app frame: sidebar + top bar + scrolling main region, with a skip link
 * and landmark roles. Fills its parent; give the parent a height (e.g. h-screen).
 */
export function AppShell({
  sidebar,
  topbar,
  sidebarCollapsed = false,
  sidebarWidth = 232,
  collapsedWidth = 56,
  skipLinkLabel = 'Skip to content',
  mainClassName,
  mainId = 'nm-main',
  className,
  children,
  ...rest
}: AppShellProps) {
  const ctx = React.useMemo(() => ({ collapsed: sidebarCollapsed }), [sidebarCollapsed]);
  return (
    <ShellContext.Provider value={ctx}>
      <div className={cn('nm-root flex h-full min-h-0 w-full overflow-hidden bg-canvas text-fg', className)} {...rest}>
        <a
          href={`#${mainId}`}
          className={cn(
            'sr-only z-tooltip rounded-md bg-surface-raised px-3 py-2 text-body font-strong text-fg shadow-e2',
            'focus:not-sr-only focus:fixed focus:left-3 focus:top-3',
            focusRing,
          )}
        >
          {skipLinkLabel}
        </a>
        {sidebar && (
          <nav
            aria-label="Main"
            data-collapsed={sidebarCollapsed || undefined}
            className="flex shrink-0 flex-col overflow-hidden border-r border-line bg-surface transition-[width] duration-base ease-standard"
            style={{ width: sidebarCollapsed ? collapsedWidth : sidebarWidth }}
          >
            {sidebar}
          </nav>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          {topbar && (
            <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-surface px-4">{topbar}</header>
          )}
          <main id={mainId} tabIndex={-1} className={cn('min-h-0 flex-1 overflow-auto outline-none', mainClassName)}>
            {children}
          </main>
        </div>
      </div>
    </ShellContext.Provider>
  );
}

export interface NavSectionProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
}

/** Group of NavItems with an optional small heading. */
export function NavSection({ title, className, children, ...rest }: NavSectionProps) {
  const { collapsed } = useAppShell();
  const headingId = React.useId();
  return (
    <div role="group" aria-labelledby={title ? headingId : undefined} className={cn('flex flex-col gap-px', className)} {...rest}>
      {title && (
        <div
          id={headingId}
          className={cn('px-2.5 pb-1 pt-3 text-caption font-strong text-fg-subtle', collapsed && 'sr-only')}
        >
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

export interface NavItemProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon?: React.ReactNode;
  label: string;
  active?: boolean;
  /** Trailing count or badge. */
  trailing?: React.ReactNode;
  /** Shortcut shown in the tooltip when collapsed. */
  shortcut?: string[];
}

/** Sidebar navigation button. Sets aria-current="page" when active; shows a tooltip when collapsed. */
export const NavItem = React.forwardRef<HTMLButtonElement, NavItemProps>(function NavItem(
  { icon, label, active, trailing, shortcut, className, type, ...rest },
  ref,
) {
  const { collapsed } = useAppShell();
  const button = (
    <button
      ref={ref}
      type={type ?? 'button'}
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? label : undefined}
      className={cn(
        'group relative flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-body text-fg-muted',
        'transition-colors duration-fast ease-standard hover:bg-surface-hover hover:text-fg',
        '[&_svg]:size-4 [&_svg]:shrink-0',
        active && 'bg-surface-active font-strong text-fg hover:bg-surface-active',
        collapsed && 'justify-center px-0',
        focusRing,
        className,
      )}
      {...rest}
    >
      {active && <span className="absolute -left-2 top-1.5 h-5 w-0.5 rounded-full bg-accent" aria-hidden="true" />}
      {icon && <span className={cn('flex', active ? 'text-accent' : 'text-fg-subtle group-hover:text-fg-muted')}>{icon}</span>}
      {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
      {!collapsed && trailing}
    </button>
  );
  return (
    <Tooltip content={label} shortcut={shortcut} side="right" disabled={!collapsed}>
      {button}
    </Tooltip>
  );
});
