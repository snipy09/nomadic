import { describe, expect, it } from 'vitest';
import { decodeEntities, deobfuscate, extractEmails, htmlToText, isPlausibleAddress, snippetAround } from '../extract.ts';

const emails = (text: string) => extractEmails(text).found.map((f) => f.email);

describe('decodeEntities', () => {
  it('decodes numeric, hex and named entities', () => {
    expect(decodeEntities('jane&#64;acme.in')).toBe('jane@acme.in');
    expect(decodeEntities('jane&#x40;acme&#46;in')).toBe('jane@acme.in');
    expect(decodeEntities('jane&commat;acme&period;in &amp; co')).toBe('jane@acme.in & co');
    expect(decodeEntities('&unknownthing;')).toBe('&unknownthing;');
  });
});

describe('htmlToText', () => {
  it('keeps mailto targets and turns paragraphs into lines', () => {
    const html = 'Acme | SWE | Remote<p>Write to <a href="mailto:jane%2Bhn@acme.in?subject=Hi">me</a>.</p><script>var x="spam@bad.in"</script>';
    const text = htmlToText(html);
    expect(text).toContain('jane+hn@acme.in');
    expect(text).toContain('Acme | SWE | Remote\n');
    expect(text).not.toContain('spam@bad.in');
  });
});

describe('deobfuscate', () => {
  it('rewrites bracketed at/dot', () => {
    expect(deobfuscate('jane [at] acme [dot] in')).toBe('jane@acme.in');
    expect(deobfuscate('jane(at)acme(dot)co(dot)in')).toBe('jane@acme.co.in');
    expect(deobfuscate('jane {AT} acme.in')).toBe('jane@acme.in');
    expect(deobfuscate('jane@acme[.]in')).toBe('jane@acme.in');
  });

  it('rewrites bare words only when the domain uses dot', () => {
    expect(deobfuscate('mail jane at acme dot in')).toBe('mail jane@acme.in');
    expect(deobfuscate('we are hiring at acme.in')).toBe('we are hiring at acme.in');
    expect(deobfuscate('jane @ acme.in')).toBe('jane@acme.in');
  });
});

describe('extractEmails', () => {
  it('finds plain and obfuscated addresses once each, lowercased', () => {
    expect(emails('Contact Jane.Doe@Acme.in or jane.doe@acme.in, also hr [at] acme [dot] in.')).toEqual(['jane.doe@acme.in', 'hr@acme.in']);
  });

  it('drops file names, placeholders, no-reply and tracking ids', () => {
    const text = 'logo@2x.png you@example.com noreply@acme.in do-not-reply@acme.in 3f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c@o1.ingest.sentry.io real@acme.in';
    expect(emails(text)).toEqual(['real@acme.in']);
  });

  it('stops at characters that cannot be in an address', () => {
    expect(emails('see https://x.in/a?b=jane@acme.in')).toEqual(['jane@acme.in']);
    expect(emails('<jane@acme.in>, "raj@acme.in"')).toEqual(['jane@acme.in', 'raj@acme.in']);
  });

  it('returns indexes into the normalised text', () => {
    const { text, found } = extractEmails('Ping jane [at] acme [dot] in today');
    expect(text.slice(found[0].index, found[0].index + 12)).toBe('jane@acme.in');
  });
});

describe('isPlausibleAddress', () => {
  it('rejects bad local parts and long addresses', () => {
    expect(isPlausibleAddress('.jane@acme.in')).toBe(false);
    expect(isPlausibleAddress('ja..ne@acme.in')).toBe(false);
    expect(isPlausibleAddress(`${'a'.repeat(65)}@acme.in`)).toBe(false);
    expect(isPlausibleAddress('jane@acme.in')).toBe(true);
  });
});

describe('snippetAround', () => {
  it('cuts the sentence around the address', () => {
    const text = 'We build payments. If you are interested, email jane@acme.in with your resume. Visa not offered.';
    const idx = text.indexOf('jane@');
    expect(snippetAround(text, idx)).toBe('If you are interested, email jane@acme.in with your resume.');
  });

  it('caps the length', () => {
    const text = `${'word '.repeat(200)}jane@acme.in ${'word '.repeat(200)}`;
    expect(snippetAround(text, text.indexOf('jane@'), 100).length).toBeLessThanOrEqual(100);
  });
});
