import { describe, it, expect } from 'vitest';
import {
  parseAuthEmailRequest, passwordResetEmail, resendPayload, verificationEmail,
} from '../../functions/auth-email/emails';

const UID = '33333333-3333-3333-3333-333333333333';

describe('parseAuthEmailRequest', () => {
  it('normalises a password reset email', () => {
    expect(parseAuthEmailRequest({ action: 'password_reset', email: '  Asha@Example.COM ' })).toEqual({
      action: 'password_reset', email: 'asha@example.com',
    });
  });

  it('rejects an invalid email', () => {
    expect(parseAuthEmailRequest({ action: 'password_reset', email: 'not-an-email' })).toEqual({ error: 'Enter a valid email address.' });
  });

  it('requires a full session for verification', () => {
    expect(parseAuthEmailRequest({ action: 'email_verification', user_id: UID, session_token: 't', device_fingerprint: 'f' })).toEqual({
      action: 'email_verification', userId: UID, sessionToken: 't', deviceFingerprint: 'f',
    });
    expect(parseAuthEmailRequest({ action: 'email_verification', user_id: 'nope', session_token: 't', device_fingerprint: 'f' }))
      .toEqual({ error: 'Sign in again to verify your email.' });
    expect(parseAuthEmailRequest({ action: 'email_verification', user_id: UID, session_token: '', device_fingerprint: 'f' }))
      .toEqual({ error: 'Sign in again to verify your email.' });
  });

  it('rejects unknown actions and non-objects', () => {
    expect(parseAuthEmailRequest({ action: 'delete_everything' })).toEqual({ error: 'Unknown action.' });
    expect(parseAuthEmailRequest('x')).toEqual({ error: 'Invalid request.' });
  });
});

describe('email content', () => {
  it('puts the code in subject and body, with no links', () => {
    const e = passwordResetEmail('Asha Rao', '12345678');
    expect(e.subject).toBe('12345678 is your Nomadic password reset code');
    expect(e.text).toContain('Hi Asha,');
    expect(e.text).toContain('12345678');
    expect(e.text).toContain('30 minutes');
    expect(e.html).toContain('12345678');
    expect(e.html).not.toMatch(/href=|https?:\/\//);
    expect(e.text).not.toMatch(/https?:\/\//);
  });

  it('escapes the name in HTML and falls back when there is none', () => {
    const e = verificationEmail('<script>x</script>', '87654321');
    expect(e.html).not.toContain('<script>');
    expect(e.html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(verificationEmail(null, '87654321').text.startsWith('Hi,')).toBe(true);
    expect(verificationEmail(null, '87654321').text).toContain('24 hours');
  });

  it('builds the Resend body from the configured sender', () => {
    const content = verificationEmail('A', '11112222');
    expect(resendPayload('Nomadic <no-reply@example.com>', 'a@b.co', content)).toEqual({
      from: 'Nomadic <no-reply@example.com>', to: ['a@b.co'], subject: content.subject, text: content.text, html: content.html,
    });
  });
});
