import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const devBuildWorkflow = readFileSync(new URL('../../workflows/dev-build.yml', import.meta.url), 'utf8');

describe('manual dev-test artifact workflow', () => {
  it('requires a successful integrated validation run as its source', () => {
    expect(devBuildWorkflow).toContain('workflow_dispatch:');
    expect(devBuildWorkflow).toContain('source_run_id:');
    expect(devBuildWorkflow).toContain('src/dev-source-run-cli.ts');
    expect(devBuildWorkflow).toContain('--workflow ".github/workflows/discovery.yml"');
    expect(devBuildWorkflow).toContain('--run-name-prefix "Integrated branch validation:"');
  });

  it('stores short-lived packages and tagged dev containers', () => {
    expect(devBuildWorkflow).toContain('retention-days: 30');
    expect(devBuildWorkflow).toContain('packages: write');
    expect(devBuildWorkflow).toContain('docker push $image');
  });

  it('uses only self-hosted runners', () => {
    expect(devBuildWorkflow).toContain('runs-on: self-hosted');
    expect(devBuildWorkflow).not.toContain('ubuntu-latest');
    expect(devBuildWorkflow).not.toContain('windows-latest');
  });
});
