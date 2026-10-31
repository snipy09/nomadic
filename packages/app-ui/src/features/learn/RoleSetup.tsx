import React, { useId, useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Button, Card, Field, Input, Skeleton, Textarea, cn } from '@nomadic/ui';
import type { RoleRoadmapRequest } from '@job-automator/learning';
import { LEVELS, ROLE_SUGGESTIONS, roleProblem } from './roleSetupLogic';

export { LEVELS, ROLE_SUGGESTIONS, roleProblem };

/** The role (free text with suggestions), the level and an optional note. Used by Learn and by onboarding. */
export function RoleFields({
  value,
  onChange,
  error,
  autoFocus,
}: {
  value: RoleRoadmapRequest;
  onChange: (next: RoleRoadmapRequest) => void;
  error?: string | null;
  autoFocus?: boolean;
}) {
  const levelId = useId();
  const set = <K extends keyof RoleRoadmapRequest>(k: K, v: RoleRoadmapRequest[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="flex flex-col gap-5">
      <Field label="Role" id="learn-role" error={error ?? undefined} hint="Any role works. The suggestions only fill the box.">
        <Input
          value={value.role}
          maxLength={80}
          autoComplete="off"
          autoFocus={autoFocus}
          placeholder="For example: Quant trader"
          onChange={(e) => set('role', e.target.value)}
        />
      </Field>
      <div role="group" aria-label="Role suggestions" className="-mt-2 flex flex-wrap gap-1.5">
        {ROLE_SUGGESTIONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => set('role', r)}
            aria-pressed={value.role.trim().toLowerCase() === r.toLowerCase()}
            className={cn(
              'rounded-full border px-3 py-1 text-label font-strong transition-colors duration-fast',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
              value.role.trim().toLowerCase() === r.toLowerCase()
                ? 'border-accent bg-accent-subtle text-accent-subtle-fg'
                : 'border-line bg-surface text-fg-muted hover:border-line-strong hover:text-fg'
            )}
          >
            {r}
          </button>
        ))}
      </div>

      <div role="radiogroup" aria-labelledby={levelId} className="flex flex-col gap-2">
        <span id={levelId} className="text-body font-strong text-fg">Where are you starting from?</span>
        <div className="grid gap-2 sm:grid-cols-3">
          {LEVELS.map((l) => (
            <button
              key={l.value}
              type="button"
              role="radio"
              aria-checked={value.level === l.value}
              onClick={() => set('level', l.value)}
              className={cn(
                'flex flex-col items-start gap-0.5 rounded-lg border-2 px-3 py-2.5 text-left transition-colors duration-fast',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                value.level === l.value ? 'border-accent bg-accent-subtle' : 'border-line bg-surface hover:border-line-strong'
              )}
            >
              <span className="text-body font-strong text-fg">{l.label}</span>
              <span className="text-caption text-fg-subtle">{l.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <Field label="Anything to focus on or skip? (optional)" hint={`${value.note.length}/500. For example: "I already know Python. More on options."`}>
        <Textarea rows={2} maxLength={500} value={value.note} onChange={(e) => set('note', e.target.value)} />
      </Field>
    </div>
  );
}

/** Learn's setup: one page, then the roadmap is built. */
export function RoleSetup({
  initial,
  replacing,
  banner,
  error,
  onBuild,
  onCancel,
}: {
  initial: RoleRoadmapRequest;
  /** The role of the current roadmap, when a new one would replace it. */
  replacing?: string | null;
  banner?: React.ReactNode;
  error?: string | null;
  onBuild: (req: RoleRoadmapRequest) => void;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState<RoleRoadmapRequest>(initial);
  const [problem, setProblem] = useState<string | null>(null);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = roleProblem(value.role);
    setProblem(p);
    if (!p) onBuild({ role: value.role.trim(), level: value.level, note: value.note.trim() });
  };
  return (
    <form noValidate onSubmit={submit} className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      {banner}
      <Card padding="lg" className="flex flex-col gap-5">
        <header className="flex flex-col gap-1">
          <span className="text-caption font-strong uppercase tracking-wider text-accent">Your roadmap</span>
          <h2 className="text-headline font-strong text-fg">Which role do you want to prepare for?</h2>
          <p className="text-body-lg text-fg-muted">
            Nomadic works out what the role needs and splits it into subjects, modules and topics. Each topic gets its own YouTube and ChatGPT buttons.
          </p>
        </header>
        <RoleFields value={value} onChange={(v) => { setProblem(null); setValue(v); }} error={problem} autoFocus />
        {error && <p role="alert" className="text-body text-danger-fg">{error}</p>}
        {replacing && <p className="text-caption text-fg-subtle">This replaces your {replacing} roadmap. Topics with the same names keep their progress.</p>}
        <div className="flex items-center gap-2 border-t border-line pt-4">
          {onCancel && <Button variant="ghost" onClick={onCancel}>Cancel</Button>}
          <div className="flex-1" />
          <Button type="submit" variant="primary" size="lg" rightIcon={<Sparkles />}>Build my roadmap</Button>
        </div>
      </Card>
    </form>
  );
}

/** While the AI builds the roadmap (up to a minute). */
export function BuildingRoadmap({ role }: { role: string }) {
  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-4" aria-busy="true" aria-live="polite">
      <Card padding="lg" className="flex flex-col gap-3">
        <span className="text-caption font-strong uppercase tracking-wider text-accent">Building your roadmap</span>
        <h2 className="text-headline font-strong text-fg">{role}</h2>
        <p className="text-body text-fg-muted">
          Nomadic is working out what a {role.toLowerCase()} needs to know and listing the topics in study order. This takes up to a minute.
        </p>
        <ol className="flex flex-col gap-1.5 text-body text-fg-muted">
          <li className="flex items-center gap-2"><ArrowRight className="size-4 text-accent" aria-hidden="true" /> Finding the skills the role needs</li>
          <li className="flex items-center gap-2"><ArrowRight className="size-4 text-accent" aria-hidden="true" /> Grouping them into subjects and modules</li>
          <li className="flex items-center gap-2"><ArrowRight className="size-4 text-accent" aria-hidden="true" /> Listing the topics and five projects</li>
        </ol>
      </Card>
      <Skeleton height={56} radius="lg" />
      <Skeleton height={56} radius="lg" />
      <Skeleton height={56} radius="lg" />
    </section>
  );
}
