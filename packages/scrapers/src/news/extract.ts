import { COMPANIES } from '../feed/companies.js';
import { INDIA_COMPANIES } from '../sources/india-companies.js';

/**
 * Reads hiring facts out of a headline and its feed summary. Every value is a piece of that text (or a plain
 * reading of it, like FY27 → Apr 2026 – Mar 2027); nothing is filled in when the text does not say it.
 */

export const NEWS_KINDS = ['hiring', 'campus', 'layoffs', 'funding', 'expansion'] as const;
export type NewsKind = (typeof NEWS_KINDS)[number];

const CAMPUS =
  /\b(campus (hiring|placements?|recruitment|drive)|placement (season|drive)s?|off[\s-]?campus|hiring drive|recruitment drive|mega drive|walk[\s-]?in drive|nqt|national qualifier|infytq|hackwithinfy|nlth|genc|freshers? hiring|fresher hiring)\b/i;
const LAYOFFS = /\b(lay[\s-]?offs?|laid off|lays off|laying off|job cuts?|cut[s]? [\d,]+ (jobs|employees|roles|staff)|retrench\w*|downsiz\w*|hiring freeze)\b/i;
const HIRING =
  /\b(hir(e|es|ed|ing)|recruit(s|ed|ing|ment)?|onboard(s|ed|ing)? [\d,]+|job openings?|openings for|vacanc(y|ies)|headcount|talent hunt|add(s|ed|ing)? [\d,]+ (employees|people|engineers|jobs|staff)|new jobs|jobs? for freshers|internships?)\b/i;
const FUNDING = /\b(raises?|raised|bags|secures?|funding|series [a-f]\b|seed round|pre-series|valuation|unicorn|ipo)\b/i;
const EXPANSION =
  /\b(global capability cent(re|er)s?|gccs?|r&d cent(re|er)|innovation cent(re|er)|tech(nology)? cent(re|er)|development cent(re|er)|new (office|campus|cent(re|er)|hub|facility)|opens? (its |a |new )?(office|campus|cent(re|er)|hub|facility)|expands? (its )?(presence|operations|team|footprint))\b/i;

/** Government, police, defence and exam-board recruitment: not jobs our students apply to through companies. */
const PUBLIC_SECTOR =
  /\b(police|constables?|home guards?|army|agniveers?|navy|air force|indian railways?|rrb|ssc|upsc|[a-z]*psc|ibps|fssai|sarkari|govt\.? jobs?|government jobs?|teachers? recruitment|anganwadi|high court|supreme court|panchayat|patwari|forest guards?|staff selection|public service commission|recruitment (exam|board)|admit card|answer key|notification out|apply online at)\b/i;
/** One executive moving ("OpenAI poaches SpaceX's sales chief") is people news, not hiring. */
const EXECUTIVE =
  /\b(ceo|cto|cfo|coo|cmo|chro|chief|president|vice[\s-]?president|vp|svp|evp|md|managing director|chairman|chairperson|board|director|head of|executive|exec|top boss|leader|lead|poach(es|ed|ing)?|appoints?|appointed|names|elevates?|steps down|resigns?|quits)\b/i;
/** Deals and markets: a hiring word in their text is incidental ("the buyer will retain all employees"). */
const DEAL = /\b(sells?|sale of|selling|divest\w*|acquires?|acquisition|merger|stake|shares?|stock|sensex|nifty|q[1-4] results?|profit|revenue|earnings)\b/i;
/** A summary only makes a plain headline count when it states a hiring plan, not a passing mention. */
const SUMMARY_HIRING =
  /\b((plans?|set|looks?|aims?|expects?|intends?|will|to) (to )?(hire|recruit|onboard|add)\b|hiring (of|for|plans?|drive)|(hire|recruit|onboard)s? (over |more than |nearly |about |around |up to )?[\d,]+)/i;

