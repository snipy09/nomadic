// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { UIProvider } from '@nomadic/ui';
import { OutreachComingSoon } from '../features/outreach/OutreachComingSoon';
import { draftProblems, senderFacts, templateFor } from '../features/outreach/outreachLogic';

afterEach(() => cleanup());

const person = { name: 'Priya Shah', company: 'Acme', kind: 'employee' as const, email: 'priya@acme.com', linkedinUrl: null };

describe('outreach templates', () => {
  it('fills only known facts and leaves visible gaps for the rest', () => {
    const t = templateFor({ purpose: 'referral', channel: 'email', person, sender: senderFacts({ firstName: '', lastName: '' }) });
    expect(t.body).toContain('Hi Priya,');
    expect(t.body).toContain('[Your name]');
    expect(t.subject).toContain('[role]');
    expect(draftProblems({ channel: 'email', ...t }, person).join(' ')).toMatch(/Fill in or remove/);
  });

  it('a complete sender gives a draft with no gaps', () => {
    const sender = senderFacts({ firstName: 'Asha', lastName: 'Rao', desiredTitle: 'Frontend Engineer', techStack: 'React, TypeScript, Node, Go' });
    expect(sender.skills).toBe('React, TypeScript, Node');
    const t = templateFor({ purpose: 'introduction', channel: 'email', person, sender });
    expect(draftProblems({ channel: 'email', ...t }, person)).toEqual([]);
  });

  it('LinkedIn notes have no subject and stay within the limit', () => {
    const sender = senderFacts({ firstName: 'Asha', lastName: 'Rao', desiredTitle: 'Frontend Engineer', techStack: 'React' });
    const li = { ...person, linkedinUrl: 'https://www.linkedin.com/in/priya' };
    const t = templateFor({ purpose: 'referral', channel: 'linkedin', person: li, sender });
    expect(t.subject).toBe('');
    expect(t.body.length).toBeLessThanOrEqual(300);
    expect(draftProblems({ channel: 'linkedin', ...t }, li)).toEqual([]);
    expect(draftProblems({ channel: 'linkedin', ...t }, person)[0]).toMatch(/no LinkedIn/);
  });
});

describe('OutreachComingSoon', () => {
  it('lists everyone who can refer, not only HR', () => {
    render(<UIProvider><OutreachComingSoon /></UIProvider>);
    expect(screen.getByText('Coming soon')).toBeTruthy();
    for (const label of ['Recruiter / HR', 'Hiring manager', 'Founder', 'Employee', 'Alumni', 'Team inbox']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByText(/nothing is sent without your review/i)).toBeTruthy();
  });
});
