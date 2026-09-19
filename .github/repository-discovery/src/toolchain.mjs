import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Read project settings without installing any pipeline dependencies first. */
export function resolveToolchain(root, project = '.') {
  root = path.resolve(root);
  let directory = path.resolve(root, project);
  const relative = path.relative(root, directory);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('Project directory must be inside the repository');
  }
  const result = { node: '', pnpm: '', globalJson: '' };
  for (;;) {
    const packageFile = path.join(directory, 'package.json');
    const pkg = fs.existsSync(packageFile) ? JSON.parse(fs.readFileSync(packageFile, 'utf8')) : {};
    if (!result.node) {
      for (const name of ['.nvmrc', '.node-version']) {
        const file = path.join(directory, name);
        if (fs.existsSync(file)) {
          result.node = fs.readFileSync(file, 'utf8').split(/\r?\n/).map(line => line.replace(/#.*/, '').trim()).find(Boolean) ?? '';
          if (result.node) break;
        }
      }
      result.node ||= pkg.volta?.node || pkg.engines?.node || '';
    }
    if (!result.pnpm) {
      const manager = pkg.packageManager;
      const devManager = pkg.devEngines?.packageManager;
      result.pnpm = typeof manager === 'string' && manager.startsWith('pnpm@')
        ? manager.slice(5).split('+')[0]
        : (devManager?.name === 'pnpm' ? devManager.version : '') || pkg.engines?.pnpm || '';
    }
    const globalJson = path.join(directory, 'global.json');
    if (!result.globalJson && fs.existsSync(globalJson)) result.globalJson = globalJson;
    if (directory === root) break;
    directory = path.dirname(directory);
  }
  for (const [name, value] of Object.entries(result)) {
    if (typeof value !== 'string' || /[\r\n]/.test(value)) throw new Error(`Invalid ${name} toolchain setting`);
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = resolveToolchain(process.env.GITHUB_WORKSPACE || process.cwd(), process.env.PROJECT_PATH || '.');
  if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required');
  fs.appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(result).map(([key, value]) => `${key}=${value}\n`).join(''));
  for (const [key, value] of Object.entries(result)) console.log(`${key}: ${value || 'use the self-hosted runner installation'}`);
}
