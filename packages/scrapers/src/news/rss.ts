import { decodeEntities, htmlToText } from '../pipeline/normalize.js';

/**
 * A small RSS 2.0 / Atom reader: enough for publisher feeds (title, link, date, summary). No XML library is needed
 * for these flat documents; CDATA and entities are handled, anything unreadable is skipped.
 */

export interface FeedEntry {
  title: string;
  link: string;
  publishedAt: string | null;
  summary: string;
  categories: string[];
}

const unCdata = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');

function tag(block: string, names: string[]): string | null {
  for (const name of names) {
    const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i');
    const m = block.match(re);
    if (m) return unCdata(m[1]).trim();
  }
  return null;
}

function allTags(block: string, name: string): string[] {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'gi');
  return [...block.matchAll(re)].map((m) => unCdata(m[1]).trim()).filter(Boolean);
}

const text = (s: string | null, max: number) =>
  htmlToText(decodeEntities(s ?? '').replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16))), max)
    .replace(/\s+/g, ' ')
    .trim();

function date(value: string | null): string | null {
  if (!value) return null;
  const ms = Date.parse(value.trim());
  return Number.isFinite(ms) && ms > Date.UTC(2015, 0, 1) ? new Date(ms).toISOString() : null;
}

function atomLink(block: string): string {
  const links = [...block.matchAll(/<link\b([^>]*)\/?>/gi)].map((m) => m[1]);
  const pick = links.find((attrs) => !/rel=["'](?!alternate)/i.test(attrs)) ?? links[0] ?? '';
  return decodeEntities(pick.match(/href=["']([^"']+)["']/i)?.[1] ?? '');
}

export function parseFeed(xml: string): FeedEntry[] {
  const items = xml.match(/<item\b[\s\S]*?<\/item>/gi);
  const atom = !items;
  const blocks = items ?? xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? [];
  const out: FeedEntry[] = [];
  for (const block of blocks) {
    const title = text(tag(block, ['title']), 400);
    const rawLink = atom ? atomLink(block) : decodeEntities(tag(block, ['link']) ?? tag(block, ['guid']) ?? '');
    const link = rawLink.trim();
    if (!title || !/^https?:\/\//i.test(link)) continue;
    out.push({
      title,
      link,
      publishedAt: date(tag(block, ['pubDate', 'published', 'updated', 'dc:date'])),
      summary: text(tag(block, ['description', 'summary', 'content:encoded', 'content']), 600),
      categories: allTags(block, 'category').map((c) => text(c, 60)).filter(Boolean).slice(0, 10),
    });
  }
  return out;
}
