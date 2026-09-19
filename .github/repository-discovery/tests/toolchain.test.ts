import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveToolchain } from '../src/toolchain.mjs';

let root: string;
function write(file: string, contents: string | object) {
  const destination = path.join(root, file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, typeof contents === 'string' ? contents : JSON.stringify(contents));
}
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-toolchain-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe('project toolchain resolution', () => {
  it('reads root Node and pnpm declarations without using pipeline settings', () => {
    write('package.json', { engines: { node: '>=20 <23' }, packageManager: 'pnpm@10.5.0+sha512.example' });
    write('.github/repository-discovery/package.json', { engines: { node: '24' }, packageManager: 'pnpm@9.15.0' });
    expect(resolveToolchain(root)).toEqual({ node: '>=20 <23', pnpm: '10.5.0', globalJson: '' });
  });

  it('uses nearest application settings while inheriting unspecified root settings', () => {
    write('package.json', { engines: { node: '22' }, packageManager: 'pnpm@10.5.0' });
    write('apps/portal/.nvmrc', '# application runtime\nv20.19.0\n');
    expect(resolveToolchain(root, 'apps/portal')).toEqual({ node: 'v20.19.0', pnpm: '10.5.0', globalJson: '' });
  });

  it('prefers explicit runtime files over package engine ranges', () => {
    write('package.json', { engines: { node: '>=20', pnpm: '10.x' } });
    write('.node-version', '22.14.0\n');
    expect(resolveToolchain(root).node).toBe('22.14.0');
    expect(resolveToolchain(root).pnpm).toBe('10.x');
    write('.nvmrc', '20.19.0');
    expect(resolveToolchain(root).node).toBe('20.19.0');
  });

  it('supports Volta and devEngines package-manager declarations', () => {
    write('package.json', { volta: { node: '22.14.0' }, devEngines: { packageManager: { name: 'pnpm', version: '10.5.0' } } });
    expect(resolveToolchain(root)).toEqual({ node: '22.14.0', pnpm: '10.5.0', globalJson: '' });
  });

  it('selects the nearest global.json', () => {
    write('global.json', { sdk: { version: '8.0.100' } });
    write('src/api/global.json', { sdk: { version: '9.0.100' } });
    expect(resolveToolchain(root, 'src/api').globalJson).toBe(path.join(root, 'src/api/global.json'));
    expect(resolveToolchain(root, 'src/other').globalJson).toBe(path.join(root, 'global.json'));
  });

  it('leaves undeclared versions unset so workflows retain runner tools', () => {
    expect(resolveToolchain(root)).toEqual({ node: '', pnpm: '', globalJson: '' });
  });

  it('rejects paths outside the repository and multiline output values', () => {
    expect(() => resolveToolchain(root, '..')).toThrow('inside the repository');
    write('package.json', { engines: { node: '22\npnpm=bad' } });
    expect(() => resolveToolchain(root)).toThrow('Invalid node');
  });
});
