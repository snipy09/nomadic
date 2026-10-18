import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { TASK_IDS, TASK_LABEL, readSettings, type AutoSettings, type TaskId } from './settings.js';

/**
 * Auto mode for the Desktop scraper folder. Windows Task Scheduler starts `auto` every 30 minutes (and at sign-in);
 * each start runs the scrapers whose interval has passed, one after another, then exits. State (last run and
 * result per scraper) lives in state/auto-state.json; a lock file stops two runs overlapping. A scraper that failed is
 * tried again after an hour (doubling up to its interval), not every 30 minutes.
 *
 * Folder layout (the "home"):  settings.ini, .env, state/, reports/<task>/, logs/auto-<yyyy-mm>.log
 */

export interface TaskState {
  lastStartedAt?: string;
  lastFinishedAt?: string;
  lastOk?: boolean;
  lastError?: string | null;
  failures: number;
}

export type AutoState = Record<TaskId, TaskState>;

export const emptyState = (): AutoState => Object.fromEntries(TASK_IDS.map((id) => [id, { failures: 0 }])) as AutoState;

/** A run counts as due this many minutes early, so a 6-hour interval does not slip by a scheduler tick each time. */
const EARLY_MS = 10 * 60_000;
const HOUR = 3_600_000;

/** When a scraper should run next: null = turned off; a past date = due now. */
export function nextDueAt(task: TaskId, settings: AutoSettings, state: AutoState): Date | null {
  const hours = settings.every[task];
  if (!hours) return null;
  const t = state[task] ?? { failures: 0 };
  if (!t.lastStartedAt) return new Date(0);
  const every = hours * HOUR;
  if (t.lastOk === false && t.lastFinishedAt) {
    const backoff = Math.min(every, HOUR * 2 ** Math.max(0, t.failures - 1));
    return new Date(Date.parse(t.lastFinishedAt) + backoff);
  }
  return new Date(Date.parse(t.lastStartedAt) + every);
}

export function dueTasks(now: Date, settings: AutoSettings, state: AutoState): TaskId[] {
  return TASK_IDS.filter((id) => {
    const at = nextDueAt(id, settings, state);
    return at !== null && at.getTime() - EARLY_MS <= now.getTime();
  });
}

export interface FolderPaths {
  home: string;
  settings: string;
  env: string;
  state: string;
  stateFile: string;
  lock: string;
  boards: string;
  reports: string;
  logs: string;
}

export function folderPaths(home: string): FolderPaths {
  return {
    home,
    settings: join(home, 'settings.ini'),
    env: join(home, '.env'),
    state: join(home, 'state'),
    stateFile: join(home, 'state', 'auto-state.json'),
    lock: join(home, 'state', 'auto.lock'),
    boards: join(home, 'state', 'boards.json'),
    reports: join(home, 'reports'),
    logs: join(home, 'logs'),
  };
}

export function loadState(path: string): AutoState {
  const base = emptyState();
  if (!existsSync(path)) return base;
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    for (const id of TASK_IDS) if (data?.[id] && typeof data[id] === 'object') base[id] = { ...base[id], ...data[id] };
  } catch {
    /* a broken state file only means every scraper is due */
  }
  return base;
}

/**
 * Board discovery writes no Supabase data, so a dry run of it ("Test all sources") does the same work as a real run
 * and leaves a fresh state/boards.json. Counting that file as its last run stops the next scheduled check from
 * probing every board again (it took ~8 minutes and 1,800 requests).
 */
export function withBoardsFile(state: AutoState, boardsPath: string): AutoState {
  if (!existsSync(boardsPath)) return state;
  try {
    const at = JSON.parse(readFileSync(boardsPath, 'utf8'))?.generatedAt;
    const ms = typeof at === 'string' ? Date.parse(at) : NaN;
    const last = state.discover.lastStartedAt ? Date.parse(state.discover.lastStartedAt) : 0;
    if (Number.isFinite(ms) && ms > last) {
      return { ...state, discover: { ...state.discover, lastStartedAt: at, lastFinishedAt: at, lastOk: true, lastError: null, failures: 0 } };
    }
  } catch {
    /* an unreadable boards file only means discovery is due */
  }
  return state;
}

function saveState(path: string, state: AutoState) {
  writeFileSync(`${path}.tmp`, JSON.stringify(state, null, 2));
  renameSync(`${path}.tmp`, path);
}

const pidAlive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
};

