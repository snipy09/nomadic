/**
 * Famous companies Indian students follow, and where each one publishes its openings.
 *
 * `careers` names the public listing the scraper reads (the company's own careers API or its ATS board).
 * `null` means the careers site has no public listing we can read politely (custom portals, logins, or
 * blocked by robots.txt); those companies are still followable and their hiring windows are curated in Admin.
 *
 * Board ids, Workday tenants and site numbers were taken from each company's public careers URLs. They change:
 * `npm run scrape:feed -- --sources companies` (dry run) lists every company whose board failed; fix or null it here.
 * Slugs are stored ids (follows, snapshots): never rename one.
 */

export type CompanyCategory = 'big_tech' | 'product' | 'indian_product' | 'fintech' | 'finance' | 'semiconductor' | 'services';

export type CareersAdapter =
  | { kind: 'greenhouse'; board: string }
  | { kind: 'lever'; board: string }
  | { kind: 'ashby'; board: string }
  /** https://{host}/wday/cxs/{tenant}/{site}/jobs */
  | { kind: 'workday'; host: string; tenant: string; site: string }
  | { kind: 'smartrecruiters'; company: string }
  /** https://{host}/api/apply/v2/jobs?domain={domain}, or https://{host}/api/pcsx/search when `api` is 'pcsx' */
  | { kind: 'eightfold'; host: string; domain: string; api?: 'v2' | 'pcsx' }
  /** Oracle Recruiting Cloud: https://{host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions */
  | { kind: 'oracle'; host: string; site: string }
  | { kind: 'amazon' };

export interface CompanyDef {
  slug: string;
  name: string;
  domain: string;
  careersUrl: string;
  category: CompanyCategory;
  careers: CareersAdapter | null;
}

const wd = (tenant: string, n: number, site: string): CareersAdapter => ({
  kind: 'workday',
  host: `${tenant}.wd${n}.myworkdayjobs.com`,
  tenant,
  site,
});

