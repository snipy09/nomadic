import Nav from '../components/Nav';
import Footer from '../components/Footer';

const DOCS = {
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
    subtitle: 'Local-first data storage and no data harvesting.',
    updated: 'August 2026',
    clauses: [
      {
        term: 'Local-First Architecture',
        text: 'Your master candidate profile, resume files, and private credentials remain strictly stored in an isolated SQLite database on your local computer.',
      },
      {
        term: 'Cloud Synchronization',
        text: 'Minimal metadata (user identifier, active subscription tier validity, and bookmarked job URLs) is synchronized securely with Supabase for license validation and cross-session persistence.',
      },
      {
        term: 'No Data Harvesting',
        text: 'We do not sell, rent, monetize, or transmit your personal application data, resume text, or email outreach history to third-party advertisers or data brokers.',
      },
      {
        term: 'Security',
        text: 'All network communications with our licensing infrastructure use industry-standard 256-bit SSL encryption.',
      },
    ],
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
                <p className="mt-2 text-ink-soft">{clause.text}</p>
              </div>
            </li>
          ))}
        </ol>

        <p className="mt-10 text-ink-soft">
          Questions about this document? Write to{' '}
          <a
            href="mailto:support@nomadic.app"
            className="font-bold text-ink underline decoration-2 underline-offset-4 hover:text-ultra"
          >
            support@nomadic.app
          </a>
          .
        </p>
      </main>

      <Footer />
    </div>
  );
}
