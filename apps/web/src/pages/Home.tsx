import { CSSProperties } from 'react';
import Nav from '../components/Nav';
import Footer from '../components/Footer';
import DownloadCta from '../components/DownloadCta';
import EmailSignup from '../components/EmailSignup';
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
import { DATA_HANDLING, platformLine } from '../content';

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
              Nomadic is a desktop app for job seekers in India, from freshers to experienced hires. It plans what to learn for the
              role you want, day by day, finds openings on company hiring pages, fills in the application forms for you
              to review and keeps every application on one board.
            </p>
            <DownloadCta tone="dark" size="lg" className="mt-8" />
            <p className="mt-4 max-w-md text-white/85">
              {platformLine()}
            </p>
            <EmailSignup source="hero" className="mt-8" />
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
          Download Nomadic. It is free.
        </Reveal>
        <Reveal kind="up" delay={160}>
          <p className="mt-6 max-w-xl text-lg text-white/90 sm:text-xl">
            {platformLine()} Leave your email too, and we will write when something big ships.
          </p>
        </Reveal>
        <Reveal kind="up" delay={220}>
          <EmailSignup source="final" className="mt-10" />
        </Reveal>
        <Reveal kind="up" delay={280} className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3">
          <DownloadCta tone="dark" size="lg" />
          <a
            href="/download"
            className="inline-flex min-h-11 items-center font-bold underline decoration-2 underline-offset-4 hover:text-marigold"
          >
            Install guides
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
          intro="Type any role and Nomadic splits it into subjects, modules and topics, each topic with its own YouTube search and ChatGPT prompt, then five projects for the role with one guided capstone. Select a subject to see its topics."
        >
          <Roadmap />
        </RouteSection>

        <RouteSection
          id="find"
          step={2}
          title="See openings from the source."
          intro="Nomadic reads Greenhouse, Lever, Ashby, Internshala and company career pages directly and keeps the roles open to candidates in India. Each one is scored against your skills, including what you finished in Learn, with the skills you are missing listed."
        >
          <JobFinder />
        </RouteSection>

        <RouteSection
          id="apply"
          step={3}
          title="It fills the forms. You press submit."
          intro="Nomadic opens the real form in your own browser and fills it from your profile, resume and saved answers, showing where every value came from. You check each field, tick that you reviewed it, and only then does it go out. Nothing is ever submitted without your review."
        >
          <ApplyDemo />
        </RouteSection>

        <RouteSection
          id="track"
          step={4}
          title="Every application on one board."
          intro="Every application lands on one board, from the ones that need your action to interviews and offers, with notes, status history and follow-up reminders, so nothing slips."
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
