import { SITE, PLANS, FAQS } from '../config/site';

export type RouteId = 'home' | 'download' | 'terms' | 'privacy' | 'notfound';

export interface RouteMeta {
  id: RouteId;
  path: string;
  title: string;
  description: string;
  noindex?: boolean;
  /** Sitemap hints. Routes without these are left out of the sitemap. */
  priority?: number;
  changefreq?: 'daily' | 'weekly' | 'monthly';
}

export const ROUTES: Record<Exclude<RouteId, 'notfound'>, RouteMeta> = {
  home: {
    id: 'home',
    path: '/',
    title: 'Nomadic — AI Job Search, Auto Apply & Career Roadmaps',
    description: SITE.description,
    priority: 1.0,
    changefreq: 'weekly',
  },
  download: {
    id: 'download',
    path: '/download',
    title: 'Join the Nomadic Alpha — Get the Desktop App',
    description:
      'Reserve one of 100 seats in the Nomadic closed alpha for ₹99. Get the desktop app with full Max access: auto-apply, the live job feed, roadmaps and recruiter outreach.',
    priority: 0.9,
    changefreq: 'weekly',
  },
  terms: {
    id: 'terms',
    path: '/terms',
    title: 'Terms of Service — Nomadic',
    description: 'The terms for licensing and using the Nomadic desktop app.',
    priority: 0.3,
    changefreq: 'monthly',
  },
  privacy: {
    id: 'privacy',
    path: '/privacy',
    title: 'Privacy Policy — Nomadic',
    description:
      'How Nomadic handles your data: your profile and resumes stay on your computer, and only account essentials sync to the cloud.',
    priority: 0.4,
    changefreq: 'monthly',
  },
};

export const NOT_FOUND: RouteMeta = {
  id: 'notfound',
  path: '/404',
  title: 'Page not found — Nomadic',
  description: 'This page does not exist.',
  noindex: true,
};

export function normalizePath(pathname: string): string {
  const p = pathname.replace(/\/index\.html$/, '').replace(/\/+$/, '');
  return p === '' ? '/' : p;
}

export function matchRoute(pathname: string): RouteMeta {
  const path = normalizePath(pathname);
  return Object.values(ROUTES).find((r) => r.path === path) ?? NOT_FOUND;
}

export const absoluteUrl = (path: string) => (path === '/' ? `${SITE.url}/` : `${SITE.url}${path}`);

const ORG_ID = `${SITE.url}/#organization`;
const SITE_ID = `${SITE.url}/#website`;
const APP_ID = `${SITE.url}/#software`;

function structuredData(route: RouteMeta): object {
  const graph: object[] = [
    {
      '@type': 'Organization',
      '@id': ORG_ID,
      name: SITE.name,
      legalName: SITE.legalName,
      url: `${SITE.url}/`,
      logo: { '@type': 'ImageObject', url: `${SITE.url}/icon-512.png`, width: 512, height: 512 },
      email: SITE.supportEmail,
      sameAs: [SITE.github],
    },
    {
      '@type': 'WebSite',
      '@id': SITE_ID,
      url: `${SITE.url}/`,
      name: SITE.name,
      description: SITE.description,
      inLanguage: 'en',
      publisher: { '@id': ORG_ID },
    },
    {
      '@type': 'WebPage',
      '@id': `${absoluteUrl(route.path)}#webpage`,
      url: absoluteUrl(route.path),
      name: route.title,
      description: route.description,
      isPartOf: { '@id': SITE_ID },
      about: { '@id': APP_ID },
      inLanguage: 'en',
    },
  ];

  if (route.id === 'home' || route.id === 'download') {
    graph.push({
      '@type': 'SoftwareApplication',
      '@id': APP_ID,
      name: SITE.name,
      alternateName: ['Nomadic Job Search', 'Nomadic Auto Apply'],
      description: SITE.description,
      url: `${SITE.url}/`,
      downloadUrl: absoluteUrl('/download'),
      image: `${SITE.url}${SITE.ogImage}`,
      operatingSystem: SITE.platforms.join(', '),
      applicationCategory: 'BusinessApplication',
      applicationSubCategory: 'Job search',
      softwareVersion: SITE.version,
      publisher: { '@id': ORG_ID },
      offers: PLANS.map((p) => ({
        '@type': 'Offer',
        name: `${p.name} plan`,
        price: String(p.price),
        priceCurrency: 'INR',
        description: p.features.join(', '),
        url: absoluteUrl('/#pricing'),
      })),
    });
  }

  if (route.id === 'home') {
    graph.push({
      '@type': 'FAQPage',
      '@id': `${SITE.url}/#faq`,
      mainEntity: FAQS.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    });
  } else if (route.id !== 'notfound') {
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE.url}/` },
        { '@type': 'ListItem', position: 2, name: route.title.split(' — ')[0], item: absoluteUrl(route.path) },
      ],
    });
  }

  return { '@context': 'https://schema.org', '@graph': graph };
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Route-specific <head> tags, injected into the prerendered HTML at build time. */
export function renderHead(route: RouteMeta): string {
  const url = absoluteUrl(route.path);
  const image = `${SITE.url}${SITE.ogImage}`;
  const tags = [
    `<title>${esc(route.title)}</title>`,
    `<meta name="description" content="${esc(route.description)}" />`,
    `<meta name="robots" content="${route.noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'}" />`,
    route.noindex ? '' : `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${SITE.name}" />`,
    `<meta property="og:locale" content="en_US" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:title" content="${esc(route.title)}" />`,
    `<meta property="og:description" content="${esc(route.description)}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="Nomadic — learn, find jobs and auto-apply from one desktop app" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(route.title)}" />`,
    `<meta name="twitter:description" content="${esc(route.description)}" />`,
    `<meta name="twitter:image" content="${image}" />`,
    route.noindex
      ? ''
      : `<script type="application/ld+json">${JSON.stringify(structuredData(route)).replace(/</g, '\\u003c')}</script>`,
  ];
  return tags.filter(Boolean).join('\n    ');
}

/** Keeps title/description/canonical in sync during client-side navigation. */
export function applyHead(route: RouteMeta) {
  document.title = route.title;
  const set = (selector: string, attr: string, value: string) => {
    document.querySelector(selector)?.setAttribute(attr, value);
  };
  const url = absoluteUrl(route.path);
  set('meta[name="description"]', 'content', route.description);
  set('link[rel="canonical"]', 'href', url);
  set('meta[property="og:url"]', 'content', url);
  set('meta[property="og:title"]', 'content', route.title);
  set('meta[property="og:description"]', 'content', route.description);
  set('meta[name="twitter:title"]', 'content', route.title);
  set('meta[name="twitter:description"]', 'content', route.description);
}
