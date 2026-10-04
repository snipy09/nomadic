import { promises as fs } from 'fs';
import path from 'path';
import { PracticeItemSchema, type RoleFamilyId } from '@job-automator/learning';
import { practice_items, role_skills, roles, skills } from '@job-automator/learning/seed/bundle.json';
import type { PracticeCatalog, PracticeEntry, PracticeQuizItem } from '../../shared/ipc.js';
import { DOMAINS, type DomainSpec } from '../../renderer/data/jobRolesDataset.js';
import { VAULT_QUESTIONS, type VaultQuestion } from '../../renderer/data/resourceVault.js';

/**
 * Practice catalog (F8), built in the main process so the large datasets never
 * ship in the renderer bundle. Sources, all already in the repo:
 *  - company problem sets: data/practice/leetcode-companies.json (read from
 *    disk on first use; copied next to the main bundle by build-main.mjs)
 *  - written role questions: renderer/data/jobRolesDataset.ts (DOMAINS)
 *  - written question bank: renderer/data/resourceVault.ts (VAULT_QUESTIONS)
 *  - quiz items: the Learn content bundle, `published` and non-code only
 * Links are copied from the datasets and validated; nothing is generated.
 */

export const COMPANY_DATASET_FILE = 'leetcode-companies.json';
const LEETCODE_PROBLEM_URL = /^https:\/\/leetcode\.com\/problems\/([a-z0-9-]+)\/?$/;

const slugify = (s: string, max = 80) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');

const DIFFICULTY: Record<string, PracticeEntry['difficulty']> = { easy: 'easy', medium: 'medium', hard: 'hard' };
const difficultyOf = (v: unknown) => DIFFICULTY[String(v ?? '').toLowerCase()] ?? null;

// ── Company problem sets ───────────────────────────────────────────────────

interface RawCompanyProblem {
  title?: unknown;
  difficulty?: unknown;
  link?: unknown;
  frequency?: unknown;
  topics?: unknown;
}

/** Problems from the company sets dataset, merged across companies by LeetCode slug. */
export function normalizeCompanyDataset(raw: unknown): Pick<PracticeCatalog, 'entries' | 'companies'> {
  const bySlug = new Map<string, PracticeEntry>();
  const companies: PracticeCatalog['companies'] = [];
  if (!raw || typeof raw !== 'object') return { entries: [], companies };

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const company = value as { company?: unknown; problems?: unknown };
    const name = String(company?.company ?? key).trim();
    if (!name || !Array.isArray(company?.problems)) continue;
    let count = 0;
    for (const p of company.problems as RawCompanyProblem[]) {
      const link = typeof p?.link === 'string' ? p.link.trim() : '';
      const m = LEETCODE_PROBLEM_URL.exec(link);
      const title = typeof p?.title === 'string' ? p.title.trim() : '';
      if (!m || !title) continue;
      const slug = m[1];
      const freq = Number.parseFloat(String(p.frequency ?? ''));
      const frequency = Number.isFinite(freq) ? Math.max(0, Math.min(100, freq)) : null;
      const topics = Array.isArray(p.topics) ? p.topics.filter((t): t is string => typeof t === 'string' && t.trim() !== '').map((t) => t.trim()) : [];
      const entry = bySlug.get(slug) ?? {
        id: `lc:${slug}`,
        kind: 'problem' as const,
        title,
        prompt: '',
        difficulty: difficultyOf(p.difficulty),
        topics: [],
        roles: [],
        companies: [],
        link: `https://leetcode.com/problems/${slug}/`,
        skillId: 'dsa',
        referenceAnswer: null,
        quiz: null,
        source: COMPANY_DATASET_FILE,
      };
      for (const t of topics) if (!entry.topics.includes(t)) entry.topics.push(t);
      if (!entry.companies.some((c) => c.name === name)) {
        entry.companies.push({ name, frequency });
        count++;
      }
      bySlug.set(slug, entry);
    }
    if (count > 0) companies.push({ name, problemCount: count });
  }

  const entries = [...bySlug.values()];
  for (const e of entries) e.companies.sort((a, b) => (b.frequency ?? -1) - (a.frequency ?? -1) || a.name.localeCompare(b.name));
  companies.sort((a, b) => a.name.localeCompare(b.name));
  return { entries, companies };
}

// ── Written questions ──────────────────────────────────────────────────────

const ROLE_BY_LEGACY_ROADMAP = new Map<string, RoleFamilyId>(
  roles.flatMap((r) => r.legacy_roadmap_ids.map((legacy) => [legacy, r.id as RoleFamilyId] as const)),
);

/** Interview questions per role domain (jobRolesDataset), one entry per distinct question. */
export function buildRoleQuestionEntries(domains: DomainSpec[]): PracticeEntry[] {
  const out = new Map<string, PracticeEntry>();
  for (const d of domains) {
    const role = ROLE_BY_LEGACY_ROADMAP.get(d.roadmapId);
    for (const track of d.tracks) {
      for (const q of track.interviewQuestions) {
        const text = q.trim();
        const slug = slugify(text);
        if (!text || !slug) continue;
        const id = `roleq:${slug}`;
        const existing = out.get(id);
        if (existing) {
          if (role && !existing.roles.includes(role)) existing.roles.push(role);
          if (!existing.topics.includes(d.name)) existing.topics.push(d.name);
          continue;
        }
        out.set(id, {
          id,
          kind: 'question',
          title: text,
          prompt: '',
          difficulty: null,
          topics: [d.name],
          roles: role ? [role] : [],
          companies: [],
          link: null,
          skillId: null,
          referenceAnswer: null,
          quiz: null,
          source: 'jobRolesDataset.ts',
        });
      }
    }
  }
  return [...out.values()];
}

