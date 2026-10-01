import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** useLayoutEffect warns when the page is rendered to a string at build time. */
export const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function usePrefersReducedMotion() {
  // Starts false so the first client render matches the prerendered HTML. The effect corrects it.
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

/**
 * Marks an element `data-seen` the first time it scrolls into view. The CSS for `[data-reveal]`
 * does the animating, and the attribute is written straight to the DOM so nothing re-renders.
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || el.hasAttribute('data-seen')) return;
    if (!('IntersectionObserver' in window) || prefersReducedMotion()) {
      el.setAttribute('data-seen', '');
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.setAttribute('data-seen', '');
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return ref;
}

/** Fills the bar under the header as the page scrolls. Writes to the DOM directly, never re-rendering. */
export function useScrollProgress() {
  const bar = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let frame = 0;

    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const progress = max > 0 ? Math.min(Math.max(window.scrollY / max, 0), 1) : 0;
      bar.current?.style.setProperty('--progress', progress.toFixed(4));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return bar;
}

/** Id of the section the reader is in, for highlighting the matching nav link. */
export function useScrollSpy(ids: string[]) {
  const [active, setActive] = useState<string | null>(null);
  const key = ids.join('|');

  useEffect(() => {
    const targets = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
    if (!targets.length || !('IntersectionObserver' in window)) return;

    const visible = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.set(entry.target.id, entry.intersectionRatio);
          else visible.delete(entry.target.id);
        }
        // Several sections can overlap the band at once. The first in page order wins.
        const current = ids.find((id) => visible.has(id)) ?? null;
        setActive(current);
      },
      // A thin band across the upper-middle of the screen: whichever section crosses it is "current".
      { rootMargin: '-35% 0px -60% 0px' },
    );
    targets.forEach((el) => io.observe(el));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return active;
}

/** True once the element has scrolled into view. Never goes back to false. */
export function useInView<T extends Element>(threshold = 0.3) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!('IntersectionObserver' in window)) {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);

  return [ref, seen] as const;
}

/**
 * Drives the route line down the left edge of a section.
 * Writes straight to the DOM on scroll so the page never re-renders while scrolling.
 */
export function useRouteProgress() {
  const area = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLSpanElement>(null);
  const stop = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let frame = 0;

    const update = () => {
      frame = 0;
      const el = area.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const readingLine = window.innerHeight * 0.55;
      const filled = Math.min(Math.max(readingLine - rect.top, 0), rect.height);
      fill.current?.style.setProperty('--fill', `${filled}px`);
      stop.current?.setAttribute('data-reached', String(rect.top < readingLine));
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return { area, fill, stop };
}

/** Scrolls to a section by id, from an in-page link. */
export function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return false;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return true;
}