export const COMPANIES: CompanyDef[] = [
  // ── Big tech ─────────────────────────────────────────────────────────────────
  { slug: 'google', name: 'Google', domain: 'google.com', careersUrl: 'https://www.google.com/about/careers/applications/jobs/results?location=India', category: 'big_tech', careers: null }, // robots.txt disallows the jobs results; the old search API is gone (404)
  { slug: 'microsoft', name: 'Microsoft', domain: 'microsoft.com', careersUrl: 'https://careers.microsoft.com/', category: 'big_tech', careers: { kind: 'eightfold', host: 'apply.careers.microsoft.com', domain: 'microsoft.com', api: 'pcsx' } },
  { slug: 'amazon', name: 'Amazon', domain: 'amazon.jobs', careersUrl: 'https://www.amazon.jobs/en/locations/india', category: 'big_tech', careers: { kind: 'amazon' } },
  { slug: 'apple', name: 'Apple', domain: 'apple.com', careersUrl: 'https://jobs.apple.com/en-in/search?location=india-INDC', category: 'big_tech', careers: null },
  { slug: 'meta', name: 'Meta', domain: 'metacareers.com', careersUrl: 'https://www.metacareers.com/jobs?offices[0]=Bangalore%2C%20India', category: 'big_tech', careers: null },
  { slug: 'netflix', name: 'Netflix', domain: 'netflix.com', careersUrl: 'https://explore.jobs.netflix.net/careers', category: 'big_tech', careers: { kind: 'eightfold', host: 'explore.jobs.netflix.net', domain: 'netflix.com' } },
  { slug: 'oracle', name: 'Oracle', domain: 'oracle.com', careersUrl: 'https://careers.oracle.com/jobs/', category: 'big_tech', careers: { kind: 'oracle', host: 'eeho.fa.us2.oraclecloud.com', site: 'CX_45001' } },
  { slug: 'adobe', name: 'Adobe', domain: 'adobe.com', careersUrl: 'https://careers.adobe.com/', category: 'big_tech', careers: wd('adobe', 5, 'external_experienced') },
  { slug: 'salesforce', name: 'Salesforce', domain: 'salesforce.com', careersUrl: 'https://careers.salesforce.com/', category: 'big_tech', careers: wd('salesforce', 12, 'External_Career_Site') },
  { slug: 'ibm', name: 'IBM', domain: 'ibm.com', careersUrl: 'https://www.ibm.com/careers/search?field_keyword_05[0]=India', category: 'big_tech', careers: null },
  { slug: 'cisco', name: 'Cisco', domain: 'cisco.com', careersUrl: 'https://jobs.cisco.com/', category: 'big_tech', careers: null },
  { slug: 'uber', name: 'Uber', domain: 'uber.com', careersUrl: 'https://www.uber.com/in/en/careers/', category: 'big_tech', careers: null },
  { slug: 'linkedin', name: 'LinkedIn', domain: 'linkedin.com', careersUrl: 'https://careers.linkedin.com/', category: 'big_tech', careers: null },
  { slug: 'atlassian', name: 'Atlassian', domain: 'atlassian.com', careersUrl: 'https://www.atlassian.com/company/careers/all-jobs', category: 'product', careers: null },
  { slug: 'walmart', name: 'Walmart Global Tech', domain: 'walmart.com', careersUrl: 'https://careers.walmart.com/', category: 'big_tech', careers: null }, // the Workday tenant is gone; the new careers site is custom
  { slug: 'dell', name: 'Dell Technologies', domain: 'dell.com', careersUrl: 'https://jobs.dell.com/', category: 'big_tech', careers: { kind: 'oracle', host: 'enterpriseplatform.dell.com', site: 'careers' } },
  { slug: 'hp', name: 'HP', domain: 'hp.com', careersUrl: 'https://jobs.hp.com/', category: 'big_tech', careers: wd('hp', 5, 'ExternalCareerSite') },
  { slug: 'samsung', name: 'Samsung', domain: 'samsung.com', careersUrl: 'https://www.samsung.com/in/about-us/careers/', category: 'big_tech', careers: null },
  { slug: 'servicenow', name: 'ServiceNow', domain: 'servicenow.com', careersUrl: 'https://careers.servicenow.com/', category: 'product', careers: null }, // SmartRecruiters' robots.txt admits only LinkedInBot

  // ── Product and developer companies hiring in India ─────────────────────────────
  { slug: 'stripe', name: 'Stripe', domain: 'stripe.com', careersUrl: 'https://stripe.com/jobs', category: 'product', careers: { kind: 'greenhouse', board: 'stripe' } },
  { slug: 'databricks', name: 'Databricks', domain: 'databricks.com', careersUrl: 'https://www.databricks.com/company/careers', category: 'product', careers: { kind: 'greenhouse', board: 'databricks' } },
  { slug: 'cloudflare', name: 'Cloudflare', domain: 'cloudflare.com', careersUrl: 'https://www.cloudflare.com/careers/', category: 'product', careers: { kind: 'greenhouse', board: 'cloudflare' } },
  { slug: 'gitlab', name: 'GitLab', domain: 'gitlab.com', careersUrl: 'https://about.gitlab.com/jobs/', category: 'product', careers: { kind: 'greenhouse', board: 'gitlab' } },
  { slug: 'airbnb', name: 'Airbnb', domain: 'airbnb.com', careersUrl: 'https://careers.airbnb.com/', category: 'product', careers: { kind: 'greenhouse', board: 'airbnb' } },
  { slug: 'coinbase', name: 'Coinbase', domain: 'coinbase.com', careersUrl: 'https://www.coinbase.com/careers', category: 'fintech', careers: { kind: 'greenhouse', board: 'coinbase' } },
  { slug: 'figma', name: 'Figma', domain: 'figma.com', careersUrl: 'https://www.figma.com/careers/', category: 'product', careers: { kind: 'greenhouse', board: 'figma' } },
  { slug: 'mongodb', name: 'MongoDB', domain: 'mongodb.com', careersUrl: 'https://www.mongodb.com/careers', category: 'product', careers: { kind: 'greenhouse', board: 'mongodb' } },
  { slug: 'postman', name: 'Postman', domain: 'postman.com', careersUrl: 'https://www.postman.com/company/careers/', category: 'product', careers: null }, // no public ATS board found
  { slug: 'rubrik', name: 'Rubrik', domain: 'rubrik.com', careersUrl: 'https://www.rubrik.com/company/careers', category: 'product', careers: { kind: 'greenhouse', board: 'rubrik' } },
  { slug: 'twilio', name: 'Twilio', domain: 'twilio.com', careersUrl: 'https://www.twilio.com/en-us/company/jobs', category: 'product', careers: { kind: 'greenhouse', board: 'twilio' } },
  { slug: 'okta', name: 'Okta', domain: 'okta.com', careersUrl: 'https://www.okta.com/company/careers/', category: 'product', careers: { kind: 'greenhouse', board: 'okta' } },
  { slug: 'openai', name: 'OpenAI', domain: 'openai.com', careersUrl: 'https://openai.com/careers/', category: 'product', careers: { kind: 'ashby', board: 'openai' } },
  { slug: 'palantir', name: 'Palantir', domain: 'palantir.com', careersUrl: 'https://www.palantir.com/careers/', category: 'product', careers: { kind: 'lever', board: 'palantir' } },
  { slug: 'spotify', name: 'Spotify', domain: 'spotify.com', careersUrl: 'https://www.lifeatspotify.com/jobs', category: 'product', careers: { kind: 'lever', board: 'spotify' } },

  // ── Indian product companies ──────────────────────────────────────────────────
  { slug: 'flipkart', name: 'Flipkart', domain: 'flipkartcareers.com', careersUrl: 'https://www.flipkartcareers.com/', category: 'indian_product', careers: null },
  { slug: 'meesho', name: 'Meesho', domain: 'meesho.com', careersUrl: 'https://www.meesho.io/jobs', category: 'indian_product', careers: { kind: 'lever', board: 'meesho' } },
  { slug: 'phonepe', name: 'PhonePe', domain: 'phonepe.com', careersUrl: 'https://www.phonepe.com/careers/', category: 'fintech', careers: null }, // no public ATS board found
  { slug: 'freshworks', name: 'Freshworks', domain: 'freshworks.com', careersUrl: 'https://www.freshworks.com/company/careers/', category: 'indian_product', careers: null }, // SmartRecruiters' robots.txt admits only LinkedInBot
  { slug: 'swiggy', name: 'Swiggy', domain: 'swiggy.com', careersUrl: 'https://careers.swiggy.com/', category: 'indian_product', careers: null },
  { slug: 'zomato', name: 'Zomato (Eternal)', domain: 'zomato.com', careersUrl: 'https://www.zomato.com/careers', category: 'indian_product', careers: null },
  { slug: 'razorpay', name: 'Razorpay', domain: 'razorpay.com', careersUrl: 'https://razorpay.com/jobs/', category: 'fintech', careers: null },
  { slug: 'cred', name: 'CRED', domain: 'cred.club', careersUrl: 'https://careers.cred.club/', category: 'fintech', careers: null },
  { slug: 'groww', name: 'Groww', domain: 'groww.in', careersUrl: 'https://groww.in/careers', category: 'fintech', careers: null },
  { slug: 'paytm', name: 'Paytm', domain: 'paytm.com', careersUrl: 'https://paytm.com/careers/', category: 'fintech', careers: null },
  { slug: 'zepto', name: 'Zepto', domain: 'zeptonow.com', careersUrl: 'https://www.zeptonow.com/careers', category: 'indian_product', careers: null },
  { slug: 'zoho', name: 'Zoho', domain: 'zoho.com', careersUrl: 'https://www.zoho.com/careers/', category: 'indian_product', careers: null },
  { slug: 'browserstack', name: 'BrowserStack', domain: 'browserstack.com', careersUrl: 'https://www.browserstack.com/careers', category: 'indian_product', careers: null },

  // ── Finance and payments ───────────────────────────────────────────────────────
  { slug: 'jpmorgan', name: 'JPMorgan Chase', domain: 'jpmorganchase.com', careersUrl: 'https://careers.jpmorgan.com/in/en/home', category: 'finance', careers: null }, // the site's firewall answers 403 to robots.txt
  { slug: 'goldman-sachs', name: 'Goldman Sachs', domain: 'goldmansachs.com', careersUrl: 'https://www.goldmansachs.com/careers/', category: 'finance', careers: null },
  { slug: 'morgan-stanley', name: 'Morgan Stanley', domain: 'morganstanley.com', careersUrl: 'https://www.morganstanley.com/careers', category: 'finance', careers: null },
  { slug: 'visa', name: 'Visa', domain: 'visa.com', careersUrl: 'https://corporate.visa.com/en/jobs/', category: 'fintech', careers: wd('visa', 5, 'Visa') },
  { slug: 'mastercard', name: 'Mastercard', domain: 'mastercard.com', careersUrl: 'https://careers.mastercard.com/', category: 'fintech', careers: wd('mastercard', 1, 'CorporateCareers') },
  { slug: 'paypal', name: 'PayPal', domain: 'paypal.com', careersUrl: 'https://careers.pypl.com/', category: 'fintech', careers: wd('paypal', 1, 'jobs') },

  // ── Semiconductors ─────────────────────────────────────────────────────────────
  { slug: 'nvidia', name: 'NVIDIA', domain: 'nvidia.com', careersUrl: 'https://www.nvidia.com/en-in/about-nvidia/careers/', category: 'semiconductor', careers: wd('nvidia', 5, 'NVIDIAExternalCareerSite') },
  { slug: 'intel', name: 'Intel', domain: 'intel.com', careersUrl: 'https://jobs.intel.com/', category: 'semiconductor', careers: wd('intel', 1, 'External') },
  { slug: 'qualcomm', name: 'Qualcomm', domain: 'qualcomm.com', careersUrl: 'https://careers.qualcomm.com/careers', category: 'semiconductor', careers: { kind: 'eightfold', host: 'careers.qualcomm.com', domain: 'qualcomm.com', api: 'pcsx' } },
  { slug: 'amd', name: 'AMD', domain: 'amd.com', careersUrl: 'https://careers.amd.com/', category: 'semiconductor', careers: null },
  { slug: 'texas-instruments', name: 'Texas Instruments', domain: 'ti.com', careersUrl: 'https://careers.ti.com/', category: 'semiconductor', careers: null },

  // ── IT services and consulting (mass hiring drives; windows are curated) ────────
  { slug: 'tcs', name: 'TCS', domain: 'tcs.com', careersUrl: 'https://www.tcs.com/careers/india', category: 'services', careers: null },
  { slug: 'infosys', name: 'Infosys', domain: 'infosys.com', careersUrl: 'https://www.infosys.com/careers/', category: 'services', careers: null },
  { slug: 'wipro', name: 'Wipro', domain: 'wipro.com', careersUrl: 'https://careers.wipro.com/', category: 'services', careers: null },
  { slug: 'hcltech', name: 'HCLTech', domain: 'hcltech.com', careersUrl: 'https://www.hcltech.com/careers', category: 'services', careers: null },
  { slug: 'tech-mahindra', name: 'Tech Mahindra', domain: 'techmahindra.com', careersUrl: 'https://careers.techmahindra.com/', category: 'services', careers: null },
  { slug: 'accenture', name: 'Accenture', domain: 'accenture.com', careersUrl: 'https://www.accenture.com/in-en/careers', category: 'services', careers: null },
  { slug: 'cognizant', name: 'Cognizant', domain: 'cognizant.com', careersUrl: 'https://careers.cognizant.com/india-en/', category: 'services', careers: null },
  { slug: 'capgemini', name: 'Capgemini', domain: 'capgemini.com', careersUrl: 'https://www.capgemini.com/in-en/careers/', category: 'services', careers: null },
  { slug: 'deloitte', name: 'Deloitte', domain: 'deloitte.com', careersUrl: 'https://www2.deloitte.com/in/en/careers.html', category: 'services', careers: null },
];

export function companyBySlug(slug: string): CompanyDef | undefined {
  return COMPANIES.find((c) => c.slug === slug);
}
