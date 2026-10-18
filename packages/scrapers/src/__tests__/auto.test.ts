import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { dueTasks, emptyState, folderPaths, formatStatus, loadState, nextDueAt, runAuto, takeLock, taskArgs } from '../auto/runner.js';
import { DEFAULT_SETTINGS, TASK_IDS, readSettings } from '../auto/settings.js';

const NOW = new Date('2026-10-07T06:00:00Z');
const H = 3_600_000;
const home = () => mkdtempSync(join(tmpdir(), 'scraper-home-'));
// runAuto sets SCRAPER_* variables for the scrapers it starts; keep them out of other tests.
const savedEnv = { ...process.env };
afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
  Object.assign(process.env, savedEnv);
});

describe('settings.ini', () => {
  it('the shipped settings.ini parses to the defaults with no warnings', () => {
    const text = readFileSync(resolve(__dirname, '../../../../scripts/scraper-folder/settings.ini'), 'utf8');
    expect(readSettings(text)).toEqual({ settings: DEFAULT_SETTINGS, warnings: [] });
  });

  it('reads intervals and limits, and falls back on bad values with a warning', () => {
    const { settings, warnings } = readSettings(`
      ; comment
      [schedule]
      jobs = 2      ; every two hours
      contacts = 0
      news = soon
      [general]
      region = all
      [jobs]
      include_naukri_and_indeed = yes
      max_new_per_run = 2500
      [news]
      feeds_off = et-it, ht-jobs
      [mystery]
      x = 1
    `);
    expect(settings.every).toMatchObject({ jobs: 2, contacts: 0, news: 3 });
    expect(settings.region).toBe('all');
    expect(settings.jobs).toMatchObject({ includeTier3: true, maxNewPerRun: 2500 });
    expect(settings.news.feedsOff).toEqual(['et-it', 'ht-jobs']);
    expect(warnings).toEqual(['[schedule] news = soon is not a number from 0 to 744: using 3', 'unknown setting [mystery] x (ignored)']);
    expect(readSettings(null).warnings[0]).toMatch(/not found/);
    // Notepad may save with a byte order mark.
    expect(readSettings('\uFEFF[schedule]\r\njobs = 2\r\n').settings.every.jobs).toBe(2);
  });
});

describe('schedule', () => {
  it('runs everything never run, then each scraper after its interval (10 minutes early is fine)', () => {
    const state = emptyState();
    expect(dueTasks(NOW, DEFAULT_SETTINGS, state)).toEqual([...TASK_IDS]);
    for (const id of TASK_IDS) state[id] = { lastStartedAt: new Date(NOW.getTime() - 5 * H).toISOString(), lastFinishedAt: NOW.toISOString(), lastOk: true, failures: 0 };
    expect(dueTasks(NOW, DEFAULT_SETTINGS, state)).toEqual(['news']);
    expect(dueTasks(new Date(NOW.getTime() + 50 * 60_000), DEFAULT_SETTINGS, state)).toEqual(['jobs', 'news']);
  });

  it('retries a failed scraper after an hour, doubling up to its interval, and skips one turned off', () => {
    const state = emptyState();
    state.jobs = { lastStartedAt: NOW.toISOString(), lastFinishedAt: NOW.toISOString(), lastOk: false, failures: 1 };
    expect(nextDueAt('jobs', DEFAULT_SETTINGS, state)?.getTime()).toBe(NOW.getTime() + H);
    state.jobs.failures = 3;
    expect(nextDueAt('jobs', DEFAULT_SETTINGS, state)?.getTime()).toBe(NOW.getTime() + 4 * H);
    state.jobs.failures = 9;
    expect(nextDueAt('jobs', DEFAULT_SETTINGS, state)?.getTime()).toBe(NOW.getTime() + 6 * H);
    expect(nextDueAt('contacts', { ...DEFAULT_SETTINGS, every: { ...DEFAULT_SETTINGS.every, contacts: 0 } }, state)).toBeNull();
  });

  it('builds each scraper command from the settings', () => {
    const paths = folderPaths('/S');
    expect(taskArgs('jobs', DEFAULT_SETTINGS, paths, false)).toEqual([
      'run', '--publish', '--max-new', '5000', '--max-age-days', '30', '--region', 'india', '--summary-dir', join('/S', 'reports', 'jobs'), '--json', join('/S', 'state', 'jobs-report.json'),
    ]);
    expect(taskArgs('news', DEFAULT_SETTINGS, paths, true)).toEqual(['news', '--max-age-days', '30', '--summary-dir', join('/S', 'reports', 'news')]);
    expect(taskArgs('discover', DEFAULT_SETTINGS, paths, false)).toEqual(['discover', '--out', join('/S', 'state', 'boards.json'), '--summary-dir', join('/S', 'reports', 'discover')]);
    expect(taskArgs('hackathons', DEFAULT_SETTINGS, paths, false)).toContain('hackathons');
  });
});

