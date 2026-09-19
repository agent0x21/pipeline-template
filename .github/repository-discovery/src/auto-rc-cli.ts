import fs from 'node:fs';
import path from 'node:path';
import { findAutoRcCandidates } from './auto-rc.js';
import { publishAutoRcSummary } from './summary.js';

const args = process.argv.slice(2);
const value = (flag: string) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
const root = path.resolve(value('--root') ?? '.');
const head = value('--head') ?? 'HEAD';
const output = process.env.GITHUB_OUTPUT;
if (!output) throw new Error('GITHUB_OUTPUT is not available; this command must run in GitHub Actions.');

const candidates = findAutoRcCandidates(root, head);
const include = candidates.map(({ application, reason }) => ({
  id: application.id,
  name: application.name,
  path: application.path || '.',
  ecosystem: application.ecosystem,
  reason,
}));
fs.appendFileSync(output, `matrix=${JSON.stringify({ include })}\nhas_affected=${include.length > 0}\n`);
publishAutoRcSummary(candidates);
