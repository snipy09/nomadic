import { describe, expect, it, vi } from 'vitest';
import { addressType, baseDomain, emailDomain, isFreeMailDomain, isRoleLocalPart } from '../classify.ts';
import { checkEmail, isValidEmailSyntax } from '../check.ts';
import { checkMx } from '../mx.ts';
import { SmtpSender, transportOptions, type MailTransport } from '../sender.ts';

const dnsError = (code: string) => Object.assign(new Error(code), { code });

describe('classify', () => {
  it('tells role addresses from personal ones', () => {
    for (const e of ['careers@acme.in', 'hr.india@acme.in', 'talent-acquisition@acme.in', 'eng-hiring@acme.in', 'jobs2026@acme.in', 'hr+hn@acme.in']) {
      expect(addressType(e), e).toBe('role');
    }
    for (const e of ['jane@acme.in', 'dev.patel@acme.in', 'priya.sharma@acme.in', 'rahul+hn@acme.in']) {
      expect(addressType(e), e).toBe('personal');
    }
    expect(isRoleLocalPart('india.jobs')).toBe(true);
  });

  it('knows free mail domains and base domains', () => {
    expect(isFreeMailDomain('Gmail.com')).toBe(true);
    expect(isFreeMailDomain('acme.in')).toBe(false);
    expect(emailDomain('Jane@Acme.IN')).toBe('acme.in');
    expect(baseDomain('careers.acme.co.in')).toBe('acme.co.in');
    expect(baseDomain('www.jobs.acme.com')).toBe('acme.com');
    expect(baseDomain('acme.io')).toBe('acme.io');
  });
});

describe('checkMx', () => {
  it('true with records, false for no domain or null MX, null when unsure', async () => {
    expect(await checkMx('acme.in', { resolveMx: async () => [{ exchange: 'mx.acme.in', priority: 10 }] })).toBe(true);
    expect(await checkMx('acme.in', { resolveMx: async () => [{ exchange: '.', priority: 0 }] })).toBe(false);
    expect(await checkMx('nope.in', { resolveMx: async () => { throw dnsError('ENOTFOUND'); } })).toBe(false);
    expect(await checkMx('nomx.in', { resolveMx: async () => { throw dnsError('ENODATA'); } })).toBe(false);
    expect(await checkMx('slow.in', { resolveMx: async () => { throw dnsError('ETIMEOUT'); } })).toBe(null);
    expect(await checkMx('localhost')).toBe(false);
  });

  it('times out to null and caches per domain', async () => {
    expect(await checkMx('hang.in', { timeoutMs: 20, resolveMx: () => new Promise(() => {}) })).toBe(null);
    const resolveMx = vi.fn(async () => [{ exchange: 'mx.acme.in', priority: 1 }]);
    const cache = new Map();
    await checkMx('acme.in', { resolveMx, cache });
    await checkMx('ACME.in', { resolveMx, cache });
    expect(resolveMx).toHaveBeenCalledTimes(1);
  });
});

describe('checkEmail', () => {
  const ok = { resolveMx: async () => [{ exchange: 'mx', priority: 1 }] };

  it('validates syntax', () => {
    expect(isValidEmailSyntax('john.doe+test@domain.co.uk')).toBe(true);
    for (const bad of ['', 'plain', 'user@domain', '@domain.com', 'a..b@acme.in', 'a@acme .in', 'a.@acme.in']) {
      expect(isValidEmailSyntax(bad), bad).toBe(false);
    }
  });

  it('gives honest verdicts', async () => {
    expect((await checkEmail('bad', ok)).verdict).toBe('invalid');
    const good = await checkEmail(' Jane@Acme.in ', ok);
    expect(good).toMatchObject({ email: 'jane@acme.in', verdict: 'ok', addressType: 'personal', freeMail: false, mx: true });
    expect(good.note).toMatch(/does not prove/);
    expect((await checkEmail('jane@nomail.in', { resolveMx: async () => { throw dnsError('ENOTFOUND'); } })).verdict).toBe('no_mail_server');
    expect((await checkEmail('jane@flaky.in', { resolveMx: async () => { throw dnsError('ESERVFAIL'); } })).verdict).toBe('unknown');
  });
});

describe('SmtpSender', () => {
  it('uses implicit TLS on 465 and STARTTLS otherwise', () => {
    expect(transportOptions({ host: 'smtp.gmail.com', port: 465, user: 'a', pass: 'b' })).toMatchObject({ secure: true, requireTLS: false });
    expect(transportOptions({ host: 'smtp.gmail.com', port: 587, user: 'a', pass: 'b' })).toMatchObject({ secure: false, requireTLS: true });
  });

  it('sends one message and reports accepted/rejected', async () => {
    const sendMail = vi.fn(async () => ({ messageId: '<m1>', accepted: ['jane@acme.in'], rejected: [] }));
    const transport: MailTransport = { verify: vi.fn(async () => true), sendMail };
    const sender = new SmtpSender({ host: 'h', port: 587, user: 'me@gmail.com', pass: 'x' }, () => transport);
    await sender.verify();
    const res = await sender.send({ from: 'me@gmail.com', to: 'jane@acme.in', subject: 'Hi', text: 'Hello' });
    expect(res).toEqual({ messageId: '<m1>', accepted: ['jane@acme.in'], rejected: [] });
    expect(sendMail).toHaveBeenCalledWith({ from: 'me@gmail.com', to: 'jane@acme.in', subject: 'Hi', text: 'Hello' });
  });
});