/** The article's topic, or null when it is not about hiring, campus drives, layoffs, funding or expansion. */
export function classifyArticle(title: string, summary: string): NewsKind | null {
  const t = `${title} ${summary}`;
  if (PUBLIC_SECTOR.test(title)) return null;
  if (CAMPUS.test(t)) return 'campus';
  if (LAYOFFS.test(title)) return 'layoffs';
  if (HIRING.test(title)) {
    // An executive hire with no headcount is people news; "hires 500 engineers" still counts.
    if (EXECUTIVE.test(title) && !headcount(title)) return null;
    return 'hiring';
  }
  if (EXPANSION.test(title)) return 'expansion';
  if (FUNDING.test(title)) return 'funding';
  if (DEAL.test(title) || PUBLIC_SECTOR.test(summary)) return null;
  // A summary that states a hiring plan makes a plain headline count ("Acme opens Pune office ... to hire 500").
  if (SUMMARY_HIRING.test(summary)) return 'hiring';
  if (LAYOFFS.test(summary)) return 'layoffs';
  return null;
}

// ── Companies ────────────────────────────────────────────────────────────────

interface Matcher {
  slug: string;
  name: string;
  re: RegExp;
  /** The same text means something else when this also appears (Visa in visa news). */
  unless?: RegExp;
}

/** Names that are also common words or other things: matched only with their exact capitals. */
const STRICT = new Set(
  [
    'Apple', 'Meta', 'Oracle', 'Visa', 'Target', 'Grab', 'Porter', 'Elastic', 'Harness', 'Jupiter', 'Glance', 'Apna', 'Navi', 'Dhan',
    'Jar', 'Plum', 'Leap', 'Setu', 'Titan', 'Discover', 'Citi', 'Arm', 'Zeta', 'Ola', 'Moj', 'Josh', 'Intel', 'Amazon', 'CRED',
    'Uber', 'Dell', 'HP', 'ITC', 'SAP', 'HUL', 'EY', 'PwC', 'UST', 'WNS', 'EXL', 'KLA', 'MSCI', 'UBS', 'HPE', 'Jio', 'Fi', 'Uni',
    'Open', 'PW', 'MPL', 'ADI', 'NXP', 'SBI', 'HRT', 'L&T', 'M&M', 'DXC', 'LTTS', 'KPIT', 'PRISM', 'Atos', 'Druva', 'Plum',
  ].map((s) => s.toLowerCase())
);

const UNLESS: Record<string, RegExp> = {
  visa: /\b(h-?1b|h-?4|l-?1|f-?1|o-?1|student|work|tourist|golden|e-?visa|green card|immigration|visas|work permit)\b/i,
  apple: /\b(apples|fruit|orchard|farmers?)\b/i,
  amazon: /\b(rainforest|river)\b/i,
  target: /\b(targets|targeting|targeted)\b/i,
};

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function matcherFor(slug: string, name: string, aliases: string[]): Matcher[] {
  return [name, ...aliases].map((label) => {
    const strict = STRICT.has(label.toLowerCase()) || label.length <= 3;
    return {
      slug,
      name,
      re: new RegExp(`(^|[^A-Za-z0-9])${esc(label)}(?=$|[^A-Za-z0-9])`, strict ? '' : 'i'),
      unless: UNLESS[label.toLowerCase()],
    };
  });
}

const FEED_ALIASES: Record<string, string[]> = {
  zomato: ['Eternal', 'Zomato'],
  tcs: ['Tata Consultancy Services'],
  hcltech: ['HCL Technologies', 'HCL Tech', 'HCL'],
  'tech-mahindra': ['TechM'],
  jpmorgan: ['JP Morgan', 'J.P. Morgan', 'JPMorgan'],
  'goldman-sachs': ['Goldman'],
  walmart: ['Walmart', 'Flipkart-owned'],
  microsoft: ['Microsoft India'],
  google: ['Alphabet'],
  meta: ['Facebook'],
};

