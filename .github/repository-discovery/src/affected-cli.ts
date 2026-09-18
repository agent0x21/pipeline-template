import fs from 'node:fs';
import path from 'node:path';
import { discoverAffected } from './affected.js';

const args = process.argv.slice(2);
const value = (flag: string) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
const root = path.resolve(value('--root') ?? '.');
const base = value('--base');
const head = value('--head');
const output = value('--output');
if (!base || !head) throw new Error('Usage: affected --base <git-ref> --head <git-ref> [--root <path>] [--output <file>]');
const manifest = JSON.stringify(discoverAffected(root, base, head), null, 2) + '\n';
if (output) fs.writeFileSync(path.resolve(root, output), manifest);
else process.stdout.write(manifest);
