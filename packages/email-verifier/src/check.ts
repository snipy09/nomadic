/**
 * One honest verdict for an address: syntax, what kind of address it is, and whether its
 * domain can receive mail. Never claims a mailbox exists.
 */
import { addressType, emailDomain, isFreeMailDomain, type AddressType } from './classify.ts';
import { checkMx, type MxOptions, type MxResult } from './mx.ts';

export type EmailVerdict = 'ok' | 'no_mail_server' | 'invalid' | 'unknown';

export interface EmailCheck {
  email: string;
  syntaxOk: boolean;
  addressType: AddressType | null;
  freeMail: boolean;
  mx: MxResult;
  verdict: EmailVerdict;
  note: string;
}

const SYNTAX_RE = /^[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9_%+-])?@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/i;

export function isValidEmailSyntax(email: string): boolean {
  const e = email.trim();
  return e.length <= 254 && SYNTAX_RE.test(e) && !e.split('@')[0].includes('..');
}

export const VERDICT_NOTES: Record<EmailVerdict, string> = {
  ok: 'The domain accepts mail. This does not prove the mailbox exists.',
  no_mail_server: 'This domain has no mail server, so mail to this address would bounce.',
  invalid: 'This is not a valid email address.',
  unknown: 'The mail server could not be checked right now.',
};

export async function checkEmail(raw: string, opts: MxOptions = {}): Promise<EmailCheck> {
  const email = raw.trim().toLowerCase();
  if (!isValidEmailSyntax(email)) {
    return { email, syntaxOk: false, addressType: null, freeMail: false, mx: null, verdict: 'invalid', note: VERDICT_NOTES.invalid };
  }
  const domain = emailDomain(email);
  const mx = await checkMx(domain, opts);
  const verdict: EmailVerdict = mx === true ? 'ok' : mx === false ? 'no_mail_server' : 'unknown';
  return {
    email,
    syntaxOk: true,
    addressType: addressType(email),
    freeMail: isFreeMailDomain(domain),
    mx,
    verdict,
    note: VERDICT_NOTES[verdict],
  };
}
