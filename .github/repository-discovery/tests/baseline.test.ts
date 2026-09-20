import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ appendFileSync: vi.fn(), spawnSync: vi.fn() }));
vi.mock('node:fs', () => ({ default: { appendFileSync: mocks.appendFileSync } }));
vi.mock('node:child_process', () => ({ spawnSync: mocks.spawnSync }));

const originalArgv = process.argv;
const fetchMock = vi.fn();
const success = { head_sha: 'validated-sha', conclusion: 'success' };

function responses(pages: unknown[][]) {
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ workflows: [{ id: 7, path: '.github/workflows/build-affected-applications-manually.yml' }] }) });
  for (const workflow_runs of pages) {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ workflow_runs }) });
  }
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('GITHUB_TOKEN', 'test-token');
  vi.stubEnv('GITHUB_OUTPUT', 'test-output');
  vi.stubEnv('GITHUB_API_URL', 'https://api.example.test');
  process.argv = ['node', 'baseline-cli', '--repository', 'owner/repo', '--branch', 'feature/test', '--head', 'current-sha', '--workflow', '.github/workflows/build-affected-applications-manually.yml'];
  mocks.spawnSync.mockReturnValue({ status: 0 });
});

afterEach(() => {
  process.argv = originalArgv;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('baseline CLI', () => {
  it('keeps the last successful baseline after failed and unfinished runs', async () => {
    responses([[{ head_sha: 'failed', conclusion: 'failure' }, { head_sha: 'running', conclusion: null }, success]]);
    await import('../src/baseline-cli.js');
    expect(mocks.appendFileSync).toHaveBeenCalledWith('test-output', 'base=validated-sha\nmode=affected\n');
    expect(mocks.spawnSync).toHaveBeenCalledWith('git', ['merge-base', '--is-ancestor', 'validated-sha', 'current-sha'], expect.any(Object));
    expect(fetchMock.mock.calls[1][0]).toContain('branch=feature%2Ftest');
  });

  it('searches older pages for a successful run', async () => {
    responses([Array.from({ length: 100 }, () => ({ conclusion: 'failure' })), [success]]);
    await import('../src/baseline-cli.js');
    expect(fetchMock.mock.calls[2][0]).toContain('page=2');
    expect(mocks.appendFileSync).toHaveBeenCalledWith('test-output', 'base=validated-sha\nmode=affected\n');
  });

  it('selects full validation when no successful run exists', async () => {
    responses([[]]);
    await import('../src/baseline-cli.js');
    expect(mocks.appendFileSync).toHaveBeenCalledWith('test-output', 'base=\nmode=full\n');
    expect(mocks.spawnSync).not.toHaveBeenCalled();
  });

  it('selects full validation after history is rewritten', async () => {
    responses([[success]]);
    mocks.spawnSync.mockReturnValue({ status: 1 });
    await import('../src/baseline-cli.js');
    expect(mocks.appendFileSync).toHaveBeenCalledWith('test-output', 'base=\nmode=full\n');
  });

  it('uses only successful runs created by the current integrated validation flow when a run-name prefix is required', async () => {
    process.argv.push('--run-name-prefix', 'Integrated branch validation:');
    responses([[
      { head_sha: 'old-discovery-only-sha', conclusion: 'success', display_title: 'Repository discovery' },
      { head_sha: 'validated-sha', conclusion: 'success', display_title: 'Integrated branch validation: feature/test' },
    ]]);
    await import('../src/baseline-cli.js');
    expect(mocks.appendFileSync).toHaveBeenCalledWith('test-output', 'base=validated-sha\nmode=affected\n');
    expect(mocks.spawnSync).toHaveBeenCalledWith('git', ['merge-base', '--is-ancestor', 'validated-sha', 'current-sha'], expect.any(Object));
  });

  it('fails without publishing a baseline when the API fails', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403 });
    await expect(import('../src/baseline-cli.js')).rejects.toThrow('GitHub API request failed (403)');
    expect(mocks.appendFileSync).not.toHaveBeenCalled();
  });
});
