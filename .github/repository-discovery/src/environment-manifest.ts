import type { Application } from './types.js';
import { compareVersions, parseFinalVersion, parseRcVersion, tagPrefix, type SemVer } from './version.js';

export type ReleaseState = 'available' | 'not-tracked' | 'not-released';

export interface ApplicationEnvironmentVersion {
  state: ReleaseState;
  version?: string;
  tag?: string;
  commit?: string;
  /** Whether this desired version is a pending RC or the production baseline. */
  source?: 'release-candidate' | 'production-baseline' | 'production';
  reason?: string;
}

export interface EnvironmentManifest {
  schemaVersion: 1;
  generatedBy: 'polyglot-repository-discovery';
  generatedAt: string;
  environments: {
    dev: Record<string, ApplicationEnvironmentVersion>;
    qa: Record<string, ApplicationEnvironmentVersion>;
    production: Record<string, ApplicationEnvironmentVersion>;
  };
}

interface Candidate {
  tag: string;
  version: string;
  parsed: SemVer;
  rc?: number;
}

function prefixes(application: Application): string[] {
  return [...new Set([application.id, application.legacyId].filter((id): id is string => Boolean(id)).map(tagPrefix))];
}

function candidates(application: Application, tags: string[], kind: 'final' | 'rc'): Candidate[] {
  return tags.flatMap((tag) => prefixes(application)
    .filter((prefix) => tag.startsWith(prefix))
    .flatMap((prefix) => {
      const version = tag.slice(prefix.length);
      if (kind === 'final') {
        const parsed = parseFinalVersion(version);
        return parsed ? [{ tag, version, parsed }] : [];
      }
      const parsed = parseRcVersion(version);
      return parsed ? [{ tag, version, parsed, rc: parsed.rc }] : [];
    }));
}

function compareCandidate(a: Candidate, b: Candidate): number {
  return compareVersions(a.parsed, b.parsed) || (a.rc ?? 0) - (b.rc ?? 0) || a.tag.localeCompare(b.tag);
}

function versionEntry(
  candidate: Candidate | undefined,
  commits: ReadonlyMap<string, string>,
  source: ApplicationEnvironmentVersion['source'],
): ApplicationEnvironmentVersion {
  if (!candidate) return { state: 'not-released' };
  return { state: 'available', version: candidate.version, tag: candidate.tag, commit: commits.get(candidate.tag), source };
}

/**
 * Builds a desired-release inventory from this repository's version tags.
 * DEV and QA contain the newest candidate whose final version has not been
 * promoted. When there is no candidate, they intentionally fall back to the
 * newest production release so each released application has a deployable
 * version in every environment. Production contains the newest final version.
 */
export function buildEnvironmentManifest(
  applications: Application[],
  tags: string[],
  commits: ReadonlyMap<string, string>,
  generatedAt = new Date().toISOString(),
): EnvironmentManifest {
  const dev: Record<string, ApplicationEnvironmentVersion> = {};
  const qa: Record<string, ApplicationEnvironmentVersion> = {};
  const production: Record<string, ApplicationEnvironmentVersion> = {};

  for (const application of applications) {
    const finalCandidates = candidates(application, tags, 'final').sort(compareCandidate);
    const final = finalCandidates.at(-1);
    const finalVersions = new Set(finalCandidates.map((candidate) => candidate.version));
    const rc = candidates(application, tags, 'rc')
      .filter((candidate) => !finalVersions.has(`${candidate.parsed.major}.${candidate.parsed.minor}.${candidate.parsed.patch}`))
      .sort(compareCandidate)
      .at(-1);

    const nonProductionCandidate = rc ?? final;
    const nonProductionSource: ApplicationEnvironmentVersion['source'] = rc ? 'release-candidate' : 'production-baseline';
    dev[application.id] = versionEntry(nonProductionCandidate, commits, nonProductionSource);
    qa[application.id] = versionEntry(nonProductionCandidate, commits, nonProductionSource);
    production[application.id] = versionEntry(final, commits, 'production');
  }

  return {
    schemaVersion: 1,
    generatedBy: 'polyglot-repository-discovery',
    generatedAt,
    environments: { dev, qa, production },
  };
}

function displayEntry(entry: ApplicationEnvironmentVersion): { version: string; source: string; tag: string; commit: string } {
  if (entry.state !== 'available') return { version: '—', source: 'No released version', tag: '—', commit: '—' };
  const source = entry.source === 'release-candidate'
    ? 'Release candidate'
    : entry.source === 'production-baseline'
      ? 'Production baseline'
      : 'Production release';
  return { version: entry.version ?? '—', source, tag: entry.tag ?? '—', commit: entry.commit ?? '—' };
}

/** Renders the human-readable release notes stored alongside the JSON asset. */
export function environmentManifestMarkdown(manifest: EnvironmentManifest): string {
  const sections = (Object.keys(manifest.environments) as Array<keyof EnvironmentManifest['environments']>).map((environment) => {
    const rows = Object.entries(manifest.environments[environment])
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([application, entry]) => {
        const display = displayEntry(entry);
        return `| ${application} | ${display.version} | ${display.source} | \`${display.tag}\` | \`${display.commit}\` |`;
      });
    return [
      `## ${environment.toUpperCase()} versions to deploy`,
      '',
      '| Application | Version | Source | Tag | Commit |',
      '| --- | --- | --- | --- | --- |',
      ...rows,
    ].join('\n');
  });
  return [
    '# Environment manifest',
    '',
    `Generated: ${manifest.generatedAt}`,
    '',
    'DEV and QA use the newest unpromoted release candidate. When no candidate exists, they use the newest production release as the deployment baseline.',
    '',
    ...sections,
    '',
    'The attached `environment-manifest.json` is the machine-readable source for this table.',
  ].join('\n');
}
