import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';

let root: string;
function write(file: string, contents: string | object) {
  const destination = path.join(root, file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, typeof contents === 'string' ? contents : JSON.stringify(contents));
}
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-toolchain-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

function resolveToolchain(project = '.') {
  const output = path.join(root, 'toolchain-output.txt');
  const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/toolchain.ps1');
  const result = spawnSync('pwsh', ['-NoProfile', '-File', script, '-Root', root, '-Project', project], {
    encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: output },
  });
  if (result.status !== 0) throw new Error(result.stderr);
  return Object.fromEntries(fs.readFileSync(output, 'utf8').trim().split(/\r?\n/).filter(Boolean).map((line) => {
    const separator = line.indexOf('=');
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));
}

describe('project toolchain resolution', () => {
  it('reads root Node and pnpm declarations without using pipeline settings', () => {
    write('package.json', { engines: { node: '>=20 <23' }, packageManager: 'pnpm@10.5.0+sha512.example' });
    write('.github/repository-discovery/package.json', { engines: { node: '24' }, packageManager: 'pnpm@9.15.0' });
    expect(resolveToolchain()).toEqual({ node: '>=20 <23', pnpm: '10.5.0', globalJson: '' });
  });

  it('uses nearest application settings while inheriting unspecified root settings', () => {
    write('package.json', { engines: { node: '22' }, packageManager: 'pnpm@10.5.0' });
    write('apps/portal/.nvmrc', '# application runtime\nv20.19.0\n');
    expect(resolveToolchain('apps/portal')).toEqual({ node: 'v20.19.0', pnpm: '10.5.0', globalJson: '' });
  });

  it('prefers explicit runtime files over package engine ranges', () => {
    write('package.json', { engines: { node: '>=20', pnpm: '10.x' } });
    write('.node-version', '22.14.0\n');
    expect(resolveToolchain().node).toBe('22.14.0');
    expect(resolveToolchain().pnpm).toBe('10.x');
    write('.nvmrc', '20.19.0');
    expect(resolveToolchain().node).toBe('20.19.0');
  });

  it('supports Volta and devEngines package-manager declarations', () => {
    write('package.json', { volta: { node: '22.14.0' }, devEngines: { packageManager: { name: 'pnpm', version: '10.5.0' } } });
    expect(resolveToolchain()).toEqual({ node: '22.14.0', pnpm: '10.5.0', globalJson: '' });
  });

  it('selects the nearest global.json', () => {
    write('global.json', { sdk: { version: '8.0.100' } });
    write('src/api/global.json', { sdk: { version: '9.0.100' } });
    expect(resolveToolchain('src/api').globalJson).toBe(path.join(root, 'src/api/global.json'));
    expect(resolveToolchain('src/other').globalJson).toBe(path.join(root, 'global.json'));
  });

  it('leaves undeclared versions unset so workflows retain runner tools', () => {
    expect(resolveToolchain()).toEqual({ node: '', pnpm: '', globalJson: '' });
  });

  it('rejects paths outside the repository and multiline output values', () => {
    expect(() => resolveToolchain('..')).toThrow('inside the repository');
    write('package.json', { engines: { node: '22\npnpm=bad' } });
    expect(() => resolveToolchain()).toThrow('Invalid node');
  });
});
