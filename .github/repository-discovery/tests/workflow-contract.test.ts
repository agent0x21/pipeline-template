import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const discoveryWorkflow = readFileSync(new URL('../../workflows/validate-changed-applications.yml', import.meta.url), 'utf8');
const releaseCandidateWorkflow = readFileSync(new URL('../../workflows/build-and-publish-release-candidate.yml', import.meta.url), 'utf8');
const promotionWorkflow = readFileSync(new URL('../../workflows/promote-release-candidate-to-production.yml', import.meta.url), 'utf8');

describe('non-main branch discovery workflow', () => {
  it('uses the prior successful validated workflow run as the branch baseline', () => {
    expect(discoveryWorkflow).toContain('--workflow ".github/workflows/validate-changed-applications.yml"');
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

describe('deployment approval workflow contracts', () => {
  it('requires an environment approval before a release candidate is built', () => {
    expect(releaseCandidateWorkflow).toContain('environment:\n      name: release-candidate');
  });

  it('requires QA and production approvals before a production promotion', () => {
    expect(promotionWorkflow).toContain('qa-sign-off:');
    expect(promotionWorkflow).toContain('name: qa\n      deployment: false');
    expect(promotionWorkflow).toContain('needs: qa-sign-off');
    expect(promotionWorkflow).toContain('name: production');
    expect(promotionWorkflow).toContain('group: production-deployment');
    expect(promotionWorkflow).toContain('url: ${{ vars.PRODUCTION_URL }}');
  });
});
