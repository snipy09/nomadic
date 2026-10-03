import { useMemo } from 'react';
import { Lock, Search, X } from 'lucide-react';
import { Button, Combobox, IconButton, Input, Select } from '@nomadic/ui';
import { roles } from '@job-automator/learning/seed/bundle.json';
import type { RoleFamilyId } from '@job-automator/learning';
import type { PracticeCatalog } from '../../../shared/ipc';
import { EMPTY_FILTERS, isFiltered, type DifficultyFilter, type KindFilter, type PracticeFilters as Filters } from './practiceLogic';

interface PracticeFiltersProps {
  value: Filters;
  onChange: (next: Filters) => void;
  catalog: PracticeCatalog;
  topics: Array<{ topic: string; count: number }>;
  /** Company sets are a paid feature; when locked the company filter offers an upgrade instead. */
  companyLocked: boolean;
  onOpenUpgrade?: () => void;
}

const ROLE_OPTIONS = [{ value: 'any', label: 'Any role' }, ...roles.map((r) => ({ value: r.id, label: r.name }))];

export function PracticeFilters({ value, onChange, catalog, topics, companyLocked, onOpenUpgrade }: PracticeFiltersProps) {
  const set = (patch: Partial<Filters>) => onChange({ ...value, ...patch });
  const companyOptions = useMemo(
    () => catalog.companies.map((c) => ({ value: c.name, label: c.name, hint: `${c.problemCount} problems` })),
    [catalog.companies],
  );
  const topicOptions = useMemo(() => topics.map((t) => ({ value: t.topic, label: t.topic, hint: String(t.count) })), [topics]);

  return (
    <div className="flex flex-col gap-3" role="search" aria-label="Filter practice">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          wrapperClassName="min-w-[240px] flex-1"
          leftIcon={<Search />}
          value={value.search}
          onChange={(e) => set({ search: e.target.value })}
          placeholder="Search questions or topics"
          aria-label="Search practice"
          rightSlot={value.search ? <IconButton label="Clear search" icon={<X />} size="sm" variant="ghost" tooltip={false} onClick={() => set({ search: '' })} /> : undefined}
        />
        <Select
          aria-label="Type"
          value={value.kind}
          onValueChange={(v) => set({ kind: v as KindFilter })}
          options={[
            { value: 'all', label: 'All types' },
            { value: 'problem', label: 'Coding problems' },
            { value: 'question', label: 'Interview questions' },
            { value: 'quiz', label: 'Quizzes' },
          ]}
        />
        <Select
          aria-label="Difficulty"
          value={value.difficulty}
          onValueChange={(v) => set({ difficulty: v as DifficultyFilter })}
          options={[
            { value: 'all', label: 'Any difficulty' },
            { value: 'easy', label: 'Easy' },
            { value: 'medium', label: 'Medium' },
            { value: 'hard', label: 'Hard' },
          ]}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Select
          aria-label="Role"
          value={value.role || 'any'}
          onValueChange={(v) => set({ role: v === 'any' ? '' : (v as RoleFamilyId) })}
          options={ROLE_OPTIONS}
        />
        <Combobox
          className="w-[220px]"
          aria-label="Topic"
          placeholder="Any topic"
          options={topicOptions}
          value={value.topic || null}
          onChange={(v) => set({ topic: v ?? '' })}
          emptyText="No topic matches"
        />
        {companyLocked ? (
          <Button variant="secondary" leftIcon={<Lock />} onClick={onOpenUpgrade} aria-label="Company question sets are on Pro. Upgrade">
            Company sets (Pro)
          </Button>
        ) : (
          <Combobox
            className="w-[220px]"
            aria-label="Company"
            placeholder="Any company"
            options={companyOptions}
            value={value.company || null}
            onChange={(v) => set({ company: v ?? '' })}
            emptyText="No company matches"
          />
        )}
        {isFiltered(value) && (
          <Button variant="ghost" onClick={() => onChange(EMPTY_FILTERS)}>
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}