/**
 * Question bank entries. Its company tags and video links are not carried
 * over: the tags have no source and the video links are placeholders.
 */
export function buildVaultEntries(questions: VaultQuestion[]): PracticeEntry[] {
  return questions.map((q) => {
    const examples = q.examples.map((e) => `Input: ${e.input}\nOutput: ${e.output}${e.explanation ? `\n${e.explanation}` : ''}`);
    const prompt = [q.prompt, examples.length ? `Examples:\n${examples.join('\n\n')}` : '', q.constraints.length ? `Constraints:\n${q.constraints.map((c) => `- ${c}`).join('\n')}` : '']
      .filter(Boolean)
      .join('\n\n');
    const complexity = [q.timeComplexity ? `Time: ${q.timeComplexity}` : '', q.spaceComplexity ? `Space: ${q.spaceComplexity}` : ''].filter(Boolean).join('\n');
    const reference = [q.detailedExplanation, complexity, q.solutionCode ?? ''].filter(Boolean).join('\n\n');
    return {
      id: `vault:${slugify(q.id)}`,
      kind: 'question' as const,
      title: q.title,
      prompt,
      difficulty: difficultyOf(q.difficulty),
      topics: [q.category],
      roles: [],
      companies: [],
      link: null,
      skillId: null,
      referenceAnswer: reference || null,
      quiz: null,
      source: 'resourceVault.ts',
    };
  });
}

// ── Quiz items ─────────────────────────────────────────────────────────────

/** Published, locally gradable items from the Learn content bundle. Drafts are never shown. */
export function buildQuizEntries(items: unknown[]): PracticeEntry[] {
  const skillName = new Map(skills.map((s) => [s.id, s.name]));
  const out: PracticeEntry[] = [];
  for (const raw of items) {
    const parsed = PracticeItemSchema.safeParse(raw);
    if (!parsed.success) continue;
    const item = parsed.data;
    if (item.status !== 'published' || item.kind === 'code') continue;
    const itemRoles = [...new Set(role_skills.filter((r) => r.skill_id === item.skill_id).map((r) => r.role_id as RoleFamilyId))];
    out.push({
      id: item.id,
      kind: 'quiz',
      title: item.prompt,
      prompt: item.prompt,
      difficulty: item.difficulty,
      topics: [skillName.get(item.skill_id) ?? item.skill_id],
      roles: itemRoles,
      companies: item.company_tags.map((name) => ({ name, frequency: null })),
      link: null,
      skillId: item.skill_id,
      referenceAnswer: item.explanation || null,
      quiz: item as PracticeQuizItem,
      source: 'learning content bundle',
    });
  }
  return out;
}

export function buildPracticeCatalog(companyDataset: unknown): PracticeCatalog {
  const sets = normalizeCompanyDataset(companyDataset);
  const entries = [
    ...buildQuizEntries(practice_items as unknown[]),
    ...buildVaultEntries(VAULT_QUESTIONS),
    ...buildRoleQuestionEntries(DOMAINS),
    ...sets.entries,
  ];
  return { version: `practice-${entries.length}-${sets.companies.length}`, entries, companies: sets.companies };
}

// ── Loader ─────────────────────────────────────────────────────────────────

/** Where the company sets file can be: next to the bundle (build/package) or in the source tree (dev, tests). */
export function companyDatasetCandidates(baseDir: string): string[] {
  return [
    path.join(baseDir, 'data', COMPANY_DATASET_FILE),
    path.join(baseDir, '..', '..', 'data', 'practice', COMPANY_DATASET_FILE),
    path.join(baseDir, '..', '..', '..', 'data', 'practice', COMPANY_DATASET_FILE),
  ];
}

let cached: Promise<PracticeCatalog> | null = null;
let datasetCached: Promise<unknown> | null = null;

/** The raw LeetCode company dataset (Learn v2 company boosts). A failed load is not cached. */
export function loadCompanyDataset(baseDir: string = __dirname): Promise<unknown> {
  if (!datasetCached) {
    datasetCached = readFirst(companyDatasetCandidates(baseDir))
      .then((text) => JSON.parse(text) as unknown)
      .catch((err) => {
        datasetCached = null;
        throw err;
      });
  }
  return datasetCached;
}

async function readFirst(paths: string[]): Promise<string> {
  for (const p of paths) {
    try {
      return await fs.readFile(p, 'utf-8');
    } catch {
      /* try the next location */
    }
  }
  throw new Error('The practice question sets are missing from this install.');
}

/** Catalog, built once per run. A failed load is not cached so the user can retry. */
export function loadPracticeCatalog(baseDir: string = __dirname): Promise<PracticeCatalog> {
  if (!cached) {
    cached = readFirst(companyDatasetCandidates(baseDir))
      .then((text) => buildPracticeCatalog(JSON.parse(text)))
      .catch((err) => {
        cached = null;
        throw err;
      });
  }
  return cached;
}
