import React from 'react';
import { CheckCircle2, Mail } from 'lucide-react';
import { Badge, Card, CardContent, CardHeader } from '@nomadic/ui';
import { KIND_INFO, PICKABLE_KINDS } from './outreachLogic';

const RULES = [
  'Contacts come only from pages companies and people publish themselves: careers pages, job posts, team pages. No LinkedIn scraping and no guessed email addresses.',
  'Every address is checked (format and mail server) before it is listed, and anyone can report a wrong or unwanted contact.',
  'You write or edit every message, tick that you reviewed it, and only then is it sent from your own email or opened in Gmail or LinkedIn.',
  'Sent messages land in your Tracker with a follow-up reminder a week later.',
  'At most 20 emails a day from your own account, a minute apart, so your address stays in good standing.',
];

/** Preview of Outreach while the feature is still off in this build. */
export function OutreachComingSoon() {
  return (
    <div className="flex flex-col gap-6 pb-16">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-heading font-strong text-fg">Outreach</h1>
            <Badge tone="accent">Coming soon</Badge>
          </div>
          <p className="mt-1 max-w-2xl text-body text-fg-muted">
            Reach the people who can refer you, not only HR. Find who works at a company, write a short note, review it and send it from your own email or LinkedIn.
          </p>
        </div>
      </header>

      <Card>
        <CardHeader icon={<Mail />} title="Who you can reach" description="Anyone at the company who can refer you or pass your application on." />
        <CardContent>
          <ul className="grid gap-3 sm:grid-cols-2">
            {PICKABLE_KINDS.filter((k) => k !== 'unknown').map((k) => (
              <li key={k} className="rounded-md border border-line p-3">
                <div className="text-body font-strong text-fg">{KIND_INFO[k].label}</div>
                <div className="mt-0.5 text-caption text-fg-muted">{KIND_INFO[k].why}</div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader icon={<CheckCircle2 />} title="How it will work" description="The same rule as Apply: nothing is sent without your review." />
        <CardContent>
          <ul className="flex flex-col gap-2">
            {RULES.map((r) => (
              <li key={r} className="flex gap-2 text-body text-fg-muted">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
