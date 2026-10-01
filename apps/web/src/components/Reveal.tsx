import { createElement, CSSProperties, ReactNode } from 'react';
import { useReveal } from '../hooks';

type Kind = 'line' | 'up' | 'fade' | 'bar' | 'rule';

interface RevealProps {
  /** line: a heading rises out of a mask. up: a short rise with a fade. fade: opacity only.
   *  bar: grows from the left to `--to`. rule: a border line draws in from the left. */
  kind?: Kind;
  as?: string;
  /** Milliseconds to wait once it is in view. Use it to stagger siblings. */
  delay?: number;
  id?: string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

/**
 * Plays its entrance the first time it scrolls into view. Content is always in the HTML:
 * without scripts, or with reduced motion, it simply shows.
 */
export default function Reveal({
  kind = 'up',
  as = 'div',
  delay = 0,
  id,
  className,
  style,
  children,
}: RevealProps) {
  const ref = useReveal<HTMLElement>();
  const inner = kind === 'line' ? <span className="block">{children}</span> : children;

  return createElement(
    as,
    {
      ref,
      id,
      className,
      'data-reveal': kind,
      style: { ...style, '--d': `${delay}ms` } as CSSProperties,
    },
    inner,
  );
}
