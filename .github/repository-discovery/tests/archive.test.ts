import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ execFileSync: vi.fn() }));
vi.mock('node:child_process', () => ({ execFileSync: mocks.execFileSync }));

const originalPlatform = process.platform;

function setPlatform(platform: string) {
  Object.defineProperty(process, 'platform', { value: platform });
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

afterEach(() => {
  setPlatform(originalPlatform);
});

describe('createZip', () => {
  it('uses PowerShell Compress-Archive on Windows, passing paths via env vars (not string interpolation)', async () => {
    setPlatform('win32');
    const { createZip } = await import('../src/archive.js');
    createZip('C:/app/dist', 'C:/tmp/portal-1.0.0.zip');

    expect(mocks.execFileSync).toHaveBeenCalledTimes(1);
    const [command, args, options] = mocks.execFileSync.mock.calls[0];
    expect(command).toBe('powershell');
    expect(args).toEqual(expect.arrayContaining(['-Command', expect.stringContaining('Compress-Archive')]));
    // The source/destination must travel as data (env vars), never spliced
    // into the -Command string itself — that would make this injectable.
    expect(args.join(' ')).not.toContain('C:/app/dist');
    expect(args.join(' ')).not.toContain('C:/tmp/portal-1.0.0.zip');
    expect(options.env.ZIP_SOURCE_DIR).toBe('C:/app/dist');
    expect(options.env.ZIP_DEST_PATH).toBe('C:/tmp/portal-1.0.0.zip');
  });

  it('uses zip on non-Windows platforms, run from inside the source directory', async () => {
    setPlatform('linux');
    const { createZip } = await import('../src/archive.js');
    createZip('/app/dist', '/tmp/portal-1.0.0.zip');

    expect(mocks.execFileSync).toHaveBeenCalledWith('zip', ['-r', '-y', '/tmp/portal-1.0.0.zip', '.'], { cwd: '/app/dist' });
  });
});

describe('extractZip', () => {
  it('uses PowerShell Expand-Archive on Windows, passing paths via env vars', async () => {
    setPlatform('win32');
    const { extractZip } = await import('../src/archive.js');
    extractZip('C:/tmp/portal-1.0.0.zip', 'C:/tmp/out');

    const [command, args, options] = mocks.execFileSync.mock.calls[0];
    expect(command).toBe('powershell');
    expect(args.join(' ')).toContain('Expand-Archive');
    expect(args.join(' ')).not.toContain('C:/tmp/portal-1.0.0.zip');
    expect(options.env.ZIP_SOURCE_PATH).toBe('C:/tmp/portal-1.0.0.zip');
    expect(options.env.ZIP_DEST_DIR).toBe('C:/tmp/out');
  });

  it('uses unzip on non-Windows platforms', async () => {
    setPlatform('linux');
    const { extractZip } = await import('../src/archive.js');
    extractZip('/tmp/portal-1.0.0.zip', '/tmp/out');

    expect(mocks.execFileSync).toHaveBeenCalledWith('unzip', ['-o', '/tmp/portal-1.0.0.zip', '-d', '/tmp/out']);
  });
});
