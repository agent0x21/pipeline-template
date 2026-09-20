import { execFileSync } from 'node:child_process';

/**
 * Creates a standard PK-format zip at `zipPath` from the *contents* of
 * `sourceDir` (not the directory itself — matching the `tar -C dir .`
 * convention this replaces).
 *
 * Deliberately not `tar -a -cf out.zip -C dir .`: bsdtar (macOS's and
 * Windows 10+'s tar.exe) does write a real zip that way, but GNU tar (most
 * Linux, including wherever this is unit-tested/run locally) silently
 * ignores the `.zip` extension and writes a plain, uncompressed tar stream
 * with a `.zip` name instead — exit code 0, no error, just a file that
 * isn't actually a zip and that `unzip`/Explorer/Python's zipfile refuse to
 * open. Relying on "whichever tar happens to be on PATH" is exactly the
 * kind of silent, runner-dependent failure this pipeline has already been
 * bitten by once (see build-and-publish-release-candidate.yml's shell-mismatch history).
 *
 * Uses only what's already guaranteed to be present, no new dependency:
 *  - Windows: PowerShell's Compress-Archive — built into Windows PowerShell
 *    5.1, which ships with every Windows 10 / Server 2016 and later. This
 *    does not require pwsh/PowerShell 7 specifically.
 *  - Everything else (Linux/macOS — local development, tests): the
 *    standard `zip` command.
 */
export function createZip(sourceDir: string, zipPath: string): void {
  if (process.platform === 'win32') {
    execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        // -Force on Get-ChildItem includes hidden/system files, matching
        // tar's own "everything under the directory" behavior.
        'Get-ChildItem -LiteralPath $env:ZIP_SOURCE_DIR -Force | Compress-Archive -DestinationPath $env:ZIP_DEST_PATH -Force',
      ],
      { env: { ...process.env, ZIP_SOURCE_DIR: sourceDir, ZIP_DEST_PATH: zipPath } },
    );
  } else {
    execFileSync('zip', ['-r', '-y', zipPath, '.'], { cwd: sourceDir });
  }
}

/** Extracts the zip at `zipPath` into `destDir` (which must already exist). */
export function extractZip(zipPath: string, destDir: string): void {
  if (process.platform === 'win32') {
    execFileSync(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', 'Expand-Archive -LiteralPath $env:ZIP_SOURCE_PATH -DestinationPath $env:ZIP_DEST_DIR -Force'],
      { env: { ...process.env, ZIP_SOURCE_PATH: zipPath, ZIP_DEST_DIR: destDir } },
    );
  } else {
    execFileSync('unzip', ['-o', zipPath, '-d', destDir]);
  }
}
