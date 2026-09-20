import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createZip: vi.fn(),
  existsSync: vi.fn(),
  rmSync: vi.fn(),
  readFileSync: vi.fn(),
  findReleaseByTag: vi.fn(),
  createRelease: vi.fn(),
  uploadAsset: vi.fn(),
}));

vi.mock('../src/archive.js', () => ({ createZip: mocks.createZip }));
vi.mock('node:fs', () => ({
  default: { existsSync: mocks.existsSync, rmSync: mocks.rmSync, readFileSync: mocks.readFileSync },
}));
vi.mock('../src/github-releases.js', () => ({
  findReleaseByTag: mocks.findReleaseByTag,
  createRelease: mocks.createRelease,
  uploadAsset: mocks.uploadAsset,
}));

const originalArgv = process.argv;
const originalEnv = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.existsSync.mockReturnValue(false);
  mocks.readFileSync.mockReturnValue(Buffer.from('archive'));
  mocks.findReleaseByTag.mockResolvedValue(undefined);
  mocks.createRelease.mockResolvedValue({ id: 1, tag_name: 'portal/v1.0.0', upload_url: 'https://uploads.example.test/1{?name}', assets: [] });
  mocks.uploadAsset.mockResolvedValue(undefined);
  process.env.GITHUB_REPOSITORY = 'owner/repo';
  process.env.GITHUB_TOKEN = 'test-token';
});

afterEach(() => {
  process.argv = originalArgv;
  process.env = { ...originalEnv };
});

const run = async (args: string[]) => {
  process.argv = ['node', 'artifact-publish-cli', ...args];
  await import('../src/artifact-publish-cli.js');
};

describe('artifact-publish CLI', () => {
  it('zips the app directory and uploads it as a .zip asset', async () => {
    await run(['--app-id', 'portal', '--version', '1.0.0', '--app-directory', '/tmp/app', '--ref', 'abc123']);

    expect(mocks.createZip).toHaveBeenCalledWith('/tmp/app', expect.stringContaining('portal-1.0.0.zip'));
    expect(mocks.createRelease).toHaveBeenCalledWith(expect.anything(), 'portal/v1.0.0', 'abc123', 'portal 1.0.0', false);
    expect(mocks.uploadAsset).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'portal-1.0.0.zip', expect.anything(), 'application/zip');
  });

  it('marks a newly created release as a prerelease when --prerelease is supplied', async () => {
    await run(['--app-id', 'portal', '--version', '1.0.0-rc.1', '--app-directory', '/tmp/app', '--ref', 'abc123', '--prerelease']);

    expect(mocks.createRelease).toHaveBeenCalledWith(expect.anything(), 'portal/v1.0.0-rc.1', 'abc123', 'portal 1.0.0-rc.1', true);
  });

  it('requires --app-id, --version, --app-directory, and --ref', async () => {
    await expect(run(['--app-id', 'portal'])).rejects.toThrow(/--app-id, --version, --app-directory, and --ref/);
    expect(mocks.createZip).not.toHaveBeenCalled();
  });

  it('requires GITHUB_REPOSITORY and GITHUB_TOKEN even when all CLI args are present', async () => {
    delete process.env.GITHUB_TOKEN;
    await expect(run(['--app-id', 'portal', '--version', '1.0.0', '--app-directory', '/tmp/app', '--ref', 'abc123'])).rejects.toThrow(
      /GITHUB_REPOSITORY and GITHUB_TOKEN/,
    );
  });
});
