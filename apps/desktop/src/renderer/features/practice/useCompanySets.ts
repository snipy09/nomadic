import { useEffect, useState } from 'react';
import type { PracticeCatalog } from '../../../shared/ipc';
import { getApi } from '../../types';

export interface CompanyProblem {
  title: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD' | string;
  link: string;
  frequency?: string;
  topics?: string[];
}

export interface CompanySet {
  company: string;
  questionCount: number;
  problems: CompanyProblem[];
}

/** Company problem sets grouped per company (most frequent first), from the practice catalog. */
export function companySetsFromCatalog(catalog: PracticeCatalog): Record<string, CompanySet> {
  const out: Record<string, CompanySet> = {};
  for (const c of catalog.companies) out[c.name] = { company: c.name, questionCount: c.problemCount, problems: [] };
  const freq = new Map<CompanyProblem, number>();
  for (const e of catalog.entries) {
    if (e.kind !== 'problem' || !e.link) continue;
    for (const c of e.companies) {
      const set = out[c.name];
      if (!set) continue;
      const p: CompanyProblem = {
        title: e.title,
        difficulty: (e.difficulty ?? '').toUpperCase(),
        link: e.link,
        frequency: c.frequency === null ? undefined : String(c.frequency),
        topics: e.topics,
      };
      freq.set(p, c.frequency ?? -1);
      set.problems.push(p);
    }
  }
  for (const set of Object.values(out)) set.problems.sort((a, b) => (freq.get(b) ?? -1) - (freq.get(a) ?? -1));
  return out;
}

/** Company sets loaded through the main process (the dataset is not in the renderer bundle). */
export function useCompanySets(): Record<string, CompanySet> {
  const [sets, setSets] = useState<Record<string, CompanySet>>({});
  useEffect(() => {
    let live = true;
    getApi()
      .practiceGetCatalog()
      .then((res) => { if (live && res.success) setSets(companySetsFromCatalog(res.catalog)); })
      .catch(() => { /* the view shows its empty state */ });
    return () => { live = false; };
  }, []);
  return sets;
}
