import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runBench, toMarkdown } from './bench.js';

const r = await runBench();
const md = toMarkdown(r);
console.log(md);
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'results');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'latest.md'), md);
process.exit(r.accuracy >= 0.9 && r.wrongRate < 0.02 ? 0 : 1);
