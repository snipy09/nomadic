export const SITE = 'https://nomadicai.vercel.app';
export const OG_IMAGE = `${SITE}/og.png`;
export const OG_ALT = 'Nomadic: your whole job search, in one window.';

export type PageId = 'home' | 'download' | 'terms' | 'privacy' | 'refunds' | 'notfound';

export interface PageMeta {
  path: string;
  title: string;
  description: string;
  /** Pages marked false are served with noindex and left out of the sitemap. */
  index: boolean;
  updated: string;
  priority: string;
}

/** One source for titles and descriptions: the prerender script and client-side navigation both read it. */
export const PAGES: Record<PageId, PageMeta> = {
  home: {
    path: '/',
    title: 'Nomadic: the whole job search, on your desktop',
    description:
      'Nomadic is a desktop app for the whole job search: learning roadmaps, openings read from company hiring pages, application forms that fill themselves, and one board to track it all.',
    index: true,
    updated: '2026-10-01',
    priority: '1.0',
  },
  download: {
    path: '/download',
    title: 'Nomadic for desktop: download coming soon',
    description:
      'Nomadic for Windows, macOS and Linux is coming soon. See what the first release does and where the installer will appear.',
    index: true,
    updated: '2026-10-01',
    priority: '0.8',
  },
  terms: {
    path: '/terms',
    title: 'Terms and Conditions | Nomadic',
    description:
      'The terms for using Nomadic, the desktop app for learning, finding jobs, applying and tracking applications.',
    index: true,
    updated: '2026-10-03',
    priority: '0.4',
  },
  privacy: {
    path: '/privacy',
    title: 'Privacy Policy | Nomadic',
    description:
      'How Nomadic handles your data: what is stored on your computer, what syncs to your account in India, who processes it, and your rights.',
    index: true,
    updated: '2026-10-03',
    priority: '0.4',
  },
  refunds: {
    path: '/refunds',
    title: 'Refund and Cancellation Policy | Nomadic',
    description: 'How refunds and cancellations work for Nomadic Pro and Max plans: monthly, no auto-renewal, 7-day refund.',
    index: true,
    updated: '2026-10-03',
    priority: '0.3',
  },
  notfound: {
    path: '/404',
    title: 'Page not found | Nomadic',
    description: 'This page does not exist. Go back to the Nomadic home page.',
    index: false,
    updated: '2026-10-01',
    priority: '0',
  },
};

export function pageForPath(pathname: string): PageId {
  const clean = pathname.replace(/\/+$/, '') || '/';
  const ids = Object.keys(PAGES) as PageId[];
  return ids.find((id) => id !== 'notfound' && PAGES[id].path === clean) ?? 'notfound';
}

const esc = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

interface Tag {
  tag: 'meta' | 'link';
  key: string;
  attrs: Record<string, string>;
}

function tagsFor(id: PageId): Tag[] {
  const page = PAGES[id];
  const url = SITE + (page.path === '/' ? '/' : page.path);
  const robots = page.index ? 'index, follow, max-image-preview:large' : 'noindex, follow';

  const tags: Tag[] = [
    { tag: 'meta', key: 'name=description', attrs: { name: 'description', content: page.description } },
    { tag: 'meta', key: 'name=robots', attrs: { name: 'robots', content: robots } },
    { tag: 'meta', key: 'property=og:type', attrs: { property: 'og:type', content: 'website' } },
    { tag: 'meta', key: 'property=og:site_name', attrs: { property: 'og:site_name', content: 'Nomadic' } },
    { tag: 'meta', key: 'property=og:locale', attrs: { property: 'og:locale', content: 'en_IN' } },
    { tag: 'meta', key: 'property=og:title', attrs: { property: 'og:title', content: page.title } },
    { tag: 'meta', key: 'property=og:description', attrs: { property: 'og:description', content: page.description } },
    { tag: 'meta', key: 'property=og:image', attrs: { property: 'og:image', content: OG_IMAGE } },
    { tag: 'meta', key: 'property=og:image:width', attrs: { property: 'og:image:width', content: '1200' } },
    { tag: 'meta', key: 'property=og:image:height', attrs: { property: 'og:image:height', content: '630' } },
    { tag: 'meta', key: 'property=og:image:alt', attrs: { property: 'og:image:alt', content: OG_ALT } },
    { tag: 'meta', key: 'name=twitter:card', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
    { tag: 'meta', key: 'name=twitter:title', attrs: { name: 'twitter:title', content: page.title } },
    { tag: 'meta', key: 'name=twitter:description', attrs: { name: 'twitter:description', content: page.description } },
    { tag: 'meta', key: 'name=twitter:image', attrs: { name: 'twitter:image', content: OG_IMAGE } },
    { tag: 'meta', key: 'name=twitter:image:alt', attrs: { name: 'twitter:image:alt', content: OG_ALT } },
  ];

  if (page.index) {
    tags.push(
      { tag: 'link', key: 'rel=canonical', attrs: { rel: 'canonical', href: url } },
      { tag: 'meta', key: 'property=og:url', attrs: { property: 'og:url', content: url } },
    );
  }
  return tags;
}

/** The `<head>` block for a page, as a string. Used by the prerender script at build time. */
export function headTags(id: PageId): string {
  const lines = [`<title>${esc(PAGES[id].title)}</title>`];
  for (const { tag, attrs } of tagsFor(id)) {
    const rendered = Object.entries(attrs)
      .map(([name, value]) => `${name}="${esc(value)}"`)
      .join(' ');
    lines.push(`<${tag} ${rendered} />`);
  }
  return lines.join('\n    ');
}

/** Keeps the tab title and share tags right when the visitor moves between pages without a reload. */
export function applyHead(id: PageId): void {
  document.title = PAGES[id].title;

  for (const { tag, key, attrs } of tagsFor(id)) {
    const [attrName, attrValue] = key.split('=');
    let el = document.head.querySelector<HTMLElement>(`${tag}[${attrName}="${attrValue}"]`);
    if (!el) {
      el = document.createElement(tag);
      el.setAttribute(attrName, attrValue);
      document.head.appendChild(el);
    }
    for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
  }

  // Indexable pages carry canonical and og:url; a noindex page must not keep the previous page's.
  if (!PAGES[id].index) {
    document.head.querySelector('link[rel="canonical"]')?.remove();
    document.head.querySelector('meta[property="og:url"]')?.remove();
  }
}
