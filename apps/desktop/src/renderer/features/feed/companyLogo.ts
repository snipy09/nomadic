/**
 * Which web domain shows a company's logo. Only real, known facts: a curated name → domain list (every company
 * the feed scraper follows, plus common campus hirers), else the host of the company's own careers page.
 * Job boards, ATS vendors and forms are never used (their logo is not the employer's), and a domain is never
 * guessed from a name. Unknown stays unknown: the UI shows a monogram instead.
 */

/** Real company domains, keyed by `companyKey`. Covers `packages/scrapers/src/feed/companies.ts` (parity-tested). */
const KNOWN_DOMAINS: Record<string, string> = {
  // Feed companies (names as the scraper publishes them; logo domain, not the careers host).
  google: 'google.com', alphabet: 'google.com', microsoft: 'microsoft.com', amazon: 'amazon.com', aws: 'aws.amazon.com',
  amazonweb: 'aws.amazon.com', apple: 'apple.com', meta: 'meta.com', metaplatforms: 'meta.com', facebook: 'meta.com',
  netflix: 'netflix.com', oracle: 'oracle.com', adobe: 'adobe.com', salesforce: 'salesforce.com', ibm: 'ibm.com',
  cisco: 'cisco.com', uber: 'uber.com', linkedin: 'linkedin.com', atlassian: 'atlassian.com', walmartglobaltech: 'walmart.com',
  walmart: 'walmart.com', dell: 'dell.com', hp: 'hp.com', hewlettpackard: 'hp.com', hpe: 'hpe.com', hewlettpackardenterprise: 'hpe.com',
  samsung: 'samsung.com', samsungresearch: 'samsung.com', servicenow: 'servicenow.com', stripe: 'stripe.com',
  databricks: 'databricks.com', cloudflare: 'cloudflare.com', gitlab: 'gitlab.com', airbnb: 'airbnb.com', coinbase: 'coinbase.com',
  figma: 'figma.com', mongodb: 'mongodb.com', postman: 'postman.com', rubrik: 'rubrik.com', twilio: 'twilio.com', okta: 'okta.com',
  openai: 'openai.com', palantir: 'palantir.com', spotify: 'spotify.com', flipkart: 'flipkart.com', meesho: 'meesho.com',
  phonepe: 'phonepe.com', freshworks: 'freshworks.com', swiggy: 'swiggy.com', zomato: 'zomato.com', eternal: 'zomato.com',
  razorpay: 'razorpay.com', cred: 'cred.club', groww: 'groww.in', paytm: 'paytm.com', one97communications: 'paytm.com',
  zepto: 'zeptonow.com', zoho: 'zoho.com', browserstack: 'browserstack.com', jpmorganchase: 'jpmorganchase.com',
  jpmorgan: 'jpmorganchase.com', jpmorganchaseco: 'jpmorganchase.com', goldmansachs: 'goldmansachs.com', morganstanley: 'morganstanley.com',
  visa: 'visa.com', mastercard: 'mastercard.com', paypal: 'paypal.com', nvidia: 'nvidia.com', intel: 'intel.com',
  qualcomm: 'qualcomm.com', amd: 'amd.com', advancedmicrodevices: 'amd.com', texasinstruments: 'ti.com', tcs: 'tcs.com',
  tataconsultancy: 'tcs.com', infosys: 'infosys.com', wipro: 'wipro.com', hcltech: 'hcltech.com', hcl: 'hcltech.com',
  techmahindra: 'techmahindra.com', accenture: 'accenture.com', cognizant: 'cognizant.com', capgemini: 'capgemini.com',
  deloitte: 'deloitte.com',
  // Other common hirers of Indian graduates.
  ltimindtree: 'ltimindtree.com', mphasis: 'mphasis.com', persistent: 'persistent.com', hexaware: 'hexaware.com',
  ey: 'ey.com', ernstyoung: 'ey.com', kpmg: 'kpmg.com', pwc: 'pwc.com', thoughtworks: 'thoughtworks.com', sprinklr: 'sprinklr.com',
  myntra: 'myntra.com', nykaa: 'nykaa.com', makemytrip: 'makemytrip.com', zerodha: 'zerodha.com', juspay: 'juspay.in',
  chargebee: 'chargebee.com', innovaccer: 'innovaccer.com', druva: 'druva.com', hasura: 'hasura.io', atlan: 'atlan.com',
  inmobi: 'inmobi.com', sharechat: 'sharechat.com', dream11: 'dream11.com', unacademy: 'unacademy.com', upgrad: 'upgrad.com',
  urbancompany: 'urbancompany.com', lenskart: 'lenskart.com', policybazaar: 'policybazaar.com', delhivery: 'delhivery.com',
  cars24: 'cars24.com', spinny: 'spinny.com', bharatpe: 'bharatpe.com', dunzo: 'dunzo.com', udaan: 'udaan.com',
  americanexpress: 'americanexpress.com', amex: 'americanexpress.com', barclays: 'barclays.com', citi: 'citi.com', citigroup: 'citi.com',
  hsbc: 'hsbc.com', deutschebank: 'db.com', wellsfargo: 'wellsfargo.com', blackrock: 'blackrock.com', intuit: 'intuit.com',
  vmware: 'vmware.com', broadcom: 'broadcom.com', sap: 'sap.com', siemens: 'siemens.com', bosch: 'bosch.com',
  honeywell: 'honeywell.com', ge: 'ge.com', generalelectric: 'ge.com', shell: 'shell.com', synopsys: 'synopsys.com',
  cadence: 'cadence.com', cadencedesign: 'cadence.com', arm: 'arm.com', micron: 'micron.com', westerndigital: 'westerndigital.com',
  zscaler: 'zscaler.com', nutanix: 'nutanix.com', yahoo: 'yahoo.com', expedia: 'expedia.com', booking: 'booking.com',
  bookingcom: 'booking.com', target: 'target.com', lowes: 'lowes.com', tesco: 'tesco.com', ola: 'olacabs.com', olaelectric: 'olaelectric.com',
  oyo: 'oyorooms.com', swiggyinstamart: 'swiggy.com', blinkit: 'blinkit.com', bigbasket: 'bigbasket.com', jio: 'jio.com',
  reliancejio: 'jio.com', airtel: 'airtel.in', bhartiairtel: 'airtel.in', tatamotors: 'tatamotors.com', mahindra: 'mahindra.com',
  larsentoubro: 'larsentoubro.com', lt: 'larsentoubro.com', icicibank: 'icicibank.com', hdfcbank: 'hdfcbank.com', axisbank: 'axisbank.com',
  kotakmahindrabank: 'kotak.com', kotak: 'kotak.com',
};

