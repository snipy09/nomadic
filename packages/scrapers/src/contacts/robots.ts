/**
 * robots.txt rules (RFC 9309): the group for our agent, else "*"; the longest matching rule
 * wins and Allow wins a tie; "*" matches any run of characters and "$" ends the pattern.
 * A missing robots.txt (404) allows everything; one we cannot read (401, 403, 5xx, network
 * error) allows nothing.
 */

export const CONTACT_BOT_AGENT = 'NomadicContactBot';

export interface RobotsRule {
  allow: boolean;
  pattern: string;
}

export interface Robots {
  rules: RobotsRule[];
  /** Seconds between requests asked for by the site, when given. */
  crawlDelay: number | null;
  /** True when robots.txt could not be read and everything is refused. */
  denyAll: boolean;
}

export const ALLOW_ALL: Robots = { rules: [], crawlDelay: null, denyAll: false };
export const DENY_ALL: Robots = { rules: [], crawlDelay: null, denyAll: true };

interface Group {
  agents: string[];
  rules: RobotsRule[];
  crawlDelay: number | null;
}

export function parseRobots(body: string, agent = CONTACT_BOT_AGENT): Robots {
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    const colon = line.indexOf(':');
    if (colon < 1) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [], crawlDelay: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (field === 'allow' || field === 'disallow') {
      // An empty Disallow means "allow everything" and adds no rule.
      if (value) current.rules.push({ allow: field === 'allow', pattern: value });
    } else if (field === 'crawl-delay') {
      const n = Number(value);
      if (Number.isFinite(n) && n >= 0) current.crawlDelay = n;
    }
  }
  const name = agent.toLowerCase();
  const mine = groups.filter((g) => g.agents.some((a) => a !== '*' && name.includes(a)));
  const chosen = mine.length > 0 ? mine : groups.filter((g) => g.agents.includes('*'));
  return {
    rules: chosen.flatMap((g) => g.rules),
    crawlDelay: chosen.map((g) => g.crawlDelay).find((d) => d !== null) ?? null,
    denyAll: false,
  };
}

function patternToRegExp(pattern: string): RegExp {
  const anchored = pattern.endsWith('$');
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split('*')
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`);
}

/** Whether `pathWithQuery` (e.g. "/careers?x=1") may be fetched. */
export function isAllowed(robots: Robots, pathWithQuery: string): boolean {
  if (robots.denyAll) return false;
  if (pathWithQuery === '/robots.txt') return true;
  let best: RobotsRule | null = null;
  for (const rule of robots.rules) {
    if (!patternToRegExp(rule.pattern).test(pathWithQuery)) continue;
    const len = rule.pattern.length;
    if (!best || len > best.pattern.length || (len === best.pattern.length && rule.allow && !best.allow)) best = rule;
  }
  return best ? best.allow : true;
}

export function robotsFromResponse(status: number, body: string): Robots {
  if (status >= 200 && status < 300) return parseRobots(body);
  if (status >= 400 && status < 500 && status !== 401 && status !== 403 && status !== 429) return ALLOW_ALL;
  return DENY_ALL;
}
