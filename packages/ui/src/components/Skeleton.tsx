import * as React from 'react';
import { cn } from '../utils';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: number | string;
  height?: number | string;
  radius?: 'sm' | 'md' | 'lg' | 'full';
}

const radii = { sm: 'rounded', md: 'rounded-md', lg: 'rounded-lg', full: 'rounded-full' };

/**
 * Placeholder block for loading content. Decorative (aria-hidden); mark the
 * loading region with aria-busy="true". Shimmer stops under reduced motion.
 */
export function Skeleton({ width, height = 12, radius = 'sm', className, style, ...rest }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'shrink-0 bg-surface-active',
        'bg-[linear-gradient(90deg,transparent_0%,rgb(var(--nm-surface-hover))_50%,transparent_100%)] bg-[length:200%_100%] bg-no-repeat',
        'animate-nm-shimmer motion-reduce:animate-none motion-reduce:bg-none',
        radii[radius],
        className,
      )}
      style={{ width, height, ...style }}
      {...rest}
    />
  );
}

export interface SkeletonTextProps extends React.HTMLAttributes<HTMLDivElement> {
  lines?: number;
  /** Width of the last line. */
  lastLineWidth?: string;
  lineHeight?: number;
}

export function SkeletonText({ lines = 3, lastLineWidth = '60%', lineHeight = 10, className, ...rest }: SkeletonTextProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)} aria-hidden="true" {...rest}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} height={lineHeight} width={i === lines - 1 && lines > 1 ? lastLineWidth : '100%'} />
      ))}
    </div>
  );
}
