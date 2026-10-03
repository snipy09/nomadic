import * as React from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { cn, focusRing } from '../utils';

type Density = 'compact' | 'default';
const DensityContext = React.createContext<Density>('default');

export interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  density?: Density;
  /** Keep the header visible while the container scrolls. */
  stickyHeader?: boolean;
  /** Classes for the scroll container. */
  containerClassName?: string;
  /** Remove the outer border/radius (e.g. inside a Card). */
  bare?: boolean;
}

/** Data table. Wrap rows in TableHeader/TableBody; use TableHead `sort` for sortable columns. */
export const Table = React.forwardRef<HTMLTableElement, TableProps>(function Table(
  { density = 'default', stickyHeader, containerClassName, bare, className, ...rest },
  ref,
) {
  return (
    <DensityContext.Provider value={density}>
      <div
        className={cn(
          'relative w-full overflow-auto',
          !bare && 'rounded-lg border border-line bg-surface',
          containerClassName,
        )}
        data-sticky={stickyHeader || undefined}
      >
        <table
          ref={ref}
          className={cn(
            'w-full border-separate border-spacing-0 text-left text-body text-fg',
            stickyHeader && '[&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-sticky',
            className,
          )}
          {...rest}
        />
      </div>
    </DensityContext.Provider>
  );
});

export const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  function TableHeader({ className, ...rest }, ref) {
    return <thead ref={ref} className={cn(className)} {...rest} />;
  },
);

export const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  function TableBody({ className, ...rest }, ref) {
    return <tbody ref={ref} className={cn('[&>tr:last-child>td]:border-b-0', className)} {...rest} />;
  },
);

export interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  selected?: boolean;
  /** Hover style + pointer affordance for clickable rows. */
  interactive?: boolean;
}

export const TableRow = React.forwardRef<HTMLTableRowElement, TableRowProps>(function TableRow(
  { selected, interactive, className, ...rest },
  ref,
) {
  return (
    <tr
      ref={ref}
      aria-selected={selected}
      data-selected={selected || undefined}
      className={cn(
        'transition-colors duration-fast',
        interactive && cn('hover:bg-surface-hover', focusRing, 'focus-visible:-outline-offset-2'),
        selected && 'bg-accent-subtle/60 hover:bg-accent-subtle',
        className,
      )}
      {...rest}
    />
  );
});

export type SortDirection = 'asc' | 'desc' | false;

export interface TableHeadProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  /** Current sort for this column. Pass `false` for sortable-but-unsorted; omit for not sortable. */
  sort?: SortDirection;
  onSort?: () => void;
  align?: 'left' | 'right' | 'center';
}

export const TableHead = React.forwardRef<HTMLTableCellElement, TableHeadProps>(function TableHead(
  { sort, onSort, align = 'left', className, children, ...rest },
  ref,
) {
  const density = React.useContext(DensityContext);
  const sortable = sort !== undefined;
  const ariaSort = sort === 'asc' ? 'ascending' : sort === 'desc' ? 'descending' : sortable ? 'none' : undefined;
  const SortIcon = sort === 'asc' ? ArrowUp : sort === 'desc' ? ArrowDown : ChevronsUpDown;
  return (
    <th
      ref={ref}
      scope="col"
      aria-sort={ariaSort}
      className={cn(
        'whitespace-nowrap border-b border-line bg-surface-sunken text-label font-strong text-fg-muted',
        density === 'compact' ? 'h-7 px-2.5' : 'h-8 px-3',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
      {...rest}
    >
      {sortable ? (
        <button
          type="button"
          onClick={onSort}
          className={cn(
            '-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-fg',
            sort && 'text-fg',
            align === 'right' && 'flex-row-reverse',
            focusRing,
          )}
        >
          {children}
          <SortIcon className={cn('size-3.5', !sort && 'opacity-50')} aria-hidden="true" />
        </button>
      ) : (
        children
      )}
    </th>
  );
});

export interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  align?: 'left' | 'right' | 'center';
  /** Muted secondary text. */
  muted?: boolean;
}

export const TableCell = React.forwardRef<HTMLTableCellElement, TableCellProps>(function TableCell(
  { align = 'left', muted, className, ...rest },
  ref,
) {
  const density = React.useContext(DensityContext);
  return (
    <td
      ref={ref}
      className={cn(
        'border-b border-line align-middle',
        density === 'compact' ? 'h-8 px-2.5' : 'h-10 px-3',
        align === 'right' && 'text-right tabular-nums',
        align === 'center' && 'text-center',
        muted && 'text-fg-muted',
        className,
      )}
      {...rest}
    />
  );
});
