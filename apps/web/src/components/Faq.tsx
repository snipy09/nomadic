import { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { FAQS } from '../content';

export default function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  // Structured data comes from the same list that is rendered, so the two cannot drift apart.
  useEffect(() => {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'faq-structured-data';
    script.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQS.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    });
    document.head.appendChild(script);
    return () => script.remove();
  }, []);

  return (
    <section id="faq" aria-labelledby="faq-title" className="bg-fog">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 md:py-28 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-16">
        <h2 id="faq-title" className="wide text-[clamp(1.75rem,4.6vw,3.5rem)]">
          Questions people ask first
        </h2>

        <div className="border-t-2 border-ink">
          {FAQS.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={item.q} className="border-b-2 border-ink">
                <h3>
                  <button
                    type="button"
                    id={`faq-q-${i}`}
                    aria-expanded={isOpen}
                    aria-controls={`faq-a-${i}`}
                    onClick={() => setOpen(isOpen ? null : i)}
                    className="flex w-full items-center justify-between gap-6 py-5 text-left text-lg font-bold hover:text-ultra"
                  >
                    {item.q}
                    {isOpen ? (
                      <Minus aria-hidden className="h-5 w-5 shrink-0" strokeWidth={3} />
                    ) : (
                      <Plus aria-hidden className="h-5 w-5 shrink-0" strokeWidth={3} />
                    )}
                  </button>
                </h3>
                <div
                  id={`faq-a-${i}`}
                  role="region"
                  aria-labelledby={`faq-q-${i}`}
                  data-open={isOpen}
                  className="disclose"
                >
                  <div aria-hidden={!isOpen}>
                    <p className="max-w-2xl pb-6 text-ink-soft">{item.a}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
