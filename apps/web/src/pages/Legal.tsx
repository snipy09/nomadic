import React from 'react';
import { Link } from '../lib/router';
import { SITE } from '../config/site';

type Section = { h: string; p: string };

const DOCS: Record<'terms' | 'privacy', { title: string; updated: string; intro: string; sections: Section[] }> = {
  terms: {
    title: 'Terms of Service',
    updated: 'August 2026',
    intro: 'By downloading, installing or using the Nomadic desktop app you agree to these terms.',
    sections: [
      {
        h: 'Licence',
        p: 'We grant you a revocable, non-exclusive, non-transferable licence to use Nomadic on one computer for your personal job search and career development.',
      },
      {
        h: 'One device per licence',
        p: 'Each subscription is tied to one device. Using the same licence on several machines at once is not allowed.',
      },
      {
        h: 'Fair use of automation',
        p: 'Nomadic runs browser automation on your own computer. Use it responsibly and within the rules of the sites you apply to. Abuse, reverse engineering or redistribution can lead to your licence being ended.',
      },
      {
        h: 'Payments',
        p: 'Because access is delivered immediately, payments are final and non-refundable, and cannot be transferred to another person.',
      },
      {
        h: 'No guarantee of outcomes',
        p: 'Nomadic helps you learn and apply more efficiently. It does not guarantee interviews, offers or employment. Those decisions are made by employers.',
      },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    updated: 'October 2026',
    intro: 'Nomadic is built local-first. This page explains what stays on your computer, what reaches our servers, and what we never do.',
    sections: [
      {
        h: 'Stored on your computer',
        p: 'Your candidate profile, resume files, saved answers, notes, application history and portal sessions are kept in a local SQLite database and browser profile on your machine.',
      },
      {
        h: 'Stored in your account',
        p: 'To run your licence and sync bookmarks we store your email, name, plan, licence key, a device fingerprint for the one-device lock, billing records and saved job links in our Supabase database.',
      },
      {
        h: 'AI features',
        p: 'When you use an AI feature, such as answering a screening question, scoring how well you match a job or writing a cover letter, the relevant profile details, resume text and job description are sent to our AI provider to produce the result.',
      },
      {
        h: 'We never sell your data',
        p: 'We do not sell, rent or share your personal data, resumes or outreach history with advertisers or data brokers.',
      },
      {
        h: 'Security',
        p: 'All traffic between the app and our servers is encrypted with TLS. Access to account data is restricted by row-level security.',
      },
      {
        h: 'Your choices',
        p: `To access or delete the data in your account, email ${SITE.supportEmail}.`,
      },
    ],
  },
};

export default function Legal({ type }: { type: 'terms' | 'privacy' }) {
  const doc = DOCS[type];
  const other = type === 'terms' ? { href: '/privacy', label: 'Privacy Policy' } : { href: '/terms', label: 'Terms of Service' };
  return (
    <article className="container-page max-w-3xl pb-24 pt-32 sm:pt-40">
      <nav aria-label="Breadcrumb" className="fade-up text-[13px] text-faint">
        <Link href="/" className="hover:text-ink">Home</Link> <span aria-hidden>/</span> {doc.title}
      </nav>
      <h1 className="t-display fade-up mt-4" style={{ ['--d' as string]: '80ms' }}>{doc.title}</h1>
      <p className="fade-up mt-3 text-[14px] text-faint" style={{ ['--d' as string]: '140ms' }}>Last updated {doc.updated}</p>
      <p className="t-lead fade-up mt-8" style={{ ['--d' as string]: '200ms' }}>{doc.intro}</p>
      <div className="fade-up mt-12 space-y-10" style={{ ['--d' as string]: '260ms' }}>
        {doc.sections.map((s, i) => (
          <section key={s.h}>
            <h2 className="text-xl font-semibold tracking-headline">
              {i + 1}. {s.h}
            </h2>
            <p className="mt-2 text-[17px] leading-relaxed text-muted">{s.p}</p>
          </section>
        ))}
      </div>
      <div className="mt-16 flex flex-col justify-between gap-3 border-t border-line pt-8 text-[14px] sm:flex-row">
        <p className="text-muted">
          Questions: <a className="text-accent hover:underline" href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a>
        </p>
        <Link href={other.href} className="text-accent hover:underline">Read the {other.label} →</Link>
      </div>
    </article>
  );
}
