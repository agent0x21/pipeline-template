import fs from 'node:fs';
import os from 'node:os';
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
    const react = apps.find((app) => app.subtype === 'react');
    expect(react).toMatchObject({ id: 'portal', name: 'Portal', legacyId: 'apps-portal' });
    expect(react?.files).toEqual(['apps/portal/package.json']);
    expect(react?.dockerfile).toBe('apps/portal/Dockerfile');
  });

  it('uses the app directory for friendly names while retaining the old ID for release-history lookup', () => {
    const api = discover(fixture).applications.find((app) => app.path === 'src/api/Orders.Api');
    expect(api).toMatchObject({ id: 'orders-api', name: 'Orders API', legacyId: 'src-api-orders-api-orders-api' });
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

  it('honors explicit CI/CD settings while preserving unmarked projects', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repository-discovery-cicd-'));
    const write = (relative: string, contents: string) => {
      const file = path.join(root, relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, contents);
    };
    try {
      write('sdk-enabled/App.csproj', '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><cicd>TRUE</cicd></PropertyGroup></Project>');
      write('sdk-disabled/App.csproj', '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><cicd>false</cicd></PropertyGroup></Project>');
      write('sdk-default/App.csproj', '<Project Sdk="Microsoft.NET.Sdk" />');
      write('legacy-enabled/App.csproj', '<Project xmlns="http://schemas.microsoft.com/developer/msbuild/2003"><PropertyGroup><TargetFrameworkVersion>v4.0</TargetFrameworkVersion><cicd>true</cicd></PropertyGroup></Project>');
      write('legacy-disabled/App.csproj', '<Project xmlns="http://schemas.microsoft.com/developer/msbuild/2003"><PropertyGroup><cicd>False</cicd></PropertyGroup></Project>');
      write('legacy-default/App.csproj', '<Project xmlns="http://schemas.microsoft.com/developer/msbuild/2003" />');
      write('react-enabled/package.json', JSON.stringify({ dependencies: { react: '18.0.0' }, cicd: true }));
      write('react-disabled/package.json', JSON.stringify({ dependencies: { react: '18.0.0' }, cicd: false }));
      write('react-default/package.json', JSON.stringify({ dependencies: { react: '18.0.0' } }));
      write('invalid-dotnet/App.csproj', '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><cicd>sometimes</cicd></PropertyGroup></Project>');
      write('legacy-uppercase/App.csproj', '<Project xmlns="http://schemas.microsoft.com/developer/msbuild/2003"><PropertyGroup><CICD>true</CICD></PropertyGroup></Project>');
      write('invalid-react/package.json', JSON.stringify({ dependencies: { react: '18.0.0' }, cicd: 'false' }));

      const apps = discover(root).applications;
      expect(apps.map((app) => app.path)).toEqual([
        'invalid-dotnet', 'invalid-react', 'legacy-default', 'legacy-enabled', 'legacy-uppercase', 'react-default', 'react-enabled', 'sdk-default', 'sdk-enabled',
      ]);
      expect(apps.find((app) => app.path === 'sdk-enabled')?.cicd).toBe(true);
      expect(apps.find((app) => app.path === 'legacy-enabled')?.cicd).toBe(true);
      expect(apps.find((app) => app.path === 'legacy-uppercase')?.cicd).toBe(true);
      expect(apps.find((app) => app.path === 'react-enabled')?.cicd).toBe(true);
      expect(apps.find((app) => app.path === 'sdk-default')?.cicd).toBeUndefined();
      expect(apps.find((app) => app.path === 'legacy-default')?.cicd).toBeUndefined();
      expect(apps.find((app) => app.path === 'react-default')?.cicd).toBeUndefined();
      expect(apps.find((app) => app.path === 'invalid-dotnet')?.cicd).toBeUndefined();
      expect(apps.find((app) => app.path === 'invalid-react')?.cicd).toBeUndefined();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
