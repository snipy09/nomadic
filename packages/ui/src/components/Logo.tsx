import * as React from 'react';
import { cn } from '../utils';

const MARIGOLD = '#FFC21A';

export interface LogoProps extends React.SVGProps<SVGSVGElement> {
  /** Accessible name. Pass null when the logo sits next to visible product text. */
  title?: string | null;
}

/**
 * Nomadic "N" mark: ultramarine posts (follows the theme accent) and the marigold diagonal.
 * Drawn from the brand files in apps/web.
 */
export function NomadicMark({ title = 'Nomadic', className, ...rest }: LogoProps) {
  return (
    <svg
      viewBox="20 25 88 78"
      role={title ? 'img' : undefined}
      aria-label={title ?? undefined}
      aria-hidden={title ? undefined : true}
      className={cn('h-5 w-auto shrink-0', className)}
      {...rest}
    >
      <path d="M24 29H50V99H24ZM78 29H104V99H78Z" fill="rgb(var(--nm-accent))" />
      <path d="M24 29H50L104 99H78Z" fill={MARIGOLD} />
    </svg>
  );
}

/** Full wordmark. Letters use currentColor so it adapts to light and dark surfaces. */
export function NomadicLogo({ title = 'Nomadic', className, ...rest }: LogoProps) {
  return (
    <svg
      viewBox="18 23 456 82"
      role={title ? 'img' : undefined}
      aria-label={title ?? undefined}
      aria-hidden={title ? undefined : true}
      className={cn('h-5 w-auto shrink-0 text-fg', className)}
      {...rest}
    >
      <path d="M24 29H50V99H24ZM78 29H104V99H78Z" fill="rgb(var(--nm-accent))" />
      <path d="M24 29H50L104 99H78Z" fill={MARIGOLD} />
      <g transform="translate(128 99)" fill="none" stroke="currentColor" strokeWidth="14">
        <path d="M7 0V-44M37 0V-22A15 15 0 0 0 7 -22" />
        <circle cx="72" cy="-22" r="15" />
        <path d="M107 0V-44M137 0V-22A15 15 0 0 0 107 -22M167 0V-22A15 15 0 0 0 137 -22" />
        <circle cx="202" cy="-22" r="15" />
        <path d="M217 0V-44" />
        <circle cx="252" cy="-22" r="15" />
        <path d="M267 0V-70" />
        <path d="M288 0V-44" />
        <path d="M335.15 -32.04A15 15 0 1 0 335.15 -11.96" />
        <circle cx="288" cy="-59" r="8" fill={MARIGOLD} stroke="none" />
      </g>
    </svg>
  );
}
