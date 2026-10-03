import * as React from 'react';
import { cn } from '../utils';

/** Gap steps on the 4 / 8 pt grid (Tailwind spacing units). Static map so Tailwind sees every class. */
const gaps = {
  0: 'gap-0',
  0.5: 'gap-0.5',
  1: 'gap-1',
  1.5: 'gap-1.5',
  2: 'gap-2',
  3: 'gap-3',
  4: 'gap-4',
  5: 'gap-5',
  6: 'gap-6',
  8: 'gap-8',
  10: 'gap-10',
  12: 'gap-12',
  16: 'gap-16',
} as const;

const aligns = { start: 'items-start', center: 'items-center', end: 'items-end', stretch: 'items-stretch', baseline: 'items-baseline' };
const justifies = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
  around: 'justify-around',
};

export type StackGap = keyof typeof gaps;

export interface StackProps extends React.HTMLAttributes<HTMLElement> {
  direction?: 'row' | 'column';
  gap?: StackGap;
  align?: keyof typeof aligns;
  justify?: keyof typeof justifies;
  wrap?: boolean;
  /** Element to render. Default div. */
  as?: React.ElementType;
}

/** Flex layout on the spacing grid. */
export const Stack = React.forwardRef<HTMLElement, StackProps>(function Stack(
  { direction = 'column', gap = 2, align, justify, wrap, as: Comp = 'div', className, ...rest },
  ref,
) {
  return (
    <Comp
      ref={ref}
      className={cn(
        'flex',
        direction === 'row' ? 'flex-row' : 'flex-col',
        gaps[gap],
        align && aligns[align],
        justify && justifies[justify],
        wrap && 'flex-wrap',
        className,
      )}
      {...rest}
    />
  );
});

export const HStack = React.forwardRef<HTMLElement, Omit<StackProps, 'direction'>>(function HStack({ align = 'center', ...rest }, ref) {
  return <Stack ref={ref} direction="row" align={align} {...rest} />;
});

export const VStack = React.forwardRef<HTMLElement, Omit<StackProps, 'direction'>>(function VStack(props, ref) {
  return <Stack ref={ref} direction="column" {...props} />;
});
