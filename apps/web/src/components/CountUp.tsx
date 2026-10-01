import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion, useIsoLayoutEffect } from '../hooks';

interface CountUpProps {
  to: number;
  duration?: number;
  className?: string;
}

/** Counts up to `to` when it scrolls into view. The prerendered HTML already holds the final number. */
export default function CountUp({ to, duration = 900, className }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(to);

  // Before paint, so the final number never flashes before the count starts from zero.
  useIsoLayoutEffect(() => {
    if (prefersReducedMotion() || !('IntersectionObserver' in window)) return;
    setValue(0);
  }, [to]);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || !('IntersectionObserver' in window)) return;

    let frame = 0;
    const run = () => {
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min((now - start) / duration, 1);
        setValue(Math.round(to * (1 - Math.pow(1 - t, 3))));
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          io.disconnect();
          run();
        }
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [to, duration]);

  return (
    <span ref={ref} className={className}>
      {value}
    </span>
  );
}
