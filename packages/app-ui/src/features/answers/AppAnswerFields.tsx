import React from 'react';
import { Sparkles } from 'lucide-react';
import { Badge, Field, Input, Textarea } from '@nomadic/ui';
import { APP_ANSWERS, GROUP_LABEL, type AppAnswerDef, type AppAnswerGroup } from '@nomadic/app-core/shared/applicationAnswers';

const chipClass = (on: boolean) =>
  [
    'inline-flex h-7 items-center rounded-md border px-2.5 text-label transition-colors duration-fast',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
    on ? 'border-accent bg-accent-subtle text-accent-subtle-fg' : 'border-line bg-surface text-fg-muted hover:border-line-strong hover:text-fg',
  ].join(' ');

interface AppAnswerFieldsProps {
  values: Record<string, string>;
  onChange: (id: string, value: string) => void;
  groups?: AppAnswerGroup[];
  /** Ids whose value is an unconfirmed AI or resume draft. */
  drafted?: ReadonlySet<string>;
  idPrefix?: string;
  /** Hide group headings (when the caller renders its own). */
  headings?: boolean;
  filter?: (d: AppAnswerDef) => boolean;
}

/** Fields for the stored application answers, grouped. Choices can be cleared by clicking again. */
export const AppAnswerFields: React.FC<AppAnswerFieldsProps> = ({ values, onChange, groups, drafted, idPrefix = 'ans', headings = true, filter }) => {
  const order = groups ?? (Object.keys(GROUP_LABEL) as AppAnswerGroup[]);
  return (
    <div className="flex flex-col gap-6">
      {order.map((g) => {
        const defs = APP_ANSWERS.filter((d) => d.group === g && (!filter || filter(d)));
        if (!defs.length) return null;
        return (
          <section key={g} aria-labelledby={headings ? `${idPrefix}-g-${g}` : undefined} className="flex flex-col gap-3">
            {headings && <h3 id={`${idPrefix}-g-${g}`} className="text-label font-strong uppercase tracking-wide text-fg-subtle">{GROUP_LABEL[g]}</h3>}
            <div className="grid gap-4 sm:grid-cols-2">
              {defs.map((d) => (
                <AnswerField key={d.id} def={d} value={values[d.id] ?? ''} onChange={(v) => onChange(d.id, v)} drafted={drafted?.has(d.id)} idPrefix={idPrefix} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
};

const AnswerField: React.FC<{ def: AppAnswerDef; value: string; onChange: (v: string) => void; drafted?: boolean; idPrefix: string }> = ({
  def, value, onChange, drafted, idPrefix,
}) => {
  const id = `${idPrefix}-${def.id}`;
  const label = (
    <span className="inline-flex items-center gap-2">
      {def.label}
      {drafted && value && (
        <Badge tone="accent" className="gap-1"><Sparkles className="size-3" aria-hidden="true" />Draft, check it</Badge>
      )}
    </span>
  );
  if (def.kind === 'yesno' || def.kind === 'choice') {
    const options = def.kind === 'yesno' ? ['Yes', 'No'] : def.options ?? [];
    return (
      <Field label={label} hint={def.hint} className={def.kind === 'choice' ? 'sm:col-span-2' : undefined}>
        <div role="group" aria-label={def.label} className="flex flex-wrap gap-1.5">
          {options.map((o) => {
            const on = value === o;
            return (
              <button key={o} type="button" aria-pressed={on} className={chipClass(on)} onClick={() => onChange(on ? '' : o)}>
                {o}
              </button>
            );
          })}
        </div>
      </Field>
    );
  }
  if (def.kind === 'long') {
    return (
      <Field label={label} id={id} hint={def.hint} className="sm:col-span-2">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          autoResize
          maxRows={10}
          maxLength={def.maxChars}
          placeholder="Write it once; Nomadic reuses it wherever a form asks this."
        />
      </Field>
    );
  }
  return (
    <Field label={label} id={id} hint={def.hint}>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={def.placeholder} maxLength={def.maxChars ?? 200} />
    </Field>
  );
};
