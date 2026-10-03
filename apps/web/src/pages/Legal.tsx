import Nav from '../components/Nav';
import Footer from '../components/Footer';
import { PRIVACY_POLICY, PRIVACY_UPDATED, SUPPORT_EMAIL } from '../privacy';

interface Clause {
  term: string;
  text: string;
  items?: string[];
}

const DOCS: Record<'terms' | 'privacy', { title: string; subtitle: string; updated: string; clauses: Clause[] }> = {
  terms: {
    title: 'Terms and Conditions',
    subtitle: 'Software licensing, fair usage and subscription terms.',
    updated: 'August 2026',
    clauses: [
      {
        term: 'Acceptance of Terms',
        text: 'By downloading, installing, or accessing the Nomadic desktop application, you agree to comply with and be bound by these Terms of Service.',
      },
      {
        term: 'License Grant',
        text: 'We grant you a revocable, non-exclusive, non-transferable, single-machine license to use Nomadic solely for personal job-seeking and career skill development.',
      },
      {
        term: 'Single-Device Enforcement',
        text: 'Each licensed subscription is locked to one designated computer hardware fingerprint. Concurrent usage across multiple machines is strictly prohibited.',
      },
      {
        term: 'Client-Side Automation and Fair Use',
        text: 'Nomadic executes local browser automation directly on your machine. You agree to use the software responsibly and comply with standard rate limits. Any intentional abuse, reverse-engineering, or unauthorized distribution may result in immediate license termination.',
      },
      {
        term: 'All Sales Final',
        text: 'Due to the immediate delivery of digital software capabilities and API access limits, all subscription payments are final, non-refundable, and non-transferable.',
      },
      {
        term: 'Disclaimer',
        text: 'Nomadic is an efficiency platform that automates application workflows and provides structured learning roadmaps. Nomadic does not guarantee interviews, offers, or employment decisions, which remain solely at the discretion of hiring companies.',
      },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    subtitle: 'Exactly what stays on your computer, what is stored on our server, and who else sees it.',
    updated: PRIVACY_UPDATED,
    clauses: PRIVACY_POLICY.map((section) => ({ term: section.heading, text: section.intro ?? '', items: section.items })),
  },
};

export default function Legal({ type }: { type: 'terms' | 'privacy' }) {
  const doc = DOCS[type];

  return (
    <div className="min-h-screen">
      <Nav variant="page" />

      <main className="mx-auto max-w-6xl px-4 py-14 sm:px-6 md:py-20">
        <h1 className="wide max-w-4xl text-[clamp(2rem,5.5vw,4rem)]">{doc.title}</h1>
        <p className="mt-5 max-w-xl text-lg text-ink-soft">{doc.subtitle}</p>
        <p className="mt-2 text-sm text-ink-soft">Last updated {doc.updated}.</p>

        <ol className="mt-12 max-w-3xl border-t-2 border-ink">
          {doc.clauses.map((clause, i) => (
            <li key={clause.term} className="grid grid-cols-[2.5rem_1fr] gap-x-2 border-b border-rule py-6">
              <span className="nums font-bold text-ultra">{i + 1}.</span>
              <div>
                <h2 className="text-xl font-bold">{clause.term}</h2>
                {clause.text && <p className="mt-2 text-ink-soft">{clause.text}</p>}
                {clause.items && (
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-soft marker:text-ultra">
                    {clause.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ol>

        <p className="mt-10 text-ink-soft">
          Questions about this document? Write to{' '}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="font-bold text-ink underline decoration-2 underline-offset-4 hover:text-ultra"
          >
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </main>

      <Footer />
    </div>
  );
}