describe('auto run', () => {
  it('runs the due scrapers in order, records results and history, and frees the lock', async () => {
    const dir = home();
    writeFileSync(join(dir, 'settings.ini'), '[schedule]\ncontacts = 0\n');
    const calls: string[][] = [];
    let t = NOW.getTime();
    const result = await runAuto({
      home: dir,
      now: () => new Date((t += 1000)),
      log: () => undefined,
      exec: async (args) => {
        calls.push(args);
        if (args[0] === 'news') throw new Error('feeds down');
        return 0;
      },
    });
    expect(calls.map((a) => a.slice(0, 3).join(' '))).toEqual([
      expect.stringMatching(/^discover/),
      'run --publish --max-new',
      'feed --sources companies',
      'feed --sources hackathons',
      'news --publish --max-age-days',
    ]);
    expect(result.ran.map((r) => [r.task, r.ok])).toEqual([['discover', true], ['jobs', true], ['companies', true], ['hackathons', true], ['news', false]]);
    const state = loadState(join(dir, 'state', 'auto-state.json'));
    expect(state.news).toMatchObject({ lastOk: false, lastError: 'feeds down', failures: 1 });
    expect(state.jobs.lastOk).toBe(true);
    expect(existsSync(join(dir, 'state', 'auto.lock'))).toBe(false);
    expect(readFileSync(join(dir, 'reports', 'history.csv'), 'utf8').trim().split('\n')).toHaveLength(6);
    expect(process.env.SCRAPER_BOARDS_FILE).toBe(join(dir, 'state', 'boards.json'));
    // Right after: nothing is due.
    calls.length = 0;
    await runAuto({ home: dir, now: () => new Date(t), log: () => undefined, exec: async (a) => (calls.push(a), 0) });
    expect(calls).toEqual([]);
    expect(formatStatus(dir, new Date(t))).toMatch(/Hiring news\s+3 h\s+.+FAILED/);
  });

  it('forced and dry runs ignore the schedule and leave it untouched', async () => {
    const dir = home();
    const calls: string[][] = [];
    await runAuto({ home: dir, force: ['jobs'], dryRun: true, now: () => NOW, log: () => undefined, exec: async (a) => (calls.push(a), 0) });
    expect(calls).toEqual([expect.not.arrayContaining(['--publish'])]);
    expect(loadState(join(dir, 'state', 'auto-state.json')).jobs.lastStartedAt).toBeUndefined();
  });

  it('counts a boards file from a dry run as discovery, so the next check and "run everything" skip it', async () => {
    const dir = home();
    const calls: string[][] = [];
    const exec = async (a: string[]) => {
      calls.push(a);
      // discover writes state/boards.json even in a dry run.
      if (a[0] === 'discover') writeFileSync(join(dir, 'state', 'boards.json'), JSON.stringify({ version: 1, generatedAt: NOW.toISOString(), boards: [] }));
      return 0;
    };
    await runAuto({ home: dir, force: 'all', dryRun: true, now: () => NOW, log: () => undefined, exec });
    expect(calls.map((a) => a[0])).toContain('discover');
    calls.length = 0;
    const later = new Date(NOW.getTime() + 0.5 * H);
    await runAuto({ home: dir, now: () => later, log: () => undefined, exec });
    expect(calls.map((a) => a[0])).not.toContain('discover');
    expect(calls.length).toBeGreaterThan(0);
    calls.length = 0;
    const logs: string[] = [];
    await runAuto({ home: dir, force: 'all', dryRun: true, now: () => later, log: (m) => logs.push(m), exec });
    expect(calls.map((a) => a[0])).not.toContain('discover');
    expect(logs.join('\n')).toMatch(/Find company job boards: skipped/);
    calls.length = 0;
    await runAuto({ home: dir, force: ['discover'], dryRun: true, now: () => later, log: () => undefined, exec });
    expect(calls.map((a) => a[0])).toEqual(['discover']);
  });

  it('does not start while a live run holds the lock, and takes over a stale one', async () => {
    const dir = home();
    mkdirSync(join(dir, 'state'), { recursive: true });
    const lock = join(dir, 'state', 'auto.lock');
    writeFileSync(lock, JSON.stringify({ pid: process.pid, startedAt: NOW.toISOString() }));
    const r = await runAuto({ home: dir, now: () => NOW, log: () => undefined, exec: async () => 0 });
    expect(r.locked).toMatch(/process/);
    writeFileSync(lock, JSON.stringify({ pid: process.pid, startedAt: new Date(NOW.getTime() - 7 * H).toISOString() }));
    expect(takeLock(lock, NOW)).toEqual({ ok: true });
  });
});
