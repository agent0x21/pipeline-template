import fs from 'node:fs';
import path from 'node:path';
import { discover } from './discover.js';
import { publishSummary } from './summary.js';

const args = process.argv.slice(2);
const root = path.resolve(args[0] && !args[0].startsWith('-') ? args[0] : '.');
const outputIndex = args.indexOf('--output');
const output = outputIndex >= 0 ? args[outputIndex + 1] : undefined;
const summary = args.includes('--summary');
const manifest = JSON.stringify(discover(root), null, 2) + '\n';
if (output) fs.writeFileSync(path.resolve(root, output), manifest);
else process.stdout.write(manifest);

if (summary) {
  if (!output) throw new Error('--summary requires --output so the generated manifest can be summarized.');
  publishSummary(path.resolve(root, output));
}