/** Hosts of job boards, ATS vendors, forms and social sites: their logo is not the employer's. */
const NOT_EMPLOYER_HOSTS = [
  'greenhouse.io', 'lever.co', 'ashbyhq.com', 'myworkdayjobs.com', 'myworkdaysite.com', 'workday.com', 'smartrecruiters.com',
  'internshala.com', 'linkedin.com', 'naukri.com', 'indeed.com', 'indeed.co.in', 'wellfound.com', 'angel.co', 'instahyre.com',
  'cutshort.io', 'foundit.in', 'monsterindia.com', 'glassdoor.com', 'glassdoor.co.in', 'workable.com', 'breezy.hr', 'recruitee.com',
  'keka.com', 'darwinbox.in', 'darwinbox.com', 'freshteam.com', 'zohorecruit.com', 'zohorecruit.in', 'jobvite.com', 'icims.com',
  'taleo.net', 'successfactors.com', 'successfactors.eu', 'sapsf.com', 'sapsf.eu', 'bamboohr.com', 'teamtailor.com', 'personio.de',
  'personio.com', 'rippling.com', 'rippling-ats.com', 'remoteok.com', 'remoteok.io', 'weworkremotely.com', 'arbeitnow.com',
  'jobicy.com', 'himalayas.app', 'ycombinator.com', 'workatastartup.com', 'notion.site', 'notion.so', 'forms.gle', 'typeform.com',
  'airtable.com', 'github.io', 'medium.com', 'twitter.com', 'x.com', 'facebook.com', 'instagram.com', 'youtube.com', 'hirist.tech',
  'hirist.com', 'iimjobs.com', 'shine.com', 'timesjobs.com', 'apna.co', 'unstop.com', 'hackerearth.com', 'hackerrank.com', 'gem.com',
  'pinpointhq.com', 'jazzhr.com', 'applytojob.com', 'trakstar.com', 'recruiterbox.com', 'dover.com', 'dover.io', 'polymer.co',
  'workinstartups.com', 'oraclecloud.com', 'eightfold.ai', 'phenompeople.com', 'avature.net', 'jobs.net', 'careers-page.com',
  'superset.com', 'joinsuperset.com', 'devfolio.co', 'devpost.com', 'google.com', 'docs.google.com', 'bit.ly', 'lnkd.in',
];