let MATCHERS: Matcher[] | null = null;
function matchers(): Matcher[] {
  if (!MATCHERS) {
    MATCHERS = [
      ...COMPANIES.flatMap((c) => matcherFor(c.slug, c.name, FEED_ALIASES[c.slug] ?? [])),
      ...INDIA_COMPANIES.flatMap((c) => matcherFor(c.slug, c.name, c.aliases)),
    ];
    // Longer names first, so "Ola Electric" wins over "Ola" and "Paytm Money" over "Paytm".
    MATCHERS.sort((a, b) => b.re.source.length - a.re.source.length);
  }
  return MATCHERS;
}

const NOT_A_COMPANY = new Set(
  ('india indian indians it govt government centre center centre’s startups startup companies firms tech techies banks gccs gcc top big the this why how what here report survey study experts analysts jobs hiring freshers employees staff workers students engineers graduates mncs firms’ sector industry over nearly about around more fewer several many new us uk global major leading budget union state states ministry labour iit iits nasscom naukri’s ' +
    // Kinds of hiring and sectors: "Festive hiring to rise 20%", "Gig hiring", "AI hiring", "Fintech hiring".
    'festive seasonal gig contract contractual temporary temp white-collar blue-collar fresher campus women diversity ai genai gen ' +
    'retail fintech edtech healthtech healthcare pharma bfsi banking manufacturing e-commerce ecommerce quick-commerce q-commerce logistics ' +
    'telecom auto automobile ev semiconductor semiconductors chip it/ites ites bpo services saas deeptech hr recruitment placement placements ' +
    'police army railway railways defence public private overall annual monthly weekly diwali holiday summer winter march april may june ' +
    'july august september october november december january february')
    .split(' ')
);

