import { CONTACT_EMAIL, LEGAL_NAME } from '@nomadic/config';
import { FAQS, PLANS } from './content';
import { OG_IMAGE, PAGES, PageId, SITE } from './seo';

const ORG_ID = `${SITE}/#organization`;
const SITE_ID = `${SITE}/#website`;

const organization = {
  '@type': 'Organization',
  '@id': ORG_ID,
  name: 'Nomadic',
  legalName: LEGAL_NAME,
  url: `${SITE}/`,
  logo: `${SITE}/logo-icon.png`,
  email: CONTACT_EMAIL,
};

const website = {
  '@type': 'WebSite',
  '@id': SITE_ID,
  url: `${SITE}/`,
  name: 'Nomadic',
  inLanguage: 'en',
  publisher: { '@id': ORG_ID },
};

/** Prices come from the same plan list the pricing section renders. */
function offers() {
  return PLANS.map((plan) => ({
    '@type': 'Offer',
    name: plan.name,
    price: plan.price.replace(/[^\d.]/g, '') || '0',
    priceCurrency: 'INR',
    description: plan.summary,
    // The download is not public yet, so the offer is listed as not yet on sale.
    availability: 'https://schema.org/PreOrder',
    url: `${SITE}/#pricing`,
  }));
}

function breadcrumbs(id: PageId) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Nomadic', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: PAGES[id].title.split(/[:|]/)[0].trim(), item: SITE + PAGES[id].path },
    ],
  };
}

function webPage(id: PageId) {
  return {
    '@type': 'WebPage',
    '@id': `${SITE}${PAGES[id].path}#webpage`,
    url: SITE + PAGES[id].path,
    name: PAGES[id].title,
    description: PAGES[id].description,
    isPartOf: { '@id': SITE_ID },
    inLanguage: 'en',
    dateModified: PAGES[id].updated,
  };
}

/** Structured data for a page, or null when the page should carry none. */
export function jsonLd(id: PageId): object | null {
  if (id === 'notfound') return null;

  if (id === 'home') {
    return {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'SoftwareApplication',
          '@id': `${SITE}/#software`,
          name: 'Nomadic',
          applicationCategory: 'BusinessApplication',
          // Decision 2: Windows at launch; macOS after the beta.
          operatingSystem: 'Windows',
          description: PAGES.home.description,
          url: `${SITE}/`,
          image: OG_IMAGE,
          publisher: { '@id': ORG_ID },
          offers: offers(),
        },
        organization,
        website,
        webPage('home'),
        {
          '@type': 'FAQPage',
          '@id': `${SITE}/#faq`,
          mainEntity: FAQS.map((item) => ({
            '@type': 'Question',
            name: item.q,
            acceptedAnswer: { '@type': 'Answer', text: item.a },
          })),
        },
      ],
    };
  }

  return {
    '@context': 'https://schema.org',
    '@graph': [organization, website, webPage(id), breadcrumbs(id)],
  };
}
