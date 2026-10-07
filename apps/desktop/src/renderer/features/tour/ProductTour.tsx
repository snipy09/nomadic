import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, cn } from '@nomadic/ui';
import type { WorkspaceMode } from '../../types';
import { CARD_WIDTH, cardPosition, tourSteps, type Rect } from './tourLogic';

interface ProductTourProps {
  workspaceMode?: WorkspaceMode;
  /** Called when the tour is finished or skipped. */
  onClose: () => void;
}

const PAD = 4;

function targetRect(target: string | undefined): Rect | null {
  if (!target) return null;
  const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
  if (!el) return null;
  el.scrollIntoView?.({ block: 'nearest' });
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
}

/**
 * Spotlight walkthrough over the app shell: dims the window, outlines one sidebar item per step and
 * explains it in a small card. Keyboard: Right/Enter next, Left back, Escape skips; focus stays in the card.
 */
export const ProductTour: React.FC<ProductTourProps> = ({ workspaceMode = 'unified', onClose }) => {
  const steps = React.useMemo(() => tourSteps(workspaceMode), [workspaceMode]);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardHeight, setCardHeight] = useState(200);
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });
  const cardRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const step = steps[index];
  const last = index === steps.length - 1;

  const measure = useCallback(() => {
    setViewport({ width: window.innerWidth, height: window.innerHeight });
    setRect(targetRect(step.target));
  }, [step.target]);

  useLayoutEffect(() => { measure(); }, [measure]);
  useLayoutEffect(() => {
    if (cardRef.current) setCardHeight(cardRef.current.offsetHeight || 200);
  }, [index, rect]);
  useEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);
  useEffect(() => { primaryRef.current?.focus(); }, [index]);

  const next = useCallback(() => (last ? onClose() : setIndex((i) => i + 1)), [last, onClose]);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
    else if (e.key === 'Tab') {
      const focusable = Array.from(cardRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? []);
      if (focusable.length === 0) return;
      const i = focusable.indexOf(document.activeElement as HTMLElement);
      const to = e.shiftKey ? (i <= 0 ? focusable.length - 1 : i - 1) : (i === focusable.length - 1 ? 0 : i + 1);
      e.preventDefault();
      focusable[to].focus();
    }
  };

  const pos = cardPosition(rect, viewport, cardHeight);
  const titleId = `tour-title-${step.id}`;
  const scrim = 'rgb(var(--nm-overlay) / var(--nm-overlay-alpha))';

  return createPortal(
    <div className="fixed inset-0 z-modal" onKeyDown={onKeyDown} data-testid="product-tour">
      {/* Catches clicks so the app underneath is not used mid-tour. */}
      <div className="absolute inset-0" style={rect ? undefined : { background: scrim }} aria-hidden="true" />
      {rect && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-lg ring-2 ring-accent motion-safe:transition-all motion-safe:duration-200"
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height, boxShadow: `0 0 0 9999px ${scrim}` }}
        />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={`${titleId}-body`}
        className={cn(
          'absolute flex flex-col gap-3 rounded-xl border border-line/70 bg-surface-raised p-4 text-fg shadow-e3',
          'motion-safe:transition-[top,left] motion-safe:duration-200',
        )}
        style={{ top: pos.top, left: pos.left, width: CARD_WIDTH }}
      >
        <div className="flex flex-col gap-1">
          <p className="text-caption text-fg-subtle">{index + 1} of {steps.length}</p>
          <h2 id={titleId} className="text-heading font-strong text-fg">{step.title}</h2>
          <p id={`${titleId}-body`} className="text-body text-fg-muted">{step.body}</p>
        </div>
        <div className="flex items-center gap-1" aria-hidden="true">
          {steps.map((s, i) => (
            <span key={s.id} className={cn('h-1.5 rounded-full', i === index ? 'w-4 bg-accent' : 'w-1.5 bg-fg/[0.15]')} />
          ))}
        </div>
        <div className="flex items-center justify-between gap-2">
          {last ? <span /> : <Button variant="ghost" size="sm" onClick={onClose}>Skip tour</Button>}
          <div className="flex gap-2">
            {index > 0 && <Button variant="secondary" size="sm" onClick={back}>Back</Button>}
            <Button ref={primaryRef} variant="primary" size="sm" onClick={next}>
              {last ? 'Finish' : index === 0 ? 'Show me around' : 'Next'}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};
