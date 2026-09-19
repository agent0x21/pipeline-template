import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { discover } from '../src/discover.js';

const fixture = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/monorepo');
describe('discover', () => {
  it('detects React, SDK-style, legacy, classic ASP.NET, WPF and WinForms projects', () => {
    const apps = discover(fixture).applications;
    expect(apps.map((app) => app.subtype)).toEqual(['react', 'web', 'winforms', 'wpf', 'aspnet-framework', 'library-or-service']);
    expect(apps.find((app) => app.subtype === 'wpf')?.buildRequirements).toEqual({ platform: 'windows', tools: ['msbuild'] });
    expect(apps.find((app) => app.subtype === 'react')?.files).toEqual(['apps/portal/package.json']);
  });
  it('emits stable output independent of filesystem enumeration order', () => {
    const first = JSON.stringify(discover(fixture));
    const second = JSON.stringify(discover(fixture));
    expect(first).toBe(second);
  });

  it('never detects its own tests/fixtures as applications when scanning the real repository root', () => {
    // Regression test: discovery previously walked into
    // .github/repository-discovery/tests/fixtures/monorepo when run against a real
    // repository root, treating the pipeline's own detector fixtures (a synthetic
    // React app plus five .NET projects) as real applications and dispatching
    // builds for them. See discover.ts's listFiles() exclusion for the fix.
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
    const apps = discover(repoRoot).applications;
    const leaked = apps.filter((app) => app.path.startsWith('.github/repository-discovery/'));
    expect(leaked).toEqual([]);
  });
});
