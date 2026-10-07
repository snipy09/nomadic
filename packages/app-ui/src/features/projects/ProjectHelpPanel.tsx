import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Clock, MessageCircleQuestion, Sparkles } from 'lucide-react';
import { Button, Card, Field, Select, Spinner, Textarea } from '@nomadic/ui';
import type { ProjectStage } from '@job-automator/learning';
import { CodeBlock } from './CodeBlock';
import { ask, cancel, formatClock, formatWait, getThread, subscribe, threadKey } from './projectHelp';

interface Props {
  projectId: string;
  stage: ProjectStage;
}

/** "Stuck?" help for one stage: ask about a step, paste code or an error, get an explanation and next steps. */
export function ProjectHelpPanel({ projectId, stage }: Props) {
  const key = threadKey(projectId, stage.id);
  const thread = useSyncExternalStore(subscribe, () => getThread(key));
  const [question, setQuestion] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<string>('all');
  const [now, setNow] = useState(() => Date.now());
  const state = thread.state;

  useEffect(() => {
    if (state.status !== 'waiting') return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [state.status]);

  const submit = () => {
    const q = question.trim();
    if (q.length < 3) return;
    void ask({ projectId, stageId: stage.id, question: q, ...(step !== 'all' ? { stepIndex: Number(step) } : {}), ...(code.trim() ? { code } : {}) });
    setQuestion('');
    setCode('');
  };

  return (
    <Card padding="md" className="flex flex-col gap-3" aria-labelledby={`help-${stage.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h4 id={`help-${stage.id}`} className="mr-auto flex items-center gap-2 text-body font-strong text-fg">
          <MessageCircleQuestion className="size-4 text-accent" aria-hidden="true" /> Stuck? Ask Nomadic AI
        </h4>
        {thread.remaining != null && <span className="text-caption text-fg-subtle">{thread.remaining} answers left today</span>}
      </div>

      {thread.answers.map((a) => (
        <div key={a.at} className="flex flex-col gap-2 rounded-lg border border-line bg-surface-sunken/60 p-3">
          <p className="text-body font-strong text-fg">{a.question}</p>
          <p className="whitespace-pre-line text-body text-fg">{a.answer}</p>
          {a.nextSteps.length > 0 && (
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-body text-fg-muted">
              {a.nextSteps.map((s) => <li key={s}>{s}</li>)}
            </ol>
          )}
          {a.code && <CodeBlock code={a.code} label="Code from the answer" />}
        </div>
      ))}

      {state.status === 'asking' && (
        <div role="status" className="flex items-center gap-2 text-body text-fg-muted">
          <Spinner size="sm" /> Thinking about "{state.request.question}"…
        </div>
      )}
      {state.status === 'waiting' && (
        <div role="status" className="flex flex-wrap items-start gap-3 rounded-lg border border-warning/40 bg-warning-subtle px-3 py-2">
          <Clock className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <div className="min-w-0 flex-1 text-body text-fg">
            <p>{state.message}</p>
            <p className="text-fg-muted">
              Your question is saved: Nomadic asks it automatically when the limit resets at {formatClock(state.retryAt)} (in {formatWait(Math.max(0, state.retryAt - now))}), as long as the app stays open.
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => cancel(key)}>Cancel</Button>
        </div>
      )}
      {state.status === 'error' && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-danger/40 bg-danger-subtle px-3 py-2 text-body text-danger-fg">
          <span className="mr-auto">{state.message}</span>
          <Button size="sm" variant="secondary" onClick={() => void ask(state.request)}>Try again</Button>
        </div>
      )}

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="grid gap-2 sm:grid-cols-[14rem_1fr]">
          <Field label="About">
            <Select
              value={step}
              onValueChange={setStep}
              options={[{ value: 'all', label: 'This stage' }, ...stage.steps.map((s, i) => ({ value: String(i), label: `Step ${i + 1}: ${s.title}` }))]}
            />
          </Field>
          <Field label="Your question" hint={`${question.length}/1000`}>
            <Textarea rows={2} maxLength={1000} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="What is going wrong, or what do you not understand?" />
          </Field>
        </div>
        <Field label="Code or error output (optional)">
          <Textarea rows={3} maxLength={6000} value={code} onChange={(e) => setCode(e.target.value)} className="font-mono" placeholder="Paste the code or the full error message" />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" variant="primary" leftIcon={<Sparkles />} disabled={question.trim().length < 3 || state.status === 'asking' || state.status === 'waiting'}>
            Ask for help
          </Button>
          <span className="text-caption text-fg-subtle">Answers explain and guide; they never do the whole project for you.</span>
        </div>
      </form>
    </Card>
  );
}
