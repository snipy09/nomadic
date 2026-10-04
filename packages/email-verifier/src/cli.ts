#!/usr/bin/env node
/**
 * npm run email:verify -- jane@acme.in careers@acme.in
 * Prints syntax, address type and the mail-server check for each address.
 */
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { checkEmail } from './check.ts';

export async function main(args: string[]): Promise<number> {
  if (args.length === 0) {
    console.error('Usage: npm run email:verify -- <address> [address...]');
    return 2;
  }
  const cache = new Map();
  let bad = 0;
  for (const a of args) {
    const r = await checkEmail(a, { cache });
    if (r.verdict === 'invalid' || r.verdict === 'no_mail_server') bad++;
    const kind = r.addressType ? `${r.addressType}${r.freeMail ? ', free mail' : ''}` : '-';
    console.log(`${r.email.padEnd(40)} ${r.verdict.padEnd(15)} ${kind.padEnd(20)} ${r.note}`);
  }
  return bad > 0 ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
