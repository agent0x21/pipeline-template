import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Git can check workflow files out with CRLF on Windows self-hosted runners.
// The workflow contracts below describe YAML structure, not its on-disk line
// ending, so normalize before matching multi-line snippets.
const readWorkflow = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const discoveryWorkflow = readWorkflow('../../workflows/validate-changed-applications.yml');
const commitReleaseCandidatesWorkflow = readWorkflow('../../workflows/create-release-candidates-from-main.yml');
const releaseCandidateWorkflow = readWorkflow('../../workflows/build-and-publish-release-candidate.yml');
const promotionWorkflow = readWorkflow('../../workflows/promote-release-candidate-to-production.yml');
const environmentManifestWorkflow = readWorkflow('../../workflows/generate-environment-manifest.yml');

describe('non-main branch discovery workflow', () => {
  it('uses the prior successful validated workflow run as the branch baseline', () => {
    expect(discoveryWorkflow).toContain('--workflow ".github/workflows/validate-changed-applications.yml"');
    expect(discoveryWorkflow).toContain('--run-name-prefix "Integrated branch validation:"');
    expect(discoveryWorkflow).toContain('run-name: "Integrated branch validation: ${{ github.ref_name }}"');
  });

  it('runs the affected-app build matrix in the discovery workflow', () => {
    expect(discoveryWorkflow).toContain('build-and-test:');
    expect(discoveryWorkflow).toContain('needs: discover');
    expect(discoveryWorkflow).toContain('runs-on: [self-hosted, "${{ matrix.runner }}"]');
    expect(discoveryWorkflow).not.toContain('dispatch-build-cli.ts');
  });

  it('keeps automatic branch builds validation-only', () => {
    expect(discoveryWorkflow).toContain('docker image rm --force');
    expect(discoveryWorkflow).not.toContain('docker push');
  });
});

describe('environment manifest workflow contract', () => {
  it('runs after successful release-candidate and production-promotion workflows', () => {
    expect(environmentManifestWorkflow).toContain('workflow_run:');
    expect(environmentManifestWorkflow).toContain('Generate Release Candidate Artifacts');
    expect(environmentManifestWorkflow).toContain('Release — Create a candidate manually');
    expect(environmentManifestWorkflow).toContain('Promote Release Candidate to Production');
    expect(environmentManifestWorkflow).toContain("github.event.workflow_run.conclusion == 'success'");
  });

  it('stores the generated JSON as a persistent release asset', () => {
    expect(environmentManifestWorkflow).toContain('environment-manifest-publish-cli.ts');
    expect(environmentManifestWorkflow).toContain('name: environment-manifest');
    expect(environmentManifestWorkflow).toContain('group: environment-manifest');
  });
});

describe('commit-driven release candidate workflow contract', () => {
  it('is manually dispatched with a required commit and builds from that commit', () => {
    expect(commitReleaseCandidatesWorkflow).toContain('workflow_dispatch:');
    expect(commitReleaseCandidatesWorkflow).toContain('commit:');
    expect(commitReleaseCandidatesWorkflow).toContain('required: true');
    expect(commitReleaseCandidatesWorkflow).not.toContain('\n  push:');
    expect(commitReleaseCandidatesWorkflow).toContain('ref: ${{ inputs.commit }}');
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
