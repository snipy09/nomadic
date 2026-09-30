import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runAllScrapersWithReport } from './index.ts';
import { formatRunTable } from './pipeline.ts';

// Live benchmark: run on a machine with normal internet access. Writes results/latest.md.
const includeTier3 = process.argv.includes('--tier3');
const t0 = Date.now();
const report = await runAllScrapersWithReport(undefined, { includeTier3 });
const withUrl = report.jobs.length;
const dead = report.boards.filter((b) => !b.ok);
const md = [
  `# Scraper benchmark (${new Date().toISOString()})`,
  '',
  `Total unique valid jobs: **${withUrl}** in ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  '',
  formatRunTable(report.sources),
  '',
  `## ATS boards (${report.boards.length - dead.length}/${report.boards.length} healthy)`,
  ...report.boards.map((b) => `- ${b.ok ? 'ok ' : 'DEAD'} ${b.board} (${b.type}): ${b.count} jobs, ${b.ms} ms${b.error ? ` - ${b.error}` : ''}`),
  '',
  '## Dropped records by reason',
  ...Object.entries(report.invalidReasons).map(([k, v]) => `- ${k}: ${v}`),
  '',
  '## Alerts',
  ...(report.alerts.length ? report.alerts.map((a) => `- ${a.message}`) : ['- none']),
].join('\n');
console.log(md);
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'results');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'latest.md'), md);
