import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const discoveryWorkflow = readFileSync(new URL('../../workflows/discovery.yml', import.meta.url), 'utf8');

describe('non-main branch discovery workflow', () => {
  it('uses the prior successful validated workflow run as the branch baseline', () => {
    expect(discoveryWorkflow).toContain('--workflow ".github/workflows/discovery.yml"');
    expect(discoveryWorkflow).toContain('--run-name-prefix "Integrated branch validation:"');
    expect(discoveryWorkflow).toContain('run-name: "Integrated branch validation: ${{ github.ref_name }}"');
  });

  it('runs the affected-app build matrix in the discovery workflow', () => {
    expect(discoveryWorkflow).toContain('build-and-test:');
    expect(discoveryWorkflow).toContain('needs: discover');
    expect(discoveryWorkflow).not.toContain('dispatch-build-cli.ts');
  });

  it('keeps automatic branch builds validation-only', () => {
    expect(discoveryWorkflow).toContain('docker image rm --force');
    expect(discoveryWorkflow).not.toContain('docker push');
  });
});
