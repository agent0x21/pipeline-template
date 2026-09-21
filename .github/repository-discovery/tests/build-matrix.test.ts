import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { discover } from '../src/discover.js';
import type { AffectedManifest } from '../src/types.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const discovery = discover(path.join(directory, 'fixtures/monorepo'));
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const temporary of temporaryDirectories.splice(0)) fs.rmSync(temporary, { recursive: true, force: true });
});

function matrixFor(ids: string[]) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'discovery-matrix-'));
  temporaryDirectories.push(temporary);
  const affected: AffectedManifest = {
    schemaVersion: 1, generatedBy: 'polyglot-repository-discovery', base: '', head: '', changedFiles: [],
    affectedApplications: ids.map(id => ({ id, reason: 'full-validation', changedFiles: [] })),
  };
  const affectedPath = path.join(temporary, 'affected.json');
  const discoveryPath = path.join(temporary, 'discovery.json');
  const output = path.join(temporary, 'output');
  fs.writeFileSync(affectedPath, JSON.stringify(affected));
  fs.writeFileSync(discoveryPath, JSON.stringify(discovery));
  const result = spawnSync(process.execPath, ['--import', 'tsx', path.join(directory, '../src/build-matrix-cli.ts'), '--affected', affectedPath, '--discovery', discoveryPath], {
    cwd: path.resolve(directory, '..'),
    encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: output },
  });
  expect(result.status, result.stderr).toBe(0);
  const values = Object.fromEntries(fs.readFileSync(output, 'utf8').trim().split('\n').map(line => {
    const separator = line.indexOf('=');
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));
  return { matrix: JSON.parse(values.matrix), hasAffected: values.has_affected };
}

describe('build matrix CLI', () => {
  it('selects only affected apps, deduplicating IDs and preserving build requirements', () => {
    const react = discovery.applications.find(app => app.type === 'react')!;
    const legacy = discovery.applications.find(app => app.projectSystem === 'legacy-msbuild')!;
    const result = matrixFor([legacy.id, react.id, react.id]);
    expect(result.hasAffected).toBe('true');
    expect(result.matrix.include).toEqual([
      { id: react.id, name: react.name, path: react.path, ecosystem: 'node', projectSystem: 'npm', projectFile: '', dockerfile: react.dockerfile, platform: 'any', runner: 'linux', tools: react.buildRequirements.tools },
      { id: legacy.id, name: legacy.name, path: legacy.path, ecosystem: 'dotnet', projectSystem: 'legacy-msbuild', projectFile: legacy.files.find(file => file.endsWith('.csproj')), dockerfile: legacy.dockerfile, platform: 'windows', runner: 'windows', tools: legacy.buildRequirements.tools },
    ]);
  });

  it('signals that builds should be skipped when no apps are affected', () => {
    expect(matrixFor([])).toEqual({ matrix: { include: [] }, hasAffected: 'false' });
  });

  it('includes every discovered app for full validation', () => {
    const result = matrixFor(discovery.applications.map(app => app.id));
    expect(result.matrix.include.map((app: { id: string }) => app.id)).toEqual(discovery.applications.map(app => app.id));
    expect(result.hasAffected).toBe('true');
  });
});