/** Company named at the start of a hiring headline ("Acme Labs to hire 500 ..."), when no known company matched. */
function headlineSubject(title: string): string | null {
  const m = title.match(
    /^([A-Z][\w&.'’-]*(?:\s+(?:[A-Z][\w&.'’-]*|&|of)){0,3})\s+(?:to hire|plans to hire|will hire|set to hire|looks to hire|eyes|hires|is hiring|onboards|to onboard|lays off|to lay off|cuts|raises|bags|secures|opens|to open|launches|announces|expands)\b/
  );
  if (!m) return null;
  const name = m[1].trim();
  const first = name.split(/\s+/)[0].toLowerCase().replace(/['’]s$/, '');
  if (NOT_A_COMPANY.has(first) || name.length > 60) return null;
  return name;
}

export interface CompanyMatch {
  slug: string | null;
  name: string;
}

const INSTITUTION = /\b(IITs?|NITs?|IIMs?|IIITs?|BITS|AIIMS|colleges?|universit(y|ies)|institutes?|campus(es)?|placement cells?)\b/i;

/** Known companies named in the text, earliest first, one entry per company. */
function companiesIn(text: string, both: string): Matcher[] {
  const hits: { m: Matcher; at: number }[] = [];
  for (const m of matchers()) {
    const hit = text.match(m.re);
    if (!hit || hit.index === undefined) continue;
    if (m.unless && m.unless.test(both)) continue;
    hits.push({ m, at: hit.index + hit[1].length });
  }
  hits.sort((a, b) => a.at - b.at);
  const seen = new Set<string>();
  return hits.filter((h) => !seen.has(h.m.slug) && seen.add(h.m.slug)).map((h) => h.m);
}

/**
 * The company the article is about: the earliest known company in the headline; else a company named at the start
 * of the headline; else the one known company in the summary. A summary naming several companies (a placement
 * story listing recruiters), or one under a headline about a college, says nothing about which company the article
 * is about, so it gives no company.
 */
export function matchCompany(title: string, summary: string): CompanyMatch | null {
  const both = `${title} ${summary}`;
  const inTitle = companiesIn(title, both);
  if (inTitle.length) return { slug: inTitle[0].slug, name: inTitle[0].name };
  const subject = headlineSubject(title);
  if (subject) return { slug: null, name: subject };
  // A headline about a college ("IIT bars firms from placements") is not about a company its summary mentions.
  if (INSTITUTION.test(title)) return null;
  const inSummary = companiesIn(summary, both);
  return inSummary.length === 1 ? { slug: inSummary[0].slug, name: inSummary[0].name } : null;
}

// ── Facts ────────────────────────────────────────────────────────────────────

const PEOPLE = '(?:new\\s+)?(?:freshers?|graduates?|engineers?|employees?|people|professionals|techies|candidates|jobs|roles|positions|staff|interns?|workers|hires|developers|tech talent|students)';
const HEADCOUNT = new RegExp(
  `(?<![₹$€£\\d.,])(?:over |more than |nearly |about |around |up to |upto |at least )?(\\d{1,3}(?:,\\d{2,3})+|\\d+(?:\\.\\d+)?\\s*(?:lakh|lakhs|lk|k|thousand)?|\\d+)\\+?\\s+${PEOPLE}\\b`,
  'i'
);

/** "1,200 freshers", "50,000 employees", "2 lakh jobs" as written; years ("2026 graduates") are batches, not counts. */
export function headcount(text: string): string | null {
  const m = text.match(HEADCOUNT);
  if (!m) return null;
  const number = m[1].replace(/,/g, '');
  if (/^(19|20)\d{2}$/.test(number)) return null;
  if (Number(number) === 0) return null;
  return m[0].trim().slice(0, 80);
}

const ROLE_RULES: [string, RegExp][] = [
  ['Freshers', /\bfreshers?\b/i],
  ['Interns', /\b(interns?|internships?)\b/i],
  ['Graduate engineer trainees', /\b(graduate engineer trainees?|GETs?)\b/],
  ['Software engineers', /\b(software (engineers?|developers?|development engineers?)|SDEs?|SWEs?)\b/i],
  ['Developers', /\b(developers|full[\s-]?stack|front[\s-]?end|back[\s-]?end)\b/i],
  ['Data scientists', /\bdata scientists?\b/i],
  ['Data analysts', /\b(data analysts?|business analysts?|analytics)\b/i],
  ['AI/ML engineers', /\b(ai|ml|machine learning|genai|gen ai|artificial intelligence)\b[\w\s-]{0,20}\b(engineers?|talent|roles|professionals|experts|specialists|jobs)\b/i],
  ['Cloud and DevOps', /\b(cloud|devops|sre|site reliability)\b/i],
  ['Cybersecurity', /\b(cyber[\s-]?security|security engineers?|infosec)\b/i],
  ['Testers', /\b(testers?|qa engineers?|quality assurance|sdets?)\b/i],
  ['Product managers', /\bproduct managers?\b/i],
  ['Designers', /\b(designers?|ux|ui\/ux)\b/i],
  ['Chip design', /\b(vlsi|chip design|semiconductor engineers?|embedded)\b/i],
  ['Engineers', /\bengineers\b/i],
  ['MBA graduates', /\bmbas?\b/i],
  ['Sales and support', /\b(sales|customer (support|service)|bpo)\b/i],
];

/** Roles the text names, in a fixed order; "Engineers" only when nothing more specific is named. */
export function roles(text: string): string[] {
  const found = ROLE_RULES.filter(([, re]) => re.test(text)).map(([label]) => label);
  const specific = found.filter((r) => r !== 'Engineers');
  return (specific.some((r) => /engineer|developer|scientist|devops|cyber|tester|chip/i.test(r)) ? specific : found).slice(0, 5);
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const monthIndex = (m: string) => MONTHS.indexOf(m.slice(0, 3).toLowerCase());
const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

export interface Period {
  text: string;
  startsOn: string | null;
  endsOn: string | null;
}

/**
 * When the hiring happens, as the text puts it: "September to December", "Sept–Dec 2026", "FY27", "by March 2027",
 * "this quarter". Dates are given only for month ranges and fiscal years; a month range without a year is placed
 * from the publishing date (the next such months, allowing two months back).
 */
export function period(text: string, publishedAt: Date): Period | null {
  const range = text.match(new RegExp(`\\b(?:from |between )?${MONTH}(?:\\s+(20\\d{2}))?\\s*(?:-|–|—|to|and|till|until|through)\\s*${MONTH}(?:\\s+(20\\d{2}))?\\b`, 'i'));
  if (range) {
    const [whole, m1, y1, m2, y2] = range;
    const a = monthIndex(m1);
    const b = monthIndex(m2);
    if (a >= 0 && b >= 0) {
      const pubY = publishedAt.getUTCFullYear();
      const pubM = publishedAt.getUTCMonth();
      const startY = y1 ? Number(y1) : y2 ? (a > b ? Number(y2) - 1 : Number(y2)) : a < pubM - 2 ? pubY + 1 : pubY;
      const endY = y2 ? Number(y2) : b < a ? startY + 1 : startY;
      return { text: whole.trim(), startsOn: iso(startY, a, 1), endsOn: iso(endY, b, lastDay(endY, b)) };
    }
  }
  const fy = text.match(/\b(?:FY\s?'?(\d{2})(?:-(\d{2}))?|FY\s?(20\d{2})(?:-(\d{2,4}))?|fiscal (?:year )?(20\d{2})(?:-(\d{2,4}))?)\b/i);
  if (fy) {
    const endShort = fy[2] ?? fy[1];
    const endYear = fy[1] ? 2000 + Number(endShort) : fy[4] ? (fy[4].length === 2 ? 2000 + Number(fy[4]) : Number(fy[4])) : Number(fy[3] ?? fy[5]);
    // Indian fiscal year: FY27 = April 2026 to March 2027.
    return { text: fy[0].trim(), startsOn: iso(endYear - 1, 3, 1), endsOn: iso(endYear, 2, 31) };
  }
  const by = text.match(new RegExp(`\\bby (?:the )?(?:end of )?${MONTH}?\\s*(20\\d{2})\\b`, 'i'));
  if (by) {
    const m = by[1] ? monthIndex(by[1]) : 11;
    const y = Number(by[2]);
    return { text: by[0].trim(), startsOn: null, endsOn: iso(y, m, lastDay(y, m)) };
  }
  const loose = text.match(/\b(this|next|the current|the coming) (quarter|fiscal|financial year|year|month|few months|six months)\b|\b(?:in |during )?(H[12]|Q[1-4]) (?:of )?(?:FY\s?\d{2}|20\d{2})\b/i);
  return loose ? { text: loose[0].trim(), startsOn: null, endsOn: null } : null;
}

const CITIES: [string, RegExp][] = [
  ['Bengaluru', /\b(bengaluru|bangalore)\b/i],
  ['Hyderabad', /\bhyderabad\b/i],
  ['Pune', /\bpune\b/i],
  ['Chennai', /\bchennai\b/i],
  ['Mumbai', /\b(mumbai|navi mumbai)\b/i],
  ['Delhi NCR', /\b(delhi|ncr|gurugram|gurgaon|noida)\b/i],
  ['Kolkata', /\bkolkata\b/i],
  ['Ahmedabad', /\b(ahmedabad|gift city|gandhinagar)\b/i],
  ['Kochi', /\b(kochi|cochin)\b/i],
  ['Coimbatore', /\bcoimbatore\b/i],
  ['Thiruvananthapuram', /\b(thiruvananthapuram|trivandrum)\b/i],
  ['Jaipur', /\bjaipur\b/i],
  ['Indore', /\bindore\b/i],
  ['Chandigarh', /\b(chandigarh|mohali)\b/i],
  ['Bhubaneswar', /\bbhubaneswar\b/i],
  ['Mysuru', /\b(mysuru|mysore)\b/i],
  ['Visakhapatnam', /\b(visakhapatnam|vizag)\b/i],
  ['Nagpur', /\bnagpur\b/i],
  ['Vadodara', /\bvadodara\b/i],
  ['Lucknow', /\blucknow\b/i],
  ['Mangaluru', /\b(mangaluru|mangalore)\b/i],
];

export function cities(text: string): string[] {
  return CITIES.filter(([, re]) => re.test(text)).map(([name]) => name).slice(0, 5);
}
