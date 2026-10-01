import { ReactNode } from 'react';
import { useRouteProgress } from '../hooks';

interface RouteSectionProps {
  id: string;
  step: number;
  title: string;
  intro: ReactNode;
  first?: boolean;
  children: ReactNode;
}

/**
 * One stop on the route that runs down the page. The four stops are an actual
 * sequence (learn, find, apply, track), so the numbers earn their place.
 */
export default function RouteSection({ id, step, title, intro, first, children }: RouteSectionProps) {
  const { area, fill, stop } = useRouteProgress();
  const lineTop = first ? 'top-20 md:top-28' : 'top-0';

  return (
    <section id={id} aria-labelledby={`${id}-title`} className="bg-fog">
      <div ref={area} className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28">
        <span
          aria-hidden
          className={`absolute bottom-0 left-[31px] w-0.5 bg-rule sm:left-[39px] ${lineTop}`}
        />
        <span
          ref={fill}
          aria-hidden
          className={`route-fill absolute left-[31px] w-0.5 bg-ultra sm:left-[39px] ${lineTop}`}
        />
        <span
          ref={stop}
          aria-hidden
          data-reached="false"
          className="route-stop nums absolute left-4 top-20 z-10 grid h-8 w-8 place-items-center border-2 border-ink text-sm font-bold sm:left-6 md:top-28"
        >
          {step}
        </span>

        <div className="pl-12 md:pl-20">
          <h2 id={`${id}-title`} className="wide max-w-3xl text-[clamp(1.75rem,4.6vw,3.5rem)]">
            {title}
          </h2>
          <p className="mt-5 max-w-2xl text-lg text-ink-soft">{intro}</p>
          <div className="mt-10 md:mt-12">{children}</div>
        </div>
      </div>
    </section>
  );
}
