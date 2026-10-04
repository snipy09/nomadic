/**
 * Problems from the LeetCode company dataset
 * (apps/desktop/data/practice/leetcode-companies.json): the problem index,
 * company keys and the per-topic company boost.
 */
import { slugOfRef, type CatalogIndex } from './catalog';
import type { ProblemDifficulty, ProblemInfo } from './types';

export interface DatasetProblem {
  title: string;
  difficulty: string;
  link: string;
  frequency?: string | number;
  topics?: string[];
}

export interface DatasetCompany {
  company: string;
  questionCount?: number;
  problems: DatasetProblem[];
}

export type CompanyDataset = Record<string, DatasetCompany>;

/** "Goldman Sachs" -> "goldman-sachs". */
export function companyKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** `https://leetcode.com/problems/two-sum/` -> `two-sum` (null when not a problem link). */
export function slugFromLink(link: string): string | null {
  const m = /^https:\/\/leetcode\.com\/problems\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(link.trim());
  return m ? m[1] : null;
}

function difficultyOf(raw: string): ProblemDifficulty | null {
  const d = raw.toLowerCase();
  return d === 'easy' || d === 'medium' || d === 'hard' ? d : null;
}

/**
 * One ProblemInfo per unique problem in the dataset: `companies` counts the
 * company lists that include it, `tags` is the union of its topics.
 * `paidOnly` comes from the offline LeetCode check (missing = not checked).
 */
export function buildProblemIndex(dataset: CompanyDataset, paidOnly: Record<string, boolean> = {}): ProblemInfo[] {
  const map = new Map<string, ProblemInfo & { _companies: Set<string> }>();
  for (const [name, company] of Object.entries(dataset)) {
    for (const p of company.problems ?? []) {
      const slug = slugFromLink(p.link);
      const difficulty = difficultyOf(p.difficulty);
      if (!slug || !difficulty) continue;
      const cur = map.get(slug) ?? {
        ref: `lc:${slug}`,
        title: p.title.trim(),
        difficulty,
        link: `https://leetcode.com/problems/${slug}/`,
        companies: 0,
        tags: [],
        paid_only: slug in paidOnly ? paidOnly[slug] : null,
        _companies: new Set<string>(),
      };
      cur._companies.add(name);
      for (const t of p.topics ?? []) if (!cur.tags.includes(t)) cur.tags.push(t);
      map.set(slug, cur);
    }
  }
  return [...map.values()]
    .map(({ _companies, ...p }) => ({ ...p, companies: _companies.size, tags: [...p.tags].sort() }))
    .sort((a, b) => b.companies - a.companies || a.ref.localeCompare(b.ref));
}

/** Dataset company names keyed by companyKey. */
export function companyNames(dataset: CompanyDataset): Map<string, string> {
  return new Map(Object.keys(dataset).map((name) => [companyKey(name), name]));
}

export interface TopicBoost {
  topic_id: string;
  problems: ProblemInfo[];
  /** Company display name per problem ref ("On Amazon's list"). */
  companies: Record<string, string>;
}

/**
 * Up to 2 problems per target company per topic (6 per topic at most), taken
 * from that company's list by frequency, tagged with one of the topic's
 * `lc_tags`, never paid-only and never already curated or boosted elsewhere.
 * Topics are visited in roadmap order, so a problem lands under its first topic.
 */
export function companyBoosts(input: {
  dataset: CompanyDataset;
  index: CatalogIndex;
  topicIds: string[];
  companies: string[];
  perCompany?: number;
  perTopic?: number;
}): TopicBoost[] {
  const perCompany = input.perCompany ?? 2;
  const perTopic = input.perTopic ?? 6;
  const names = companyNames(input.dataset);
  const companies = [...new Set(input.companies.map(companyKey))].map((k) => names.get(k)).filter((n): n is string => !!n);
  if (!companies.length) return [];
  const used = new Set<string>();
  for (const id of input.topicIds) {
    const t = input.index.topics.get(id);
    if (!t) continue;
    for (const r of [...t.problems.must, ...t.problems.good, ...t.problems.stretch]) used.add(slugOfRef(r));
  }
  const ranked = new Map(
    companies.map((name) => [
      name,
      [...(input.dataset[name]?.problems ?? [])].sort(
        (a, b) => Number(b.frequency ?? 0) - Number(a.frequency ?? 0) || a.title.localeCompare(b.title)
      ),
    ])
  );
  const out: TopicBoost[] = [];
  for (const id of input.topicIds) {
    const topic = input.index.topics.get(id);
    if (!topic || !topic.lc_tags.length) continue;
    const tags = new Set(topic.lc_tags);
    const picked: ProblemInfo[] = [];
    const by: Record<string, string> = {};
    for (const name of companies) {
      let n = 0;
      for (const p of ranked.get(name)!) {
        if (n >= perCompany || picked.length >= perTopic) break;
        const slug = slugFromLink(p.link);
        if (!slug || used.has(slug)) continue;
        if (!(p.topics ?? []).some((x) => tags.has(x))) continue;
        const info = input.index.problems.get(`lc:${slug}`);
        if (!info || info.paid_only === true) continue;
        used.add(slug);
        picked.push(info);
        by[info.ref] = name;
        n++;
      }
    }
    if (picked.length) out.push({ topic_id: id, problems: picked, companies: by });
  }
  return out;
}
