import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { discover } from '../src/discover.js';

const fixture = path.resolve('tests/fixtures/monorepo');
describe('discover', () => {
  it('detects React, SDK-style, legacy, classic ASP.NET, WPF and WinForms projects', () => {
    const apps = discover(fixture).applications;
    expect(apps.map((app) => app.subtype)).toEqual(['aspnet-framework', 'react', 'web', 'winforms', 'wpf']);
    expect(apps.find((app) => app.subtype === 'wpf')?.buildRequirements).toEqual({ platform: 'windows', tools: ['msbuild'] });
    expect(apps.find((app) => app.subtype === 'react')?.files).toEqual(['apps/portal/package.json']);
  });
  it('emits stable output independent of filesystem enumeration order', () => {
    const first = JSON.stringify(discover(fixture));
    const second = JSON.stringify(discover(fixture));
    expect(first).toBe(second);
  });
});
