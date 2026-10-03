/**
 * Code runner contract. Execution is in-browser only: a JS Web Worker and
 * Pyodide (see practice/browser-runners.ts). This module builds the harness
 * and grades results so the same logic is testable in Node.
 */
import type { CodeItem, CodeLanguage, CodeTest } from './types';
import type { GradeResult } from './grading';

export interface TestOutcome {
  index: number;
  passed: boolean;
  hidden: boolean;
  /** Only for visible tests: actual value or error message. */
  actual?: unknown;
  error?: string;
}

export interface RunResult {
  outcomes: TestOutcome[];
  timedOut: boolean;
  /** Runtime-level failure (syntax error, missing entry point). */
  error?: string;
  durationMs: number;
}

export interface CodeRunner {
  readonly language: CodeLanguage;
  run(code: string, item: CodeItem): Promise<RunResult>;
}

/** Deep structural equality for JSON-like values (order-sensitive arrays, key-order-insensitive objects). */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') return Number.isNaN(a) && Number.isNaN(b);
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((v, i) => jsonEqual(v, bb[i]));
  }
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => jsonEqual((a as any)[k], (b as any)[k]));
}

/** Source evaluated inside the JS worker: defines user code, then returns raw results per test. */
export function buildJsHarness(code: string, entryPoint: string, tests: CodeTest[]): string {
  return `${code}
;return (async () => {
  const __tests = ${JSON.stringify(tests.map((t) => t.args))};
  const __out = [];
  if (typeof ${entryPoint} !== 'function') throw new Error('Entry point ${entryPoint} is not defined');
  for (const args of __tests) {
    try { __out.push({ ok: true, value: await ${entryPoint}(...structuredClone(args)) }); }
    catch (e) { __out.push({ ok: false, error: String(e && e.message || e) }); }
  }
  return __out;
})();`;
}

/** Python source run by Pyodide; prints one JSON line with raw results. */
export function buildPythonHarness(code: string, entryPoint: string, tests: CodeTest[]): string {
  return `${code}

import json as __json
__tests = __json.loads(${JSON.stringify(JSON.stringify(tests.map((t) => t.args)))})
__out = []
for __args in __tests:
    try:
        __out.append({"ok": True, "value": ${entryPoint}(*__args)})
    except Exception as __e:
        __out.append({"ok": False, "error": str(__e)})
__json.dumps(__out)
`;
}

export type RawResult = { ok: true; value: unknown } | { ok: false; error: string };

export function compareResults(tests: CodeTest[], raw: RawResult[]): TestOutcome[] {
  return tests.map((t, index) => {
    const r = raw[index];
    const passed = Boolean(r && r.ok && jsonEqual(r.value, t.expected));
    const base = { index, passed, hidden: t.hidden };
    if (t.hidden) return base;
    return r?.ok ? { ...base, actual: r.value } : { ...base, error: r ? r.error : 'no result' };
  });
}

export function gradeRun(result: RunResult): GradeResult {
  if (result.error || result.timedOut || result.outcomes.length === 0) {
    return { correct: false, score: 0, feedback: result.timedOut ? 'Time limit exceeded.' : result.error };
  }
  const passed = result.outcomes.filter((o) => o.passed).length;
  const score = passed / result.outcomes.length;
  return {
    correct: score === 1,
    score,
    feedback: score === 1 ? undefined : `${passed}/${result.outcomes.length} tests passed.`,
  };
}

export async function runCodeItem(
  runner: CodeRunner,
  item: CodeItem,
  code: string
): Promise<{ run: RunResult; grade: GradeResult }> {
  if (runner.language !== item.language) throw new Error(`runner for ${runner.language} cannot run ${item.language}`);
  const run = await runner.run(code, item);
  return { run, grade: gradeRun(run) };
}
