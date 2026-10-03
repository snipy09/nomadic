import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_FROM,
  RESEND_ENDPOINT,
  handleSendEmailCode,
  type RequestCodeRow,
  type SendEmailCodeDeps,
} from '../../functions/send-email-code/handler.ts';
import { buildEmail } from '../../functions/send-email-code/template.ts';

const USER_ID = '11111111-2222-3333-4444-555555555555';

function post(body: unknown): Request {
  return new Request('https://x.supabase.co/functions/v1/send-email-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function deps(row: RequestCodeRow | null | Error, opts: { from?: string | null; resend?: Response; key?: string | null } = {}) {
  const fetchMock = vi.fn(async () => opts.resend ?? new Response(JSON.stringify({ id: 'em_1' }), { status: 200 }));
  const log = vi.fn();
  const pending: Promise<unknown>[] = [];
  const d: SendEmailCodeDeps = {
    requestCode: vi.fn(async () => {
      if (row instanceof Error) throw row;
      return row;
    }),
    getSecret: vi.fn(async (name: string) =>
      name === 'resend_api_key' ? (opts.key === undefined ? 're_test_key' : opts.key) : (opts.from ?? null)),
    fetch: fetchMock as unknown as typeof fetch,
    waitUntil: (p) => { pending.push(p); },
    log,
  };
  return { d, fetchMock, log, flush: () => Promise.all(pending) };
}

async function body(res: Response) {
  return { status: res.status, json: await res.json() };
}

describe('send-email-code: reset', () => {
  it('sends the code with Resend and answers { ok: true }', async () => {
    const { d, fetchMock, flush } = deps({ status: 'send', code: '042917', email: 'asha@example.com' });
    const res = await body(await handleSendEmailCode(post({ purpose: 'reset', email: ' Asha@Example.com ' }), d));
    expect(res).toEqual({ status: 200, json: { ok: true } });
    expect(d.requestCode).toHaveBeenCalledWith({
      email: 'asha@example.com', purpose: 'reset', userId: null, sessionToken: null, deviceFingerprint: null,
    });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(RESEND_ENDPOINT);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_test_key');
    const sent = JSON.parse(String(init.body));
    expect(sent.from).toBe(DEFAULT_FROM);
    expect(sent.to).toEqual(['asha@example.com']);
    expect(sent.text).toContain('042917');
    expect(sent.html).toContain('042917');
    expect(sent.text).toMatch(/15 minutes/);
    expect(sent.text).toMatch(/ignore this email/);
  });

  it('uses the email_from secret when it is set', async () => {
    const { d, fetchMock, flush } = deps({ status: 'send', code: '123456', email: 'a@b.co' }, { from: 'Nomadic <hello@nomadic.app>' });
    await handleSendEmailCode(post({ purpose: 'reset', email: 'a@b.co' }), d);
    await flush();
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(String(init.body)).from).toBe('Nomadic <hello@nomadic.app>');
  });

  it('answers an unknown or rate-limited email exactly like a real one, and sends nothing', async () => {
    const real = deps({ status: 'send', code: '123456', email: 'a@b.co' });
    const unknown = deps({ status: 'skip', code: null, email: null });
    const empty = deps(null);
    const a = await handleSendEmailCode(post({ purpose: 'reset', email: 'a@b.co' }), real.d);
    const b = await handleSendEmailCode(post({ purpose: 'reset', email: 'nobody@b.co' }), unknown.d);
    const c = await handleSendEmailCode(post({ purpose: 'reset', email: 'nobody@b.co' }), empty.d);
    const texts = await Promise.all([a, b, c].map((r) => r.text()));
    expect(new Set([a.status, b.status, c.status])).toEqual(new Set([200]));
    expect(new Set(texts).size).toBe(1);
    expect([...a.headers.entries()]).toEqual([...b.headers.entries()]);
    await unknown.flush();
    expect(unknown.fetchMock).not.toHaveBeenCalled();
  });

  it('hides a Resend failure from the caller and logs it without the code, key or address', async () => {
    const { d, log, flush } = deps(
      { status: 'send', code: '987654', email: 'asha@example.com' },
      { resend: new Response(JSON.stringify({ name: 'validation_error', message: 'only to your own email' }), { status: 403 }) }
    );
    const res = await body(await handleSendEmailCode(post({ purpose: 'reset', email: 'asha@example.com' }), d));
    expect(res).toEqual({ status: 200, json: { ok: true } });
    await flush();
    const logged = log.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toMatch(/HTTP 403 validation_error/);
    expect(logged).toMatch(/onboarding@resend\.dev/);
    expect(logged).not.toContain('987654');
    expect(logged).not.toContain('re_test_key');
    expect(logged).not.toContain('asha@example.com');
  });

  it('still answers { ok: true } when the Resend key is missing', async () => {
    const { d, fetchMock, flush, log } = deps({ status: 'send', code: '123456', email: 'a@b.co' }, { key: null });
    const res = await body(await handleSendEmailCode(post({ purpose: 'reset', email: 'a@b.co' }), d));
    expect(res.status).toBe(200);
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/resend_api_key is not set/));
  });

  it('rejects malformed requests and other methods', async () => {
    const { d } = deps({ status: 'skip', code: null, email: null });
    expect((await handleSendEmailCode(post('not json'), d)).status).toBe(400);
    expect((await handleSendEmailCode(post({ purpose: 'reset' }), d)).status).toBe(400);
    expect((await handleSendEmailCode(post({ purpose: 'other', email: 'a@b.co' }), d)).status).toBe(400);
    expect((await handleSendEmailCode(new Request('https://x/f', { method: 'GET' }), d)).status).toBe(405);
    expect(d.requestCode).not.toHaveBeenCalled();
  });

  it('returns 503 when the database call fails', async () => {
    const { d } = deps(new Error('db down'));
    expect((await handleSendEmailCode(post({ purpose: 'reset', email: 'a@b.co' }), d)).status).toBe(503);
  });
});