/** Takes the lock unless a live run holds it. A lock older than 6 hours is stale whatever its process. */
export function takeLock(path: string, now: Date): { ok: true } | { ok: false; holder: string } {
  if (existsSync(path)) {
    try {
      const held = JSON.parse(readFileSync(path, 'utf8'));
      const age = now.getTime() - Date.parse(held.startedAt);
      if (Number.isFinite(age) && age < 6 * HOUR && typeof held.pid === 'number' && pidAlive(held.pid)) {
        return { ok: false, holder: `process ${held.pid} since ${held.startedAt}` };
      }
    } catch {
      /* unreadable lock: take it over */
    }
  }
  writeFileSync(path, JSON.stringify({ pid: process.pid, startedAt: now.toISOString() }));
  return { ok: true };
}

/** Environment the scrapers read for the settings that are not CLI flags. */
export function settingsEnv(settings: AutoSettings, paths: FolderPaths): Record<string, string> {
  return {
    SCRAPER_BOARDS_FILE: paths.boards,
    SCRAPER_REGION: settings.region,
    SCRAPER_INTERNSHALA_PAGES: String(settings.jobs.internshalaPages),
    SCRAPER_UNSTOP_PAGES: String(settings.jobs.unstopPages),
    SCRAPER_MAX_PAGES: String(settings.jobs.careersPages),
    ADZUNA_MAX_CALLS: String(settings.adzuna.maxCallsPerRun),
    SCRAPER_NEWS_FEEDS_OFF: settings.news.feedsOff.join(','),
  };
}

/** The CLI arguments for one scraper. */
export function taskArgs(task: TaskId, settings: AutoSettings, paths: FolderPaths, dryRun: boolean): string[] {
  const publish = dryRun ? [] : ['--publish'];
  const summary = ['--summary-dir', join(paths.reports, task)];
  switch (task) {
    case 'discover':
      return ['discover', '--out', paths.boards, ...summary];
    case 'jobs':
      return [
        'run',
        ...publish,
        '--max-new',
        String(settings.jobs.maxNewPerRun),
        '--max-age-days',
        String(settings.jobs.maxAgeDays),
        '--region',
        settings.region,
        ...(settings.jobs.includeTier3 ? ['--include-tier3'] : []),
        ...summary,
        '--json',
        join(paths.state, 'jobs-report.json'),
      ];
    case 'companies':
      return ['feed', '--sources', 'companies', ...publish, '--region', settings.region, '--max-pages', String(settings.jobs.careersPages), ...summary];
    case 'hackathons':
      return ['feed', '--sources', 'hackathons', ...publish, '--region', settings.region, ...summary];
    case 'news':
      return ['news', ...publish, '--max-age-days', String(settings.news.maxAgeDays), ...summary];
    case 'contacts':
      return ['contacts', ...publish, '--region', settings.region, ...summary];
  }
}

export interface AutoOptions {
  home: string;
  /** Run these now whatever the schedule ('all' = every scraper that is not turned off). */
  force?: TaskId[] | 'all';
  /** Scrape and report only; nothing is written to Supabase and the schedule is not touched. */
  dryRun?: boolean;
  /** Runs one scraper: the CLI's main() with these arguments; resolves to its exit code. */
  exec: (args: string[]) => Promise<number>;
  now?: () => Date;
  log?: (message: string) => void;
}

export interface AutoResult {
  locked: string | null;
  ran: { task: TaskId; ok: boolean; seconds: number; error: string | null }[];
  warnings: string[];
}

