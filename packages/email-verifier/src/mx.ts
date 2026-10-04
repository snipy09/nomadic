/**
 * Mail-server check for a domain (DNS MX lookup). This is the honest limit of what can be
 * checked without contacting the mail server: a domain with a mail server can still reject
 * the mailbox. No SMTP probing is done on purpose (servers treat it as spam behaviour).
 */
import { promises as dns } from 'node:dns';

/** true = the domain has a mail server, false = it cannot receive mail, null = could not tell. */
export type MxResult = boolean | null;

export interface MxRecord {
  exchange: string;
  priority: number;
}

export interface MxOptions {
  resolveMx?: (domain: string) => Promise<MxRecord[]>;
  timeoutMs?: number;
  /** Shared per-run cache so a batch looks each domain up once. */
  cache?: Map<string, Promise<MxResult>>;
}

const NO_MAIL_CODES = new Set(['ENOTFOUND', 'ENODATA', 'NXDOMAIN', 'ENONAME']);

async function lookup(domain: string, resolveMx: (d: string) => Promise<MxRecord[]>, timeoutMs: number): Promise<MxResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs);
  });
  try {
    const records = await Promise.race([resolveMx(domain), timeout]);
    if (records === 'timeout') return null;
    // RFC 7505 "null MX" (a single "." record) says the domain accepts no mail.
    const usable = records.filter((r) => r.exchange && r.exchange !== '.');
    return usable.length > 0;
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    return code && NO_MAIL_CODES.has(code) ? false : null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function checkMx(domain: string, opts: MxOptions = {}): Promise<MxResult> {
  const d = domain.trim().toLowerCase().replace(/\.$/, '');
  if (!d || !d.includes('.')) return Promise.resolve(false);
  const cached = opts.cache?.get(d);
  if (cached) return cached;
  const p = lookup(d, opts.resolveMx ?? ((x) => dns.resolveMx(x)), opts.timeoutMs ?? 5000);
  opts.cache?.set(d, p);
  return p;
}
