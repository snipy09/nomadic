import React, { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { Reveal } from '../components/Reveal';
import { Link } from '../lib/router';
import { ALPHA, FAQS, PLANS } from '../config/site';

export function Pricing() {
  return (
    <section id="pricing" className="py-24 sm:py-32">
      <div className="container-page">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="t-eyebrow mb-3 text-accent">Pricing</p>
          <h2 className="t-display">Simple plans. Start free.</h2>
          <p className="t-lead mx-auto mt-5 max-w-2xl">
            Upgrade when your search picks up. Cancel any time. Prices in Indian rupees.
          </p>
        </Reveal>

        <Reveal className="mx-auto mt-10 flex max-w-3xl flex-col items-center justify-between gap-4 rounded-[22px] bg-gradient-to-r from-[#e8f2fd] via-[#efe9ff] to-[#fde8f1] p-5 text-center sm:flex-row sm:text-left">
          <p className="text-[15px]">
            <span className="font-semibold">Closed alpha:</span> ₹{ALPHA.price} one-time for full Max access while the
            alpha runs. {ALPHA.seats} seats.
          </p>
          <Link href="/download" className="btn-dark shrink-0 px-5 py-2 text-[14px]">
            Reserve a seat
          </Link>
        </Reveal>

        <div className="mx-auto mt-10 grid max-w-5xl gap-5 md:grid-cols-3">
          {PLANS.map((p, i) => (
            <Reveal
              key={p.id}
              delay={i * 100}
              className={`relative flex flex-col rounded-[28px] p-8 transition-transform duration-500 ease-spring hover:-translate-y-1 ${
                p.featured ? 'bg-ink text-white' : 'bg-mist'
              }`}
            >
              {p.featured && (
                <span className="absolute right-6 top-6 rounded-full bg-white/15 px-3 py-1 text-[11px] font-medium">
                  Most powerful
                </span>
              )}
              <h3 className="text-2xl font-semibold tracking-headline">{p.name}</h3>
              <p className={`mt-1 min-h-[42px] text-[14px] ${p.featured ? 'text-white/60' : 'text-muted'}`}>{p.blurb}</p>
              <p className="mt-6 flex items-baseline gap-1">
                <span className="text-5xl font-semibold tracking-display">₹{p.price}</span>
                <span className={`text-[14px] ${p.featured ? 'text-white/60' : 'text-muted'}`}>/ {p.period}</span>
              </p>
              <ul className="mt-7 flex-1 space-y-3 text-[14px]">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2.5">
                    <Check className={`mt-0.5 h-4 w-4 shrink-0 ${p.featured ? 'text-accent-bright' : 'text-accent'}`} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={p.cta.href}
                className={`mt-8 w-full ${p.featured ? 'btn-primary' : p.id === 'free' ? 'btn-light' : 'btn-dark'}`}
              >
                {p.cta.label}
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="bg-mist py-24 sm:py-32">
      <div className="container-page max-w-3xl">
        <Reveal className="text-center">
          <h2 className="t-display">Questions? Answers.</h2>
        </Reveal>
        <Reveal as="ul" className="mt-12 divide-y divide-line border-y border-line">
          {FAQS.map((f, i) => {
            const isOpen = open === i;
            return (
              <li key={f.q}>
                <h3>
                  <button
                    id={`faq-q-${i}`}
                    aria-expanded={isOpen}
                    aria-controls={`faq-a-${i}`}
                    onClick={() => setOpen(isOpen ? null : i)}
                    className="flex w-full items-center justify-between gap-6 py-6 text-left text-[17px] font-semibold tracking-headline sm:text-xl"
                  >
                    {f.q}
                    <Plus
                      className={`h-5 w-5 shrink-0 text-muted transition-transform duration-500 ease-spring ${isOpen ? 'rotate-45' : ''}`}
                    />
                  </button>
                </h3>
                {/* Answers stay in the DOM when collapsed so search engines can read them. */}
                <div id={`faq-a-${i}`} role="region" aria-labelledby={`faq-q-${i}`} className="collapse" data-open={isOpen}>
                  <div>
                    <p className="pb-6 pr-10 text-[15px] leading-relaxed text-muted sm:text-[17px]">{f.a}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </Reveal>
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="relative overflow-hidden py-28 text-center sm:py-40">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(50% 60% at 50% 100%, rgba(0,113,227,0.14) 0%, rgba(123,92,255,0.07) 45%, transparent 75%)',
        }}
      />
      <Reveal className="container-page">
        <h2 className="t-hero mx-auto max-w-4xl">
          Spend less time applying.
          <br />
          <span className="gradient-text">More time getting hired.</span>
        </h2>
        <p className="t-lead mx-auto mt-6 max-w-xl">
          Join the closed alpha and help shape Nomadic. ₹{ALPHA.price}, one time, full access.
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-5">
          <Link href="/download" className="btn-primary w-full px-7 py-3.5 text-[17px] sm:w-auto">
            Reserve your seat
          </Link>
          <Link href="/#pricing" className="btn-ghost text-[17px]">
            Compare plans
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
