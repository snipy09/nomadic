// Agent build for the Android instrumentation test only: the production agent plus read-only
// commands the harness uses to score fixtures (never shipped in the app).
import { install } from '../../form-engine/src/agent/agent.js';
import { readInPage } from '../../form-bench/src/score.js';

type W = Window & { __fixtureReady?: boolean; __submitted?: boolean };

install({
  benchRead: (spec: { selector: string; read: string; shadow?: string[] }) => readInPage(spec),
  benchReady: () => (window as W).__fixtureReady === true,
  benchSubmitted: () => Boolean((window as W).__submitted),
});
