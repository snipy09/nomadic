import React, { useState } from 'react';
import { ArrowUpRight, Check, MessageCircle, Zap, Sparkles, ShieldCheck, Headphones, Monitor } from 'lucide-react';
import { Reveal, RiseText } from '../components/Reveal';
import { ALPHA, SITE } from '../config/site';

const PERKS = [
  { icon: Zap, title: 'Full Max access', text: 'Unlimited auto-apply, outreach and the priority job radar for the whole alpha.' },
  { icon: Sparkles, title: 'Every feature, first', text: 'New form engine, roadmaps and AI assistant the day they ship.' },
  { icon: Headphones, title: 'Direct line to the team', text: 'A private channel with the developers. Your feedback shapes the product.' },
  { icon: ShieldCheck, title: 'Local-first and private', text: 'Your profile and resumes stay on your computer.' },
];

const STEPS = [
  { title: 'Reserve your seat', text: `Message us on WhatsApp or leave your email. ₹${ALPHA.price}, one time.` },
  { title: 'Get your invite', text: 'We send your private installer link and licence when your cohort opens.' },
  { title: 'Install and set up', text: 'Add your resume and goals once. About ten minutes.' },
];

export default function Download() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) return;
    setSent(true);
    window.open(ALPHA.preRegisterWithEmail(email), '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      <section className="relative overflow-hidden pb-16 pt-32 text-center sm:pt-40">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[600px]"
          style={{ background: 'radial-gradient(55% 50% at 50% 0%, rgba(0,113,227,0.12), transparent 75%)' }}
        />
        <div className="container-page">
          <p className="t-eyebrow fade-up text-accent">Nomadic closed alpha</p>
          <h1 className="t-hero mx-auto mt-3 max-w-4xl">
            <RiseText text="Be one of the first" />
            <br className="hidden sm:block" />
            <RiseText text={`${ALPHA.seats} people in.`} startIndex={5} wordClassName="gradient-text" />
          </h1>
          <p className="t-lead fade-up mx-auto mt-6 max-w-2xl" style={{ ['--d' as string]: '450ms' }}>
            Public downloads are not open yet. Reserve an alpha seat to get the desktop app for{' '}
            {SITE.platforms[0]}, with full Max access, while we build it with you.
          </p>
        </div>
      </section>

      <section className="pb-24">
        <div className="container-page">
          <Reveal scale className="mx-auto max-w-3xl overflow-hidden rounded-[32px] bg-ink text-white shadow-[0_40px_100px_-30px_rgba(0,0,0,0.45)]">
            <div className="flex flex-col gap-6 border-b border-white/10 p-8 sm:flex-row sm:items-end sm:justify-between sm:p-10">
              <div>
                <p className="text-[13px] text-white/60">Alpha seat</p>
                <p className="mt-1 flex items-baseline gap-2">
                  <span className="text-6xl font-semibold tracking-display">₹{ALPHA.price}</span>
                  <span className="text-white/60">one time</span>
                </p>
              </div>
              <p className="flex items-center gap-2 text-[13px] text-white/60">
                <Monitor className="h-4 w-4" /> {SITE.platforms[0]} first · {SITE.platforms.slice(1).join(' & ')} next
              </p>
            </div>

            <div className="space-y-4 p-8 sm:p-10">
              <a
                href={ALPHA.preRegisterUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary w-full py-4 text-[17px]"
              >
                <MessageCircle className="h-5 w-5" />
                Reserve on WhatsApp
                <ArrowUpRight className="h-4 w-4 opacity-70" />
              </a>

              <div className="flex items-center gap-4 py-1 text-[12px] text-white/40">
                <span className="h-px flex-1 bg-white/10" /> or leave your email <span className="h-px flex-1 bg-white/10" />
              </div>

              <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
                <label htmlFor="alpha-email" className="sr-only">
                  Email address
                </label>
                <input
                  id="alpha-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="min-w-0 flex-1 rounded-full bg-white/10 px-5 py-3.5 text-[15px] text-white placeholder:text-white/40 focus:bg-white/15 focus:outline-none focus:ring-2 focus:ring-accent"
                />
                <button type="submit" className="btn-light py-3.5">
                  Reserve seat
                </button>
              </form>

              <div className={`collapse`} data-open={sent} aria-live="polite">
                <div>
                  <p className="flex items-start gap-2 rounded-2xl bg-[#30d158]/15 p-4 text-[14px] text-[#7ee2a0]">
                    <Check className="mt-0.5 h-4 w-4 shrink-0" />
                    Thanks! We opened WhatsApp so you can confirm your ₹{ALPHA.price} seat. We will reply within a day.
                  </p>
                </div>
              </div>
            </div>
          </Reveal>

          <div className="mx-auto mt-20 grid max-w-5xl gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {PERKS.map(({ icon: Icon, title, text }, i) => (
              <Reveal key={title} delay={i * 100}>
                <Icon className="mb-3 h-7 w-7 text-accent" strokeWidth={1.6} />
                <h2 className="text-[17px] font-semibold tracking-headline">{title}</h2>
                <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-mist py-24">
        <div className="container-page">
          <Reveal className="text-center">
            <h2 className="t-headline">What happens next</h2>
          </Reveal>
          <ol className="mx-auto mt-12 grid max-w-5xl gap-5 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <Reveal as="li" key={s.title} delay={i * 120} className="rounded-[28px] bg-white p-8">
                <span className="text-[13px] font-semibold text-accent">Step {i + 1}</span>
                <h3 className="mt-2 text-xl font-semibold tracking-headline">{s.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">{s.text}</p>
              </Reveal>
            ))}
          </ol>
          <Reveal className="mt-12 text-center text-[14px] text-muted">
            Questions? Write to{' '}
            <a className="text-accent hover:underline" href={`mailto:${SITE.supportEmail}`}>
              {SITE.supportEmail}
            </a>{' '}
            or{' '}
            <a className="text-accent hover:underline" href={SITE.whatsapp} target="_blank" rel="noopener noreferrer">
              message us on WhatsApp
            </a>
            .
          </Reveal>
        </div>
      </section>
    </>
  );
}
