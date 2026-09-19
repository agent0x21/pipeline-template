import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const value = (flag: string) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
const application = value('--application');
const root = path.resolve(value('--root') ?? '.');
if (!application) throw new Error('Usage: node-install --application <repository-relative-path> [--root <path>]');

const applicationDirectory = path.resolve(root, application);
const relative = path.relative(root, applicationDirectory);
if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Application path must be inside the repository: ${application}`);

let directory = applicationDirectory;
let lockfile: string | undefined;
while (true) {
  const candidate = path.join(directory, 'pnpm-lock.yaml');
  if (fs.existsSync(candidate)) { lockfile = candidate; break; }
  if (directory === root) break;
  directory = path.dirname(directory);
}
if (!lockfile) throw new Error(`No pnpm-lock.yaml was found for Node application '${application}'. Commit a lockfile in the application or one of its parent directories.`);

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const result = spawnSync(pnpm, ['--dir', path.dirname(lockfile), 'install', '--frozen-lockfile'], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
