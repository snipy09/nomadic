import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { FAQS } from '../content';
import Reveal from './Reveal';

// The FAQPage structured data is built from the same FAQS list at build time (see jsonld.ts).
export default function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" aria-labelledby="faq-title" className="bg-fog">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 sm:py-20 md:py-28 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-16">
        <Reveal kind="line" as="h2" id="faq-title" className="wide text-[clamp(1.75rem,4.6vw,3.5rem)]">
          Questions people ask first
        </Reveal>

        <Reveal kind="rule" delay={120} className="border-t-2 border-ink">
          {FAQS.map((item, i) => {
            const isOpen = open === i;
            return (
              <Reveal key={item.q} kind="fade" delay={200 + i * 70} className="border-b-2 border-ink">
                <h3>
                  <button
                    type="button"
                    id={`faq-q-${i}`}
                    aria-expanded={isOpen}
                    aria-controls={`faq-a-${i}`}
                    onClick={() => setOpen(isOpen ? null : i)}
                    className="flex min-h-11 w-full items-center justify-between gap-4 py-5 text-left text-base font-bold transition-colors hover:text-ultra sm:gap-6 sm:text-lg"
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
              </Reveal>
            );
          })}
        </Reveal>
      </div>
    </section>
  );
}
