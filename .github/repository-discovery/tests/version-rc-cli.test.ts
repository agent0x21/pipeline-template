import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ appendFileSync: vi.fn(), listTags: vi.fn() }));
vi.mock('node:fs', () => ({ default: { appendFileSync: mocks.appendFileSync } }));
vi.mock('../src/git-tags.js', () => ({ listTags: mocks.listTags, tagCommit: vi.fn() }));

const originalArgv = process.argv;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv('GITHUB_OUTPUT', 'test-output');
  mocks.listTags.mockReturnValue([]);
});

afterEach(() => {
  process.argv = originalArgv;
  vi.unstubAllEnvs();
});

describe('version-rc CLI', () => {
  it('writes version, tag, target, and rc outputs for a first-ever version', async () => {
    process.argv = ['node', 'version-rc-cli', '--app-id', 'portal', '--bump', 'minor'];
    await import('../src/version-rc-cli.js');
    expect(mocks.appendFileSync).toHaveBeenCalledWith('test-output', 'version=0.1.0-rc.1\ntag=portal/v0.1.0-rc.1\ntarget=0.1.0\nrc=1\n');
  });

  it('bumps from the latest final tag reported by listTags', async () => {
    mocks.listTags.mockReturnValue(['portal/v1.4.0']);
    process.argv = ['node', 'version-rc-cli', '--app-id', 'portal', '--bump', 'major'];
    await import('../src/version-rc-cli.js');
    expect(mocks.appendFileSync).toHaveBeenCalledWith('test-output', 'version=2.0.0-rc.1\ntag=portal/v2.0.0-rc.1\ntarget=2.0.0\nrc=1\n');
  });

  it('rejects an invalid --bump value', async () => {
    process.argv = ['node', 'version-rc-cli', '--app-id', 'portal', '--bump', 'huge'];
    await expect(import('../src/version-rc-cli.js')).rejects.toThrow(/--bump must be/);
  });

  it('requires --app-id', async () => {
    process.argv = ['node', 'version-rc-cli', '--bump', 'minor'];
    await expect(import('../src/version-rc-cli.js')).rejects.toThrow(/--app-id/);
  });
});
