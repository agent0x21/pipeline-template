import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  extractZip: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  rmSync: vi.fn(),
  findReleaseByTag: vi.fn(),
  downloadAsset: vi.fn(),
}));

vi.mock('../src/archive.js', () => ({ extractZip: mocks.extractZip }));
vi.mock('node:fs', () => ({
  default: { mkdirSync: mocks.mkdirSync, writeFileSync: mocks.writeFileSync, rmSync: mocks.rmSync },
}));
vi.mock('../src/github-releases.js', () => ({
  findReleaseByTag: mocks.findReleaseByTag,
  downloadAsset: mocks.downloadAsset,
}));

const originalArgv = process.argv;
const originalEnv = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.downloadAsset.mockResolvedValue(Buffer.from('bytes'));
  process.env.GITHUB_REPOSITORY = 'owner/repo';
  process.env.GITHUB_TOKEN = 'test-token';
});

afterEach(() => {
  process.argv = originalArgv;
  process.env = { ...originalEnv };
});

const run = async (args: string[]) => {
  process.argv = ['node', 'artifact-fetch-cli', ...args];
  await import('../src/artifact-fetch-cli.js');
};

describe('artifact-fetch CLI', () => {
  it('looks up the .zip asset and extracts it into the destination', async () => {
    mocks.findReleaseByTag.mockResolvedValue({
      id: 1,
      tag_name: 'portal/v1.0.0',
      upload_url: 'https://uploads.example.test/1{?name}',
      assets: [{ id: 5, name: 'portal-1.0.0.zip', url: 'https://api.example.test/assets/5' }],
    });
    await run(['--app-id', 'portal', '--version', '1.0.0', '--destination', '/tmp/out']);

    expect(mocks.mkdirSync).toHaveBeenCalledWith('/tmp/out', { recursive: true });
    expect(mocks.extractZip).toHaveBeenCalledWith(expect.stringContaining('portal-1.0.0.zip'), '/tmp/out');
  });

  it('fails clearly when the release has no matching .zip asset (e.g. it was published before the zip switch)', async () => {
    mocks.findReleaseByTag.mockResolvedValue({
      id: 1,
      tag_name: 'portal/v1.0.0',
      upload_url: 'https://uploads.example.test/1{?name}',
      assets: [{ id: 5, name: 'portal-1.0.0.tar.gz', url: 'https://api.example.test/assets/5' }],
    });
    await expect(run(['--app-id', 'portal', '--version', '1.0.0', '--destination', '/tmp/out'])).rejects.toThrow(
      /has no asset named "portal-1.0.0.zip"/,
    );
    expect(mocks.extractZip).not.toHaveBeenCalled();
  });

  it('requires --app-id, --version, and --destination', async () => {
    await expect(run(['--app-id', 'portal'])).rejects.toThrow(/--app-id, --version, and --destination/);
  });
});
