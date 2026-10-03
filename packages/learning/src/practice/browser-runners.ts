/**
 * In-browser code runners (no server execution).
 *  - JavaScript: a dedicated Web Worker per run, terminated on timeout.
 *  - Python: Pyodide loaded from the official CDN inside a Worker.
 * Network APIs are removed from the worker scope before user code runs.
 */
import {
  buildJsHarness,
  buildPythonHarness,
  compareResults,
  type CodeRunner,
  type RawResult,
  type RunResult,
} from '../runner';
import type { CodeItem } from '../types';

export const PYODIDE_VERSION = '0.26.4';
const PYODIDE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

const LOCKDOWN = `self.fetch = undefined; self.XMLHttpRequest = undefined; self.WebSocket = undefined; self.EventSource = undefined;`;

function workerFromSource(src: string): Worker {
  const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
  const w = new Worker(url);
  URL.revokeObjectURL(url);
  return w;
}

function runInWorker(src: string, item: CodeItem, parse: (data: unknown) => RawResult[]): Promise<RunResult> {
  const started = performance.now();
  return new Promise((resolve) => {
    const worker = workerFromSource(src);
    const done = (r: Omit<RunResult, 'durationMs'>) => {
      clearTimeout(timer);
      worker.terminate();
      resolve({ ...r, durationMs: Math.round(performance.now() - started) });
    };
    const timer = setTimeout(() => done({ outcomes: [], timedOut: true }), item.timeout_ms);
    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data as { error?: string; data?: unknown };
      if (msg.error) return done({ outcomes: [], timedOut: false, error: msg.error });
      try {
        done({ outcomes: compareResults(item.tests, parse(msg.data)), timedOut: false });
      } catch (err) {
        done({ outcomes: [], timedOut: false, error: String(err) });
      }
    };
    worker.onerror = (e) => done({ outcomes: [], timedOut: false, error: e.message });
  });
}

export function createJsWorkerRunner(): CodeRunner {
  return {
    language: 'javascript',
    run(code, item) {
      const body = buildJsHarness(code, item.entry_point, item.tests);
      const src = `${LOCKDOWN}
const importScripts = undefined;
(async () => {
  try { const data = await (new Function(${JSON.stringify(body)}))(); postMessage({ data: JSON.parse(JSON.stringify(data)) }); }
  catch (e) { postMessage({ error: String(e && e.message || e) }); }
})();`;
      return runInWorker(src, item, (d) => d as RawResult[]);
    },
  };
}

export function createPyodideRunner(indexURL = PYODIDE_URL): CodeRunner {
  return {
    language: 'python',
    run(code, item) {
      const py = buildPythonHarness(code, item.entry_point, item.tests);
      const src = `importScripts(${JSON.stringify(indexURL + 'pyodide.js')});
(async () => {
  try {
    const pyodide = await loadPyodide({ indexURL: ${JSON.stringify(indexURL)} });
    ${LOCKDOWN}
    const out = await pyodide.runPythonAsync(${JSON.stringify(py)});
    postMessage({ data: out });
  } catch (e) { postMessage({ error: String(e && e.message || e) }); }
})();`;
      // Pyodide startup is slow; give it extra time beyond the item's limit.
      return runInWorker(
        src,
        { ...item, timeout_ms: item.timeout_ms + 15_000 },
        (d) => JSON.parse(String(d)) as RawResult[]
      );
    },
  };
}
