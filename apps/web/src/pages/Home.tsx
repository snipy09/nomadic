import { CSSProperties } from 'react';
import Nav from '../components/Nav';
import Footer from '../components/Footer';
import ComingSoon from '../components/ComingSoon';
import HeroDemo from '../components/HeroDemo';
import RouteSection from '../components/RouteSection';
import Roadmap from '../components/Roadmap';
import JobFinder from '../components/JobFinder';
import ApplyDemo from '../components/ApplyDemo';
import Board from '../components/Board';
import Pricing from '../components/Pricing';
import Faq from '../components/Faq';
import Reveal from '../components/Reveal';
import { scrollToId } from '../hooks';
import { DATA_HANDLING } from '../content';

const HEADLINE = ['Your whole', 'job search,', 'in one window.'];

const delay = (ms: number) => ({ '--d': `${ms}ms` } as CSSProperties);

function Hero() {
  return (
    <section className="on-dark overflow-hidden bg-ultra text-white">
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-6 md:pb-24 md:pt-20">
        <h1 className="wide text-[clamp(2.5rem,7vw,5.5rem)]">
          {HEADLINE.map((line, i) => (
            <span key={line} className="line-mask block">
              <span className="anim-rise block" style={delay(i * 130)}>
                {line}
              </span>
            </span>
          ))}
        </h1>

        <div className="mt-10 grid grid-cols-[minmax(0,1fr)] items-start gap-12 lg:mt-14 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
          <div className="anim-fade min-w-0" style={delay(560)}>
            <p className="max-w-lg text-lg leading-relaxed text-white/90 sm:text-xl">
              Nomadic is a desktop app. It teaches you the skills for the role you want, finds openings on company
              hiring pages, fills in the application forms and keeps every application on one board.
            </p>
            <ComingSoon tone="dark" size="lg" className="mt-8" />
            <p className="mt-4 max-w-md text-white/85">
              For Windows first, macOS after the beta. Public downloads are not open yet.
            </p>
            <a
              href="#learn"
              onClick={(event) => {
                event.preventDefault();
                scrollToId('learn');
              }}
              className="mt-3 inline-flex min-h-11 items-center font-bold underline decoration-2 underline-offset-4 hover:text-marigold"
            >
              See how it works
            </a>
          </div>

          {/* The wrapper takes the scroll-linked drift, so the window's own entrance animation is left alone. */}
          <div className="hero-drift min-w-0">
            <HeroDemo />
          </div>
        </div>
      </div>
    </section>
  );
}

function DataBand() {
  return (
    <section id="privacy" aria-labelledby="data-title" className="on-dark bg-ink text-white">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28">
        <Reveal kind="line" as="h2" id="data-title" className="wide max-w-3xl text-[clamp(1.75rem,4.6vw,3.5rem)]">
          Privacy and data handling
        </Reveal>
        <Reveal kind="up" delay={120}>
          <p className="mt-5 max-w-2xl text-lg text-ink-pale">
            An auto-apply tool needs your details. Here is exactly where each piece goes.
          </p>
        </Reveal>

        <Reveal kind="rule" className="mt-12 grid grid-cols-[minmax(0,1fr)] border-t-2 border-white/40 md:grid-cols-2 lg:grid-cols-4">
          {DATA_HANDLING.map((row, i) => (
            <Reveal
              key={row.title}
              kind="up"
              delay={200 + i * 120}
              className={`py-8 md:pr-8 ${i > 0 ? 'border-t border-white/25 lg:border-l lg:border-t-0 lg:pl-8' : ''}`}
            >
              <h3 className="text-xl font-bold">{row.title}</h3>
              <ul className="mt-3 space-y-2 text-ink-pale">
                {row.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Reveal>
          ))}
        </Reveal>

        <a
          href="/privacy"
          className="mt-2 inline-flex min-h-11 items-center font-bold underline decoration-2 underline-offset-4 hover:text-marigold"
        >
          Read the privacy policy
        </a>
      </div>
    </section>
  );
}

function FinalCall() {
  return (
    <section aria-labelledby="soon-title" className="on-dark bg-ultra text-white">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28">
        <Reveal kind="line" as="h2" id="soon-title" className="wide max-w-4xl text-[clamp(2rem,6vw,4.75rem)]">
          The download is coming soon.
        </Reveal>
        <Reveal kind="up" delay={160}>
          <p className="mt-6 max-w-xl text-lg text-white/90 sm:text-xl">
            Public downloads are not open yet. The download page will carry the installer the day it is ready.
          </p>
        </Reveal>
        <Reveal kind="up" delay={280} className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3">
          <ComingSoon tone="dark" size="lg" />
          <a
            href="/download"
            className="inline-flex min-h-11 items-center font-bold underline decoration-2 underline-offset-4 hover:text-marigold"
          >
            Read the details
          </a>
        </Reveal>
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen">
      <Nav />
      <main>
        <Hero />

        <RouteSection
          id="learn"
          step={1}
          first
          title="Learn what the role actually asks for."
          intro="Pick a target role and Nomadic lays out a roadmap of milestones. Each one comes with practice projects, company interview question sets and textbook chapters. Select a milestone to see what it covers."
        >
          <Roadmap />
        </RouteSection>

        <RouteSection
          id="find"
          step={2}
          title="See openings from the source."
          intro="Nomadic reads Greenhouse, Lever, Ashby, Internshala and company career pages directly, so roles show up when they are posted. Each one is scored against the skills on your profile."
        >
          <JobFinder />
        </RouteSection>

        <RouteSection
          id="apply"
          step={3}
          title="It fills the forms. You press submit."
          intro="Your saved details go into each application for you. Review every one before it goes out, or let Nomadic run through the queue on its own."
        >
          <ApplyDemo />
        </RouteSection>

        <RouteSection
          id="track"
          step={4}
          title="Every application on one board."
          intro="Saves, submissions, assessments, interviews and offers all live in one place, so nothing slips."
        >
          <Board />
        </RouteSection>

        <DataBand />
        <Pricing />
        <Faq />
        <FinalCall />
      </main>
      <Footer />
    </div>
  );
}
