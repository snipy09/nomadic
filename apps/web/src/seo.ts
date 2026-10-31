import { ANDROID_DOWNLOAD, pricingSentence } from '@nomadic/config';

export const SITE = 'https://nomadicai.vercel.app';

/** Share-card image for a page; generated at build time by scripts/og.mjs from `og` below. */
export const ogImageFor = (id: PageId) => `${SITE}/og/${id === 'notfound' ? 'home' : id}.png`;
export const OG_IMAGE = ogImageFor('home');

export type PageId = 'home' | 'download' | 'terms' | 'privacy' | 'refunds' | 'shipping' | 'contact' | 'services' | 'about' | 'notfound';

export interface PageMeta {
  path: string;
  title: string;
  description: string;
  /** Pages marked false are served with noindex and left out of the sitemap. */
  index: boolean;
  updated: string;
  priority: string;
  /** Text on the page's share card. */
  og: { heading: string; sub: string };
}

/** One source for titles and descriptions: the prerender script and client-side navigation both read it. */
export const PAGES: Record<PageId, PageMeta> = {
  home: {
    path: '/',
    title: 'Nomadic: the whole job search, on your desktop',
    description:
      'Nomadic is a desktop app for job seekers in India: a learning roadmap for any role, a guided capstone project, jobs from company hiring pages matched to your skills, application forms filled for you to review, and one board to track it all.',
    index: true,
    updated: '2026-10-31',
    priority: '1.0',
    og: { heading: 'Your whole job search, in one window.', sub: pricingSentence() },
  },
  download: {
    path: '/download',
    title: ANDROID_DOWNLOAD.version ? 'Download Nomadic for Windows, Mac and Android' : 'Download Nomadic for Windows and Mac',
    description: ANDROID_DOWNLOAD.version
      ? `Download Nomadic free for Windows 10/11, macOS (Apple Silicon and Intel) and Android ${ANDROID_DOWNLOAD.minimumAndroid}+, with step-by-step install guides.`
      : 'Download Nomadic free for Windows 10/11 and macOS (Apple Silicon and Intel), with step-by-step install guides. Android is coming soon.',
    index: true,
    updated: '2026-10-18',
    priority: '0.8',
    og: {
      heading: 'Download Nomadic',
      sub: ANDROID_DOWNLOAD.version ? 'Free for Windows, macOS and Android. Install guides included.' : 'Free for Windows and macOS. Install guides included.',
    },
  },
  terms: {
    path: '/terms',
    title: 'Terms and Conditions | Nomadic',
    description:
      'The terms for using Nomadic, the desktop app for learning, finding jobs, applying and tracking applications.',
    index: true,
    updated: '2026-10-03',
    priority: '0.4',
    og: { heading: 'Terms of Service', sub: 'Using Nomadic, plans and payments.' },
  },
  privacy: {
    path: '/privacy',
    title: 'Privacy Policy | Nomadic',
    description:
      'How Nomadic handles your data: what is stored on your computer, what syncs to your account in India, who processes it, and your rights.',
    index: true,
    updated: '2026-10-07',
    priority: '0.4',
    og: { heading: 'Privacy Policy', sub: 'What stays on your computer, what syncs, and who sees it.' },
  },
  refunds: {
    path: '/refunds',
    title: 'Refund and Cancellation Policy | Nomadic',
    description: 'Refund and cancellation policy for Nomadic Pro and Max plans: 30-day plans, no auto-renewal, payment errors refunded in 5 to 7 working days.',
    index: true,
    updated: '2026-10-28',
    priority: '0.3',
    og: { heading: 'Refund and Cancellation', sub: '30-day plans, no auto-renewal, errors refunded in 5 to 7 days.' },
  },
  shipping: {
    path: '/shipping',
    title: 'Shipping and Delivery Policy | Nomadic',
    description: 'Nomadic is digital software: nothing is shipped, and a paid plan is activated within minutes of payment.',
    index: true,
    updated: '2026-10-28',
    priority: '0.3',
    og: { heading: 'Shipping and Delivery', sub: 'Digital software. Plans activate within minutes.' },
  },
  contact: {
    path: '/contact',
    title: 'Contact Us | Nomadic',
    description: 'Contact Nomadic: operator, address, email and phone for support, payments and grievances.',
    index: true,
    updated: '2026-10-28',
    priority: '0.4',
    og: { heading: 'Contact us', sub: 'Support, payments and grievances.' },
  },
  services: {
    path: '/services',
    title: 'Services and Pricing | Nomadic',
    description: 'What Nomadic includes, the Free, Pro and Max plans with prices in INR, and how online payment works.',
    index: true,
    updated: '2026-10-28',
    priority: '0.8',
    og: { heading: 'Services and pricing', sub: 'Free, Pro and Max plans in INR.' },
  },
  about: {
    path: '/about',
    title: 'About Us | Nomadic',
    description: 'Nomadic is a career app for job seekers in India: learning roadmap, practice, jobs, reviewed applications and a tracker.',
    index: true,
    updated: '2026-10-28',
    priority: '0.5',
    og: { heading: 'About Nomadic', sub: 'A career app for job seekers in India.' },
  },
  notfound: {
    path: '/404',
    title: 'Page not found | Nomadic',
    description: 'This page does not exist. Go back to the Nomadic home page.',
    index: false,
    updated: '2026-10-01',
    priority: '0',
    og: { heading: 'Page not found', sub: 'Go back to the Nomadic home page.' },
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
    { tag: 'meta', key: 'property=og:image', attrs: { property: 'og:image', content: ogImageFor(id) } },
    { tag: 'meta', key: 'property=og:image:width', attrs: { property: 'og:image:width', content: '1200' } },
    { tag: 'meta', key: 'property=og:image:height', attrs: { property: 'og:image:height', content: '630' } },
    { tag: 'meta', key: 'property=og:image:alt', attrs: { property: 'og:image:alt', content: `${page.og.heading} ${page.og.sub}` } },
    { tag: 'meta', key: 'name=twitter:card', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
    { tag: 'meta', key: 'name=twitter:title', attrs: { name: 'twitter:title', content: page.title } },
    { tag: 'meta', key: 'name=twitter:description', attrs: { name: 'twitter:description', content: page.description } },
    { tag: 'meta', key: 'name=twitter:image', attrs: { name: 'twitter:image', content: ogImageFor(id) } },
    { tag: 'meta', key: 'name=twitter:image:alt', attrs: { name: 'twitter:image:alt', content: `${page.og.heading} ${page.og.sub}` } },
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
