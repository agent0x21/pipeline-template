import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ appendFileSync: vi.fn() }));
vi.mock('node:fs', () => ({ default: { appendFileSync: mocks.appendFileSync } }));

const originalArgv = process.argv;
const fetchMock = vi.fn();

function successResponses(run: Record<string, unknown>) {
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ workflows: [{ id: 7, path: '.github/workflows/validate-changed-applications.yml' }] }) });
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => run });
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('GITHUB_TOKEN', 'test-token');
  vi.stubEnv('GITHUB_OUTPUT', 'test-output');
  vi.stubEnv('GITHUB_API_URL', 'https://api.example.test');
  process.argv = ['node', 'dev-source-run-cli', '--repository', 'owner/repo', '--run-id', '123', '--workflow', '.github/workflows/validate-changed-applications.yml', '--run-name-prefix', 'Integrated branch validation:'];
});

afterEach(() => {
  process.argv = originalArgv;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('dev source-run validation CLI', () => {
  it('accepts a successful integrated non-main push and produces a safe image tag', async () => {
    successResponses({
      workflow_id: 7,
      event: 'push',
      conclusion: 'success',
      head_branch: 'Feature/QA candidate',
      head_sha: '0123456789abcdef0123456789abcdef01234567',
      display_title: 'Integrated branch validation: Feature/QA candidate',
    });
    await import('../src/dev-source-run-cli.js');
    expect(mocks.appendFileSync).toHaveBeenCalledWith(
      'test-output',
      'source_sha=0123456789abcdef0123456789abcdef01234567\nsource_branch=Feature/QA candidate\nsource_run_id=123\ndev_image_tag=dev-feature-qa-candidate-0123456789abcdef0123456789abcdef01234567\n',
    );
  });

  it('rejects a successful run that does not include integrated validation', async () => {
    successResponses({
      workflow_id: 7,
      event: 'push',
      conclusion: 'success',
      head_branch: 'feature/test',
      head_sha: '0123456789abcdef0123456789abcdef01234567',
      display_title: 'Repository discovery',
    });
    await expect(import('../src/dev-source-run-cli.js')).rejects.toThrow('predates the integrated branch-validation workflow');
    expect(mocks.appendFileSync).not.toHaveBeenCalled();
  });

  it('rejects main and unsuccessful runs', async () => {
    successResponses({
      workflow_id: 7,
      event: 'push',
      conclusion: 'failure',
      head_branch: 'main',
      head_sha: '0123456789abcdef0123456789abcdef01234567',
      display_title: 'Integrated branch validation: main',
    });
    await expect(import('../src/dev-source-run-cli.js')).rejects.toThrow('did not succeed');
    expect(mocks.appendFileSync).not.toHaveBeenCalled();
  });
});
