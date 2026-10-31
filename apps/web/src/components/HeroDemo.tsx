import { CSSProperties, KeyboardEvent, useEffect, useState } from 'react';
import {
  APPLY_FIELDS,
  APPLY_FORM_TITLE,
  BOARD_STAGES,
  BOARD_START,
  JOBS,
  ROADMAP,
  ROADMAP_STATUS_LABEL,
  STAGES,
} from '../content';
import { usePrefersReducedMotion } from '../hooks';
import Logo from './Logo';

const DWELL = 5600;

const delay = (ms: number, extra: Record<string, string | number> = {}) =>
  ({ '--d': `${ms}ms`, ...extra } as CSSProperties);

function LearnPane() {
  return (
    <div>
      <p className="text-sm text-ink-soft">Target role</p>
      <p className="wide anim-type mt-1 text-2xl" style={delay(60)}>
        Quant trader
      </p>
      <ul className="mt-4 divide-y divide-rule border-y border-rule">
        {ROADMAP.map((node, i) => (
          <li
            key={node.id}
            className="anim-slide grid grid-cols-[1fr_auto] items-center gap-x-3 py-2.5"
            style={delay(260 + i * 90)}
          >
            <div>
              <p className="text-[15px] font-semibold leading-tight">{node.title}</p>
              <p className="text-xs text-ink-soft">{node.level}</p>
            </div>
            <span className="nums text-sm font-bold">
              {node.status === 'active' ? `${node.progress}%` : ROADMAP_STATUS_LABEL[node.status]}
            </span>
            <div className="col-span-2 mt-1.5 h-1.5 bg-rule">
              <div
                className="anim-bar h-full bg-ultra"
                style={delay(420 + i * 90, { '--to': node.progress / 100 })}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FindPane() {
  return (
    <div>
      <div className="flex h-11 items-center border-2 border-ink bg-white px-3 text-[15px]">
        <span className="anim-type inline-block" style={delay(100)}>
          react intern, bengaluru
        </span>
        <span aria-hidden className="anim-caret ml-0.5 h-5 w-0.5 bg-ink" />
      </div>
      <ul className="mt-3 divide-y divide-rule border-y border-rule">
        {JOBS.slice(0, 4).map((job, i) => (
          <li
            key={job.id}
            className="anim-slide grid grid-cols-[1fr_auto] items-center gap-x-3 py-3"
            style={delay(750 + i * 110)}
          >
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold leading-tight">{job.role}</p>
              <p className="truncate text-xs text-ink-soft">
                {job.company}, from {job.source}
              </p>
            </div>
            <span className="nums wide text-xl">{job.match}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ApplyPane() {
  return (
    <div>
      <p className="text-sm text-ink-soft">Application form</p>
      <p className="text-[15px] font-semibold leading-tight">{APPLY_FORM_TITLE}</p>
      <dl className="mt-3 border-y border-rule">
        {APPLY_FIELDS.map((field, i) => (
          <div
            key={field.label}
            className="grid grid-cols-[5.5rem_1fr] items-center gap-x-3 border-b border-rule py-2 last:border-b-0"
          >
            <dt className="text-xs text-ink-soft">{field.label}</dt>
            <dd className="min-w-0">
              <span
                className="anim-type block truncate text-[14px] font-semibold"
                style={delay(250 + i * 520)}
              >
                {field.value}
              </span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="anim-fade mt-3 text-sm font-semibold" style={delay(250 + APPLY_FIELDS.length * 520 + 200)}>
        All {APPLY_FIELDS.length} fields filled. You review each one, tick, then submit.
      </p>
    </div>
  );
}

function TrackPane() {
  const total = BOARD_START.length;
  const counts = BOARD_STAGES.map((_, stage) => BOARD_START.filter((card) => card.stage === stage).length);
  const max = Math.max(...counts);
  const next = BOARD_START.find((card) => card.stage === 2);

  return (
    <div>
      <p className="text-sm text-ink-soft">{total} applications on your board</p>
      <ul className="mt-3 space-y-2.5">
        {BOARD_STAGES.map((name, i) => (
          <li key={name} className="grid grid-cols-[6.75rem_1fr_1.5rem] items-center gap-x-3">
            <span className="text-sm font-semibold">{name}</span>
            <div className="h-6 bg-rule">
              <div
                className="anim-bar h-full bg-ultra"
                style={delay(150 + i * 110, { '--to': counts[i] / max })}
              />
            </div>
            <span className="nums text-right text-sm font-bold">{counts[i]}</span>
          </li>
        ))}
      </ul>
      {next && (
        <p className="anim-fade mt-5 border-t border-rule pt-3 text-sm" style={delay(900)}>
          <span className="font-bold">Next up:</span> {next.company}, {next.note.charAt(0).toLowerCase() + next.note.slice(1)}.
        </p>
      )}
    </div>
  );
}

const PANES = [LearnPane, FindPane, ApplyPane, TrackPane];

/**
 * The one orchestrated motion on the page. It steps through the four jobs
 * Nomadic does. Clicking a tab takes over, and the pause control is always visible.
 */
export default function HeroDemo() {
  const reduced = usePrefersReducedMotion();
  const [stage, setStage] = useState(0);
  const [playing, setPlaying] = useState(!reduced);

  useEffect(() => {
    if (reduced) setPlaying(false);
  }, [reduced]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => setStage((current) => (current + 1) % STAGES.length), DWELL);
    return () => window.clearTimeout(timer);
  }, [playing, stage]);

  const pick = (index: number) => {
    setStage(index);
    setPlaying(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    const step = keys[event.key];
    if (!step) return;
    event.preventDefault();
    const next = (stage + step + STAGES.length) % STAGES.length;
    pick(next);
    document.getElementById(`demo-tab-${STAGES[next].id}`)?.focus();
  };

  const Pane = PANES[stage];

  return (
    <div className="anim-window border-2 border-ink bg-white text-ink shadow-[8px_8px_0_0_#0A0F2C]" style={delay(900)}>
      <div className="flex min-h-11 items-center justify-between gap-3 border-b-2 border-ink bg-fog px-3">
        <Logo className="h-4 shrink-0" />
        <div className="flex items-center gap-3 text-xs sm:gap-4">
          <span className="hidden text-ink-soft min-[380px]:inline">Sample data</span>
          <button
            type="button"
            onClick={() => setPlaying((value) => !value)}
            className="py-3 font-bold underline decoration-2 underline-offset-2"
          >
            {playing ? 'Pause demo' : 'Play demo'}
          </button>
        </div>
      </div>

      <div className="grid sm:grid-cols-[8.5rem_1fr]">
        <div
          role="tablist"
          aria-label="What Nomadic does"
          aria-orientation="vertical"
          onKeyDown={onKeyDown}
          className="grid grid-cols-[repeat(4,minmax(0,1fr))] border-b-2 border-ink bg-fog sm:grid-cols-1 sm:border-b-0 sm:border-r-2"
        >
          {STAGES.map((item, i) => {
            const active = i === stage;
            return (
              <button
                key={item.id}
                id={`demo-tab-${item.id}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls="demo-panel"
                tabIndex={active ? 0 : -1}
                onClick={() => pick(i)}
                className={`relative flex min-h-12 min-w-0 flex-col items-start justify-center gap-0.5 px-2 py-2 text-left text-sm font-semibold sm:min-h-0 sm:flex-row sm:items-center sm:justify-start sm:gap-2 sm:px-3 sm:py-4 sm:text-[15px] ${
                  active ? 'bg-marigold' : 'hover:bg-white'
                }`}
              >
                <span className="nums text-xs font-bold text-ink-soft">{i + 1}</span>
                <span className={active ? 'font-bold' : ''}>{item.label}</span>
                {active && playing && (
                  <span
                    key={`${stage}-${playing}`}
                    aria-hidden
                    className="anim-bar absolute bottom-0 left-0 h-[3px] w-full bg-ink"
                    style={{ animationDuration: `${DWELL}ms`, animationTimingFunction: 'linear' }}
                  />
                )}
              </button>
            );
          })}
        </div>

        <div
          id="demo-panel"
          role="tabpanel"
          aria-labelledby={`demo-tab-${STAGES[stage].id}`}
          className="min-h-[21.5rem] min-w-0 p-3 min-[400px]:p-4 sm:p-5"
        >
          <Pane key={stage} />
        </div>
      </div>
    </div>
  );
}
