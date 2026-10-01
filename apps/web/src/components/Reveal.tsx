import React from 'react';
import { useReveal } from '../lib/motion';

type Props = {
  as?: keyof JSX.IntrinsicElements;
  delay?: number;
  scale?: boolean;
  className?: string;
  children: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, 'className' | 'children'>;

/** Fades and lifts its children in when they scroll into view. */
export function Reveal({ as = 'div', delay = 0, scale, className = '', style, children, ...rest }: Props) {
  const ref = useReveal<HTMLElement>();
  const Tag = as as React.ElementType;
  return (
    <Tag
      ref={ref}
      className={`reveal ${scale ? 'reveal-scale' : ''} ${className}`}
      style={{ ...style, ['--d' as string]: `${delay}ms` }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/** Splits text into words that rise in one after another (hero headlines). */
export function RiseText({ text, startIndex = 0, wordClassName }: { text: string; startIndex?: number; wordClassName?: string }) {
  return (
    <span className="rise">
      {text.split(' ').map((w, i) => (
        <span key={i} style={{ ['--i' as string]: i + startIndex }}>
          {/* gradient text must sit on the word itself: background-clip can't reach transformed children */}
          <span className={wordClassName}>{w}</span>
          {'\u00a0'}
        </span>
      ))}
    </span>
  );
}