export async function runAuto(options: AutoOptions): Promise<AutoResult> {
  const now = options.now ?? (() => new Date());
  const log = options.log ?? ((m: string) => console.log(m));
  const paths = folderPaths(options.home);
  for (const dir of [paths.state, paths.reports, paths.logs]) mkdirSync(dir, { recursive: true });
  const { settings, warnings } = readSettings(existsSync(paths.settings) ? readFileSync(paths.settings, 'utf8') : null);
  for (const w of warnings) log(`[auto] settings: ${w}`);

  const lock = takeLock(paths.lock, now());
  if (!lock.ok) {
    log(`[auto] another run is still going (${lock.holder}); this one stops.`);
    return { locked: lock.holder, ran: [], warnings };
  }
  const result: AutoResult = { locked: null, ran: [], warnings };
  try {
    Object.assign(process.env, settingsEnv(settings, paths));
    const state = withBoardsFile(loadState(paths.stateFile), paths.boards);
    const due = dueTasks(now(), settings, state);
    // "Run everything" and "Test all sources" leave out a discovery that is not due: it is weekly and slow, and the
    // boards it found are still in state/boards.json. "Find company boards now" (force discover) still runs it.
    const tasks =
      options.force === 'all'
        ? TASK_IDS.filter((id) => settings.every[id] > 0 && (id !== 'discover' || due.includes(id)))
        : options.force?.length
          ? options.force
          : due;
    if (options.force === 'all' && settings.every.discover > 0 && !tasks.includes('discover')) {
      const next = nextDueAt('discover', settings, state);
      log(`[auto] ${TASK_LABEL.discover}: skipped, last run ${istTime(new Date(state.discover.lastStartedAt!))}${next ? `; next at ${istTime(next)}` : ''}.`);
    }
    if (!tasks.length) {
      const next = TASK_IDS.map((id) => ({ id, at: nextDueAt(id, settings, state) })).filter((x) => x.at) as { id: TaskId; at: Date }[];
      next.sort((a, b) => a.at.getTime() - b.at.getTime());
      log(`[auto] nothing due${next[0] ? `; next: ${TASK_LABEL[next[0].id]} at ${istTime(next[0].at)}` : ' (every scraper is turned off)'}.`);
    }
    for (const task of tasks) {
      const started = now();
      log(`[auto] ${TASK_LABEL[task]}: starting${options.dryRun ? ' (dry run)' : ''}`);
      if (!options.dryRun) {
        state[task] = { ...state[task], lastStartedAt: started.toISOString() };
        saveState(paths.stateFile, state);
      }
      let code = 1;
      let error: string | null = null;
      try {
        code = await options.exec(taskArgs(task, settings, paths, Boolean(options.dryRun)));
        if (code !== 0) error = `exit code ${code} (see reports\\${task})`;
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
      const finished = now();
      const ok = code === 0 && !error;
      const seconds = Math.round((finished.getTime() - started.getTime()) / 1000);
      result.ran.push({ task, ok, seconds, error });
      log(`[auto] ${TASK_LABEL[task]}: ${ok ? 'done' : `FAILED: ${error}`} in ${Math.floor(seconds / 60)}m ${seconds % 60}s`);
      if (!options.dryRun) {
        const prev = state[task];
        state[task] = { ...prev, lastFinishedAt: finished.toISOString(), lastOk: ok, lastError: error, failures: ok ? 0 : (prev.failures ?? 0) + 1 };
        saveState(paths.stateFile, state);
        const history = join(paths.reports, 'history.csv');
        if (!existsSync(history)) writeFileSync(history, 'started_ist,scraper,result,seconds,error\n');
        appendFileSync(history, `${istTime(started)},${task},${ok ? 'ok' : 'failed'},${seconds},"${(error ?? '').replace(/"/g, "'")}"\n`);
      }
    }
  } finally {
    rmSync(paths.lock, { force: true });
  }
  return result;
}

export const istTime = (d: Date) =>
  d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

/** The table `status` prints: every scraper, its interval, last run and result, and when it runs next. */
export function formatStatus(home: string, now: Date): string {
  const paths = folderPaths(home);
  const { settings, warnings } = readSettings(existsSync(paths.settings) ? readFileSync(paths.settings, 'utf8') : null);
  const state = withBoardsFile(loadState(paths.stateFile), paths.boards);
  const lines = ['NOMADIC SCRAPERS - STATUS', `Folder: ${home}`, `Now:    ${istTime(now)} IST`, ''];
  lines.push(`${'Scraper'.padEnd(26)} ${'Every'.padEnd(8)} ${'Last run (IST)'.padEnd(20)} ${'Result'.padEnd(8)} Next run (IST)`);
  for (const id of TASK_IDS) {
    const t = state[id];
    const next = nextDueAt(id, settings, state);
    const every = settings.every[id] ? `${settings.every[id]} h` : 'off';
    const last = t.lastStartedAt ? istTime(new Date(t.lastStartedAt)) : 'never';
    const res = t.lastOk === undefined ? '-' : t.lastOk ? 'ok' : 'FAILED';
    const nextText = next === null ? '-' : next.getTime() <= now.getTime() ? 'next check' : istTime(next);
    lines.push(`${TASK_LABEL[id].padEnd(26)} ${every.padEnd(8)} ${last.padEnd(20)} ${res.padEnd(8)} ${nextText}`);
    if (t.lastOk === false && t.lastError) lines.push(`${''.padEnd(26)} last error: ${t.lastError}`);
  }
  if (existsSync(paths.lock)) lines.push('', 'A run is in progress (state\\auto.lock).');
  if (!existsSync(paths.env)) lines.push('', 'No .env yet: run Setup.cmd to add the Supabase service key.');
  if (warnings.length) lines.push('', 'settings.ini:', ...warnings.map((w) => `  ${w}`));
  return lines.join('\n') + '\n';
}
