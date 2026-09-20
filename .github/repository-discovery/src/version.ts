export interface SemVer { major: number; minor: number; patch: number; }
export type BumpLevel = 'major' | 'minor' | 'patch';

const FINAL_RE = /^(\d+)\.(\d+)\.(\d+)$/;
const RC_RE = /^(\d+)\.(\d+)\.(\d+)-rc\.(\d+)$/;

export function parseFinalVersion(value: string): SemVer | undefined {
  const match = FINAL_RE.exec(value);
  if (!match) return undefined;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

export function parseRcVersion(value: string): (SemVer & { rc: number }) | undefined {
  const match = RC_RE.exec(value);
  if (!match) return undefined;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), rc: Number(match[4]) };
}

export function formatVersion(version: SemVer): string {
  return `${version.major}.${version.minor}.${version.patch}`;
}

export function formatRcVersion(version: SemVer, rc: number): string {
  return `${formatVersion(version)}-rc.${rc}`;
}

export function compareVersions(a: SemVer, b: SemVer): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

export function bump(version: SemVer, level: BumpLevel): SemVer {
  if (level === 'major') return { major: version.major + 1, minor: 0, patch: 0 };
  if (level === 'minor') return { major: version.major, minor: version.minor + 1, patch: 0 };
  return { major: version.major, minor: version.minor, patch: version.patch + 1 };
}

/** Every tag for an application lives under this prefix, e.g. "portal/v" for tags like "portal/v1.4.0". */
export function tagPrefix(appId: string): string {
  return `${appId}/v`;
}

export function appTagPattern(appId: string): string {
  return `${tagPrefix(appId)}*`;
}

function mustParseFinal(value: string): SemVer {
  const parsed = parseFinalVersion(value);
  if (!parsed) throw new Error(`Invalid version "${value}"; expected X.Y.Z.`);
  return parsed;
}

/** The highest final (non-prerelease) version tagged for this application, if any. */
function applicationIds(appId: string, legacyIds: string[]): string[] {
  return [...new Set([appId, ...legacyIds])];
}

/** The highest final version across the current ID and any pre-rename IDs. */
export function latestFinalVersion(appId: string, tags: string[], legacyIds: string[] = []): SemVer | undefined {
  const prefixes = applicationIds(appId, legacyIds).map(tagPrefix);
  const versions = tags
    .flatMap((tag) => prefixes.filter((prefix) => tag.startsWith(prefix)).map((prefix) => parseFinalVersion(tag.slice(prefix.length))))
    .filter((version): version is SemVer => Boolean(version));
  return versions.sort(compareVersions).at(-1);
}

/** The highest rc build number already used for this exact target version, if any rc series exists for it yet. */
export function latestRcNumber(appId: string, target: SemVer, tags: string[], legacyIds: string[] = []): number | undefined {
  const prefixes = applicationIds(appId, legacyIds).map(tagPrefix);
  const numbers = tags
    .flatMap((tag) => prefixes.filter((prefix) => tag.startsWith(prefix)).map((prefix) => parseRcVersion(tag.slice(prefix.length))))
    .filter((version): version is SemVer & { rc: number } => Boolean(version))
    .filter((version) => version.major === target.major && version.minor === target.minor && version.patch === target.patch)
    .map((version) => version.rc);
  return numbers.length ? Math.max(...numbers) : undefined;
}

export interface NextRcResult { target: SemVer; rc: number; version: string; tag: string; }
export interface NextRcOptions { bumpLevel: BumpLevel; initialVersion?: string; }

/**
 * Computes the next release-candidate version for an application.
 * The target final version is always the latest FINAL tag bumped by `bumpLevel`
 * (never the latest rc), so an abandoned rc series never influences later ones.
 * If an rc series for that exact target already exists (a prior, not-yet-promoted
 * attempt), this continues it at the next rc number instead of starting over.
 * With no final tag yet, `initialVersion` (default 0.1.0) seeds the target directly,
 * unbumped, since there is nothing to bump from.
 */
export function nextRcVersion(appId: string, tags: string[], options: NextRcOptions, legacyIds: string[] = []): NextRcResult {
  const latestFinal = latestFinalVersion(appId, tags, legacyIds);
  const target = latestFinal ? bump(latestFinal, options.bumpLevel) : mustParseFinal(options.initialVersion ?? '0.1.0');
  const existingRc = latestRcNumber(appId, target, tags, legacyIds);
  const rc = existingRc === undefined ? 1 : existingRc + 1;
  const version = formatRcVersion(target, rc);
  return { target, rc, version, tag: `${tagPrefix(appId)}${version}` };
}

/** Strips the -rc.N suffix off a release-candidate version to get the final version it promotes to. */
export function finalVersionFromRc(rcVersion: string): { target: SemVer; version: string } {
  const parsed = parseRcVersion(rcVersion);
  if (!parsed) throw new Error(`Invalid rc version "${rcVersion}"; expected X.Y.Z-rc.N.`);
  const target = { major: parsed.major, minor: parsed.minor, patch: parsed.patch };
  return { target, version: formatVersion(target) };
}
