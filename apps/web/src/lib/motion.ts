import { useEffect, useRef, useState } from 'react';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Adds `is-in` to the element once it scrolls into view (see `.reveal` in index.css). */
export function useReveal<T extends HTMLElement>(threshold = 0.15) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
      el.classList.add('is-in');
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('is-in');
          io.disconnect();
        }
      },
      { threshold, rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return ref;
}

/**
 * Writes scroll progress (0 → 1) through the element to the `--p` CSS variable,
 * without re-rendering. With start 'enter': 0 = element top hits the viewport
 * bottom, 1 = element centre reaches the viewport centre. With 'top': 0 = element
 * top hits the viewport top, 1 = element bottom hits the viewport bottom.
 */
export function useScrollProgress<T extends HTMLElement>(
  opts: { start?: 'enter' | 'top'; onChange?: (p: number) => void } = {},
) {
  const ref = useRef<T>(null);
  const onChange = useRef(opts.onChange);
  onChange.current = opts.onChange;
  const start = opts.start ?? 'enter';

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      el.style.setProperty('--p', '1');
      onChange.current?.(1);
      return;
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const total = start === 'top' ? rect.height - vh : (vh + rect.height) / 2;
      const travelled = start === 'top' ? -rect.top : vh - rect.top;
      const p = Math.min(1, Math.max(0, travelled / Math.max(1, total)));
      el.style.setProperty('--p', p.toFixed(4));
      onChange.current?.(p);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [start]);

  return ref;
}

/** Counts from 0 to `to` with an ease-out curve once the element is visible. */
export function useCountUp(to: number, duration = 1600) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(to);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || !('IntersectionObserver' in window)) return;
    setValue(0);
    let raf = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        const t0 = performance.now();
        const tick = (t: number) => {
          const k = Math.min(1, (t - t0) / duration);
          setValue(Math.round(to * (1 - Math.pow(1 - k, 4))));
          if (k < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [to, duration]);

  return { ref, value };
}
