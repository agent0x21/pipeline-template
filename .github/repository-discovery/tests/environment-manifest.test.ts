import { describe, expect, it } from 'vitest';
import { buildEnvironmentManifest } from '../src/environment-manifest.js';
import type { Application } from '../src/types.js';

const application: Application = {
  id: 'portal', name: 'Portal', path: 'apps/portal', ecosystem: 'node', type: 'react', subtype: 'react', projectSystem: 'npm', targetFrameworks: [], buildRequirements: { platform: 'any', tools: [] }, files: [], dockerfile: '',
};

describe('environment manifest', () => {
  it('reports the latest unpromoted RC for QA and latest final for production', () => {
    const tags = ['portal/v1.0.0', 'portal/v1.1.0-rc.1', 'portal/v1.1.0-rc.2', 'portal/v1.2.0-rc.1'];
    const commits = new Map(tags.map((tag, index) => [tag, `sha-${index}`]));
    const manifest = buildEnvironmentManifest([application], tags, commits, '2026-09-21T00:00:00.000Z');

    expect(manifest.environments.qa.portal).toMatchObject({ state: 'available', version: '1.2.0-rc.1', tag: 'portal/v1.2.0-rc.1', commit: 'sha-3' });
    expect(manifest.environments.production.portal).toMatchObject({ state: 'available', version: '1.0.0', tag: 'portal/v1.0.0', commit: 'sha-0' });
    expect(manifest.environments.dev.portal).toMatchObject({ state: 'not-tracked' });
  });

  it('does not list an RC for QA once its final version has been promoted', () => {
    const manifest = buildEnvironmentManifest([application], ['portal/v1.0.0-rc.1', 'portal/v1.0.0'], new Map(), '2026-09-21T00:00:00.000Z');
    expect(manifest.environments.qa.portal).toEqual({ state: 'not-released' });
    expect(manifest.environments.production.portal).toMatchObject({ state: 'available', version: '1.0.0' });
  });
});
