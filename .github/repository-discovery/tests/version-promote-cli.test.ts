import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ appendFileSync: vi.fn(), listTags: vi.fn(), tagCommit: vi.fn() }));
vi.mock('node:fs', () => ({ default: { appendFileSync: mocks.appendFileSync } }));
vi.mock('../src/git-tags.js', () => ({ listTags: mocks.listTags, tagCommit: mocks.tagCommit }));

const originalArgv = process.argv;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv('GITHUB_OUTPUT', 'test-output');
});

afterEach(() => {
  process.argv = originalArgv;
  vi.unstubAllEnvs();
});

describe('version-promote CLI', () => {
  it('promotes an existing rc tag to its final version', async () => {
    mocks.listTags.mockReturnValue(['portal/v1.5.0-rc.2']);
    mocks.tagCommit.mockReturnValue('abc123');
    process.argv = ['node', 'version-promote-cli', '--app-id', 'portal', '--rc-version', '1.5.0-rc.2'];
    await import('../src/version-promote-cli.js');
    expect(mocks.appendFileSync).toHaveBeenCalledWith(
      'test-output',
      'final_version=1.5.0\nfinal_tag=portal/v1.5.0\nrc_tag=portal/v1.5.0-rc.2\nsource_sha=abc123\n',
    );
  });

  it('refuses to promote an rc tag that was never created', async () => {
    mocks.listTags.mockReturnValue([]);
    process.argv = ['node', 'version-promote-cli', '--app-id', 'portal', '--rc-version', '1.5.0-rc.2'];
    await expect(import('../src/version-promote-cli.js')).rejects.toThrow(/was not found/);
  });

  it('refuses to re-promote once the final tag already exists', async () => {
    mocks.listTags.mockReturnValue(['portal/v1.5.0-rc.2', 'portal/v1.5.0']);
    process.argv = ['node', 'version-promote-cli', '--app-id', 'portal', '--rc-version', '1.5.0-rc.2'];
    await expect(import('../src/version-promote-cli.js')).rejects.toThrow(/already exists/);
  });

  it('requires --app-id and --rc-version', async () => {
    process.argv = ['node', 'version-promote-cli', '--app-id', 'portal'];
    await expect(import('../src/version-promote-cli.js')).rejects.toThrow(/requires --app-id and --rc-version/);
  });
});
