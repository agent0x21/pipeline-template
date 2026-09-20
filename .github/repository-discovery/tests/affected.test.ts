import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { affectedFromFiles } from '../src/affected.js';
import { discoverDependencies } from '../src/dependencies.js';

const fixture = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/monorepo');

describe('affected application discovery', () => {
  it('includes a React app when a consumed local package changes', () => {
    const result = affectedFromFiles(discoverDependencies(fixture), ['shared/contracts/index.ts']);
    expect(result.affectedApplications).toContainEqual({ id: 'portal', reason: 'dependency-change', changedFiles: [] });
  });

  it('includes a .NET application when its ProjectReference changes', () => {
    const result = affectedFromFiles(discoverDependencies(fixture), ['src/shared/Contracts/Contracts.csproj']);
    expect(result.affectedApplications).toContainEqual({ id: 'orders-api', reason: 'dependency-change', changedFiles: [] });
  });

  it('marks changes inside an application as direct', () => {
    const result = affectedFromFiles(discoverDependencies(fixture), ['apps/portal/src/App.tsx']);
    expect(result.affectedApplications).toContainEqual({ id: 'portal', reason: 'direct-file-change', changedFiles: ['apps/portal/src/App.tsx'] });
  });

  it('selects a Docker-enabled application when its Dockerfile changes', () => {
    const result = affectedFromFiles(discoverDependencies(fixture), ['apps/portal/Dockerfile']);
    expect(result.affectedApplications).toContainEqual({ id: 'portal', reason: 'direct-file-change', changedFiles: ['apps/portal/Dockerfile'] });
  });
});
