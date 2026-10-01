import { CSSProperties } from 'react';
import Nav from '../components/Nav';
import Footer from '../components/Footer';
import ComingSoon from '../components/ComingSoon';

const delay = (ms: number) => ({ '--d': `${ms}ms` } as CSSProperties);

const INCLUDED = [
  { title: 'Learn', body: 'Roadmaps, practice projects, company question sets and textbooks.' },
  { title: 'Find', body: 'Openings read straight from company hiring pages, scored against your profile.' },
  { title: 'Apply', body: 'Application forms filled from your saved details, with you in control of submitting.' },
  { title: 'Track', body: 'One board for every save, submission, assessment, interview and offer.' },
];

export default function Download() {
  return (
    <div className="min-h-screen">
      <Nav variant="page" />

      <main>
        <section className="on-dark bg-ultra text-white">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-28">
            <h1 className="wide text-[clamp(2.25rem,6.5vw,5rem)]">
              <span className="line-mask block">
                <span className="anim-rise block" style={delay(0)}>
                  Nomadic for desktop
                </span>
              </span>
              <span className="line-mask block">
                <span className="anim-rise block" style={delay(130)}>
                  is coming soon.
                </span>
              </span>
            </h1>
            <p className="anim-fade mt-8 max-w-xl text-xl text-white/90" style={delay(450)}>
              There is no public download yet. When it is ready, the installer will be on this page.
            </p>
            <div className="anim-fade mt-8" style={delay(600)}>
              <ComingSoon tone="dark" size="lg" />
            </div>
          </div>
        </section>

        <section aria-labelledby="included-title" className="bg-fog">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
            <h2 id="included-title" className="wide max-w-3xl text-[clamp(1.5rem,3.6vw,2.75rem)]">
              What the first release does
            </h2>
            <dl className="mt-10 grid border-t-2 border-ink md:grid-cols-2">
              {INCLUDED.map((item, i) => (
                <div
                  key={item.title}
                  className={`border-b border-rule py-6 md:pr-8 ${i % 2 === 1 ? 'md:border-l md:pl-8' : ''}`}
                >
                  <dt className="text-xl font-bold">{item.title}</dt>
                  <dd className="mt-2 max-w-md text-ink-soft">{item.body}</dd>
                </div>
              ))}
            </dl>

            <p className="mt-10 max-w-xl text-ink-soft">
              Nomadic runs on Windows, macOS and Linux. Questions before then? Write to{' '}
              <a
                href="mailto:support@nomadic.app"
                className="font-bold text-ink underline decoration-2 underline-offset-4 hover:text-ultra"
              >
                support@nomadic.app
              </a>
              .
            </p>
            <a
              href="#/"
              className="mt-6 inline-block font-bold underline decoration-2 underline-offset-4 hover:text-ultra"
            >
              Back to the site
            </a>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