describe('send-email-code: verify', () => {
  const session = { purpose: 'verify', user_id: USER_ID, session_token: 'tok', device_fingerprint: 'fp' };

  it('passes the session to request_email_code and never a client email', async () => {
    const { d, fetchMock } = deps({ status: 'send', code: '555111', email: 'asha@example.com' });
    const res = await body(await handleSendEmailCode(post({ ...session, email: 'attacker@evil.test' }), d));
    expect(res).toEqual({ status: 200, json: { ok: true } });
    expect(d.requestCode).toHaveBeenCalledWith({
      email: null, purpose: 'verify', userId: USER_ID, sessionToken: 'tok', deviceFingerprint: 'fp',
    });
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(String(init.body)).to).toEqual(['asha@example.com']);
  });

  it('requires session fields', async () => {
    const { d } = deps({ status: 'send', code: '555111', email: 'a@b.co' });
    expect((await handleSendEmailCode(post({ purpose: 'verify', user_id: USER_ID }), d)).status).toBe(400);
    expect((await handleSendEmailCode(post({ ...session, user_id: 'not-a-uuid' }), d)).status).toBe(400);
  });

  it('maps statuses', async () => {
    const cases: Array<[string, number, Record<string, unknown>]> = [
      ['unauthorized', 401, { ok: false, error: 'unauthorized' }],
      ['rate_limited', 429, { ok: false, error: 'rate_limited' }],
      ['already_verified', 200, { ok: true, alreadyVerified: true }],
    ];
    for (const [status, code, json] of cases) {
      const { d } = deps({ status, code: null, email: null });
      expect(await body(await handleSendEmailCode(post(session), d))).toEqual({ status: code, json });
    }
  });

  it('reports a failed send', async () => {
    const { d } = deps({ status: 'send', code: '555111', email: 'a@b.co' }, { resend: new Response('{}', { status: 500 }) });
    expect(await body(await handleSendEmailCode(post(session), d))).toEqual({ status: 502, json: { ok: false, error: 'email_failed' } });
  });
});

describe('buildEmail', () => {
  it('builds both purposes and refuses anything but six digits', () => {
    expect(buildEmail('verify', '000123').subject).toMatch(/verify/i);
    expect(buildEmail('reset', '000123').subject).toMatch(/reset/i);
    expect(() => buildEmail('reset', '<b>12</b>')).toThrow();
  });
});
