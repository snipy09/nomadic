/**
 * settings.ini of the Desktop scraper folder: how often each scraper runs and how much it reads. Plain INI
 * ("key = value" under [sections], ";" or "#" comments) so it can be edited in Notepad. Unknown keys and bad values
 * are reported and fall back to the defaults; a missing file means all defaults.
 */

export const TASK_IDS = ['discover', 'jobs', 'companies', 'hackathons', 'news', 'contacts'] as const;
export type TaskId = (typeof TASK_IDS)[number];

export const TASK_LABEL: Record<TaskId, string> = {
  discover: 'Find company job boards',
  jobs: 'Jobs and internships',
  companies: 'Company hiring snapshots',
  hackathons: 'Hackathons and contests',
  news: 'Hiring news',
  contacts: 'Hiring contacts',
};

export interface AutoSettings {
  /** Hours between runs; 0 = off. */
  every: Record<TaskId, number>;
  region: 'india' | 'all';
  jobs: {
    maxNewPerRun: number;
    maxAgeDays: number;
    includeTier3: boolean;
    internshalaPages: number;
    unstopPages: number;
    careersPages: number;
  };
  news: { maxAgeDays: number; feedsOff: string[] };
  adzuna: { maxCallsPerRun: number };
}

export const DEFAULT_SETTINGS: AutoSettings = {
  every: { discover: 168, jobs: 6, companies: 12, hackathons: 12, news: 3, contacts: 24 },
  region: 'india',
  jobs: { maxNewPerRun: 5000, maxAgeDays: 30, includeTier3: false, internshalaPages: 5, unstopPages: 34, careersPages: 25 },
  news: { maxAgeDays: 30, feedsOff: [] },
  adzuna: { maxCallsPerRun: 40 },
};

export function parseIni(text: string): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = { '': {} };
  let section = '';
  for (const raw of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) continue;
    const head = line.match(/^\[([^\]]+)\]$/);
    if (head) {
      section = head[1].trim().toLowerCase();
      out[section] ??= {};
      continue;
    }
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim().toLowerCase();
    const value = line.slice(eq + 1).replace(/\s[;#].*$/, '').trim();
    out[section][key] = value;
  }
  return out;
}

export interface SettingsResult {
  settings: AutoSettings;
  warnings: string[];
}

export function readSettings(text: string | null): SettingsResult {
  const s: AutoSettings = structuredClone(DEFAULT_SETTINGS);
  const warnings: string[] = [];
  if (text === null) return { settings: s, warnings: ['settings.ini not found: using the defaults'] };
  const ini = parseIni(text);
  const used = new Set<string>();

  const num = (section: string, key: string, min: number, max: number, fallback: number): number => {
    used.add(`${section}.${key}`);
    const v = ini[section]?.[key];
    if (v === undefined || v === '') return fallback;
    const n = Number(v);
    if (!Number.isFinite(n) || n < min || n > max) {
      warnings.push(`[${section}] ${key} = ${v} is not a number from ${min} to ${max}: using ${fallback}`);
      return fallback;
    }
    return n;
  };
  const bool = (section: string, key: string, fallback: boolean): boolean => {
    used.add(`${section}.${key}`);
    const v = ini[section]?.[key]?.toLowerCase();
    if (v === undefined || v === '') return fallback;
    if (['yes', 'true', 'on', '1'].includes(v)) return true;
    if (['no', 'false', 'off', '0'].includes(v)) return false;
    warnings.push(`[${section}] ${key} = ${v} should be yes or no: using ${fallback ? 'yes' : 'no'}`);
    return fallback;
  };

  for (const id of TASK_IDS) s.every[id] = num('schedule', id, 0, 24 * 31, s.every[id]);
  used.add('general.region');
  const region = ini.general?.region?.toLowerCase();
  if (region === 'all' || region === 'india') s.region = region;
  else if (region) warnings.push(`[general] region = ${region} should be india or all: using india`);

  s.jobs.maxNewPerRun = Math.round(num('jobs', 'max_new_per_run', 1, 100_000, s.jobs.maxNewPerRun));
  s.jobs.maxAgeDays = Math.round(num('jobs', 'max_age_days', 0, 365, s.jobs.maxAgeDays));
  s.jobs.includeTier3 = bool('jobs', 'include_naukri_and_indeed', s.jobs.includeTier3);
  s.jobs.internshalaPages = Math.round(num('jobs', 'internshala_pages', 1, 50, s.jobs.internshalaPages));
  s.jobs.unstopPages = Math.round(num('jobs', 'unstop_pages', 1, 200, s.jobs.unstopPages));
  s.jobs.careersPages = Math.round(num('jobs', 'careers_pages', 1, 100, s.jobs.careersPages));
  s.news.maxAgeDays = Math.round(num('news', 'max_age_days', 1, 90, s.news.maxAgeDays));
  used.add('news.feeds_off');
  s.news.feedsOff = (ini.news?.feeds_off ?? '')
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean);
  s.adzuna.maxCallsPerRun = Math.round(num('adzuna', 'max_calls_per_run', 1, 250, s.adzuna.maxCallsPerRun));

  for (const [section, keys] of Object.entries(ini)) {
    for (const key of Object.keys(keys)) if (!used.has(`${section}.${key}`)) warnings.push(`unknown setting [${section}] ${key} (ignored)`);
  }
  return { settings: s, warnings };
}
