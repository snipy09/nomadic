import React from 'react';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { Link } from '../lib/router';
import { useScrollProgress, useReveal, useCountUp } from '../lib/motion';
import { RiseText, Reveal } from '../components/Reveal';
import { AppWindow, } from '../components/Chrome';
import { HeroAppMock } from '../components/Mockups';
import { ALPHA, ATS_SOURCES, SITE } from '../config/site';

export function Hero() {
  const stage = useScrollProgress<HTMLDivElement>();
  const device = useReveal<HTMLDivElement>(0.05);

  return (
    <section className="relative overflow-hidden pb-20 pt-28 sm:pt-36">
      {/* soft colour wash behind the hero */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[720px] opacity-70"
        style={{
          background:
            'radial-gradient(60% 50% at 50% 0%, rgba(0,113,227,0.12) 0%, rgba(123,92,255,0.06) 45%, transparent 75%)',
        }}
      />
      <div className="container-page text-center">
        <Link
          href="/download"
          className="fade-up group mb-6 inline-flex items-center gap-2 rounded-full bg-mist px-4 py-1.5 text-[13px] text-muted transition-colors hover:text-ink"
          style={{ ['--d' as string]: '0ms' }}
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inset-0 animate-pulse-ring rounded-full bg-accent" />
            <span className="relative h-2 w-2 rounded-full bg-accent" />
          </span>
          Closed alpha now open · {ALPHA.seats} seats
          <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>

        <h1 className="t-hero mx-auto max-w-5xl">
          <RiseText text="Your job search," />
          <br className="hidden sm:block" />
          <RiseText text="on autopilot." startIndex={3} wordClassName="gradient-text" />
        </h1>

        <p className="t-lead fade-up mx-auto mt-6 max-w-2xl" style={{ ['--d' as string]: '450ms' }}>
          Nomadic is the desktop app that plans what to learn, finds jobs straight from company hiring systems, and
          fills in the applications for you.
        </p>

        <div
          className="fade-up mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-5"
          style={{ ['--d' as string]: '600ms' }}
        >
          <Link href="/download" className="btn-primary w-full px-7 py-3.5 text-[17px] sm:w-auto">
            Join the alpha for ₹{ALPHA.price}
          </Link>
          <Link href="/#learn" className="btn-ghost text-[17px]">
            See how it works <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <p className="fade-up mt-5 text-[13px] text-faint" style={{ ['--d' as string]: '750ms' }}>
          For {SITE.platforms.join(', ')} · Your data stays on your computer
        </p>
      </div>

      <div ref={stage} className="hero-stage container-page mt-14 sm:mt-20">
        <div ref={device} className="reveal reveal-scale hero-device mx-auto max-w-5xl" style={{ ['--d' as string]: '700ms' }}>
          <AppWindow title="Nomadic — Live job feed">
            <HeroAppMock />
          </AppWindow>
        </div>
      </div>
    </section>
  );
}

export function SourcesMarquee() {
  const items = [...ATS_SOURCES, ...ATS_SOURCES];
  return (
    <section aria-labelledby="sources-title" className="border-y border-black/[0.06] py-10">
      <h2 id="sources-title" className="mb-6 text-center text-[13px] font-medium text-faint">
        Jobs pulled directly from the systems companies hire with
      </h2>
      <div className="mask-fade-x overflow-hidden">
        <ul className="flex w-max animate-marquee gap-14 hover:[animation-play-state:paused]" aria-label="Supported job sources">
          {items.map((s, i) => (
            <li
              key={i}
              aria-hidden={i >= ATS_SOURCES.length}
              className="whitespace-nowrap text-2xl font-semibold tracking-headline text-ink/30 transition-colors hover:text-ink sm:text-3xl"
            >
              {s}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const STATEMENT =
  'Job hunting should not mean five tabs, three spreadsheets and the same form typed out a hundred times. Nomadic puts learning, jobs, applications and follow-ups in one calm place, so your time goes into getting better, not into busywork.';

export function Statement() {
  const ref = useScrollProgress<HTMLDivElement>();
  const words = STATEMENT.split(' ');
  return (
    <section className="py-28 sm:py-40">
      <div ref={ref} className="container-page">
        <p className="t-headline mx-auto max-w-4xl !leading-[1.25]" style={{ ['--n' as string]: words.length }}>
          {words.map((w, i) => (
            <span key={i} className="scrub-word" style={{ ['--i' as string]: i }}>
              {w}{' '}
            </span>
          ))}
        </p>
      </div>
    </section>
  );
}

function Stat({ value, suffix = '', label }: { value: number; suffix?: string; label: string }) {
  const { ref, value: v } = useCountUp(value);
  return (
    <div className="text-center">
      <p className="t-display">
        <span ref={ref}>{v.toLocaleString('en-IN')}</span>
        {suffix}
      </p>
      <p className="mt-2 text-[15px] text-muted">{label}</p>
    </div>
  );
}

export function Stats() {
  return (
    <section className="pb-24 sm:pb-32">
      <Reveal className="container-page grid grid-cols-2 gap-y-12 lg:grid-cols-4">
        <Stat value={428} suffix="+" label="company interview sets" />
        <Stat value={52} label="week AI roadmaps" />
        <Stat value={4} label="ATS platforms auto-filled" />
        <Stat value={100} suffix="%" label="of your profile kept local" />
      </Reveal>
    </section>
  );
}
