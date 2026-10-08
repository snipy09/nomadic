import { CONTACT_EMAIL, CONTACT_PHONE, CONTACT_PHONE_HREF, LEGAL_DOCS, LEGAL_NAME, LEGAL_UPDATED, SUPPORT_EMAIL } from '@nomadic/config';
import Nav from '../components/Nav';
import Footer from '../components/Footer';

export type LegalType = keyof typeof LEGAL_DOCS;

/** Renders a legal document from @nomadic/config, the single source shared with the desktop app. */
export default function Legal({ type }: { type: LegalType }) {
  const doc = LEGAL_DOCS[type];

  return (
    <div className="min-h-screen">
      <Nav variant="page" />

      <main className="mx-auto max-w-6xl px-4 py-14 sm:px-6 md:py-20">
        <h1 className="wide max-w-4xl text-[clamp(2rem,5.5vw,4rem)]">{doc.title}</h1>
        <p className="mt-5 max-w-xl text-lg text-ink-soft">{doc.summary}</p>
        <p className="mt-2 text-sm text-ink-soft">Last updated {LEGAL_UPDATED}.</p>

        <ol className="mt-12 max-w-3xl border-t-2 border-ink">
          {doc.sections.map((section, i) => (
            <li key={section.title} className="grid grid-cols-[2.5rem_1fr] gap-x-2 border-b border-rule py-6">
              <span className="nums font-bold text-ultra">{i + 1}.</span>
              <div>
                <h2 className="text-xl font-bold">{section.title}</h2>
                {section.paragraphs.map((p) => (
                  <p key={p.slice(0, 40)} className="mt-2 text-ink-soft">{p}</p>
                ))}
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
        <p className="mt-3 text-ink-soft">
          Operated by <strong className="text-ink">{LEGAL_NAME}</strong> · Email{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="font-bold text-ink underline underline-offset-4">{CONTACT_EMAIL}</a>
          {' '}· Phone{' '}
          <a href={CONTACT_PHONE_HREF} className="font-bold text-ink underline underline-offset-4">{CONTACT_PHONE}</a>
        </p>
      </main>

      <Footer />
    </div>
  );
}