/** Lower-case letters and digits only, after dropping legal suffixes and a parenthesised aside. */
export function companyKey(name: string): string {
  const words = name
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/&/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const SUFFIX = new Set(['private', 'pvt', 'ltd', 'limited', 'inc', 'incorporated', 'llc', 'llp', 'plc', 'corp', 'corporation', 'co', 'company', 'india', 'the', 'technologies', 'technology', 'services', 'solutions', 'software', 'systems', 'group', 'global', 'labs', 'and']);
  // Drop suffix words from the end (and a leading "the"), so "Google India Private Limited" → "google".
  while (words.length > 1 && SUFFIX.has(words[words.length - 1])) words.pop();
  if (words.length > 1 && words[0] === 'the') words.shift();
  return words.join('');
}

/**
 * The registrable part of a host ("careers.acme.co.in" → "acme.co.in"). Not a full public-suffix list; same rule
 * as `baseDomain` in `@job-automator/email-verifier`.
 */
export function baseDomain(host: string): string {
  const parts = host.toLowerCase().replace(/^www\./, '').split('.').filter(Boolean);
  if (parts.length <= 2) return parts.join('.');
  const twoLevel = /^(?:co|com|net|org|gov|edu|ac|res|gen|firm|ind)$/.test(parts[parts.length - 2]) && parts[parts.length - 1].length === 2;
  return parts.slice(twoLevel ? -3 : -2).join('.');
}

function isNotEmployerHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, '');
  return NOT_EMPLOYER_HOSTS.some((d) => h === d || h.endsWith(`.${d}`));
}

function hostOf(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** The known domain for a company name, or null. */
export function knownCompanyDomain(company: string | null | undefined): string | null {
  if (!company) return null;
  const key = companyKey(company);
  return key ? KNOWN_DOMAINS[key] ?? null : null;
}

/**
 * Domain whose logo stands for this company: the known domain for its name, else the base domain of the posting
 * URL when that is the company's own site (not a job board, ATS or form; not an IP address). Null when unknown.
 */
export function companyLogoDomain(company: string | null | undefined, url?: string | null): string | null {
  const known = knownCompanyDomain(company);
  if (known) return known;
  const host = url ? hostOf(url) : null;
  if (!host || !host.includes('.') || /^[\d.]+$/.test(host) || host === 'localhost' || isNotEmployerHost(host)) return null;
  return baseDomain(host);
}

/** Logo image for a domain (Google's public favicon service; it receives only the domain). */
export function companyLogoUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}

/**
 * Images narrower than this are treated as "no logo": the favicon service answers unknown domains with a 16 px
 * globe, and a 16 px favicon blown up to 40 px looks worse than the monogram.
 */
export const MIN_LOGO_PX = 32;
