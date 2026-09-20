import type { Application } from './types.js';
import { compareVersions, parseFinalVersion, parseRcVersion, tagPrefix, type SemVer } from './version.js';

export type ReleaseState = 'available' | 'not-tracked' | 'not-released';

export interface ApplicationEnvironmentVersion {
  state: ReleaseState;
  version?: string;
  tag?: string;
  commit?: string;
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

function versionEntry(candidate: Candidate | undefined, commits: ReadonlyMap<string, string>): ApplicationEnvironmentVersion {
  if (!candidate) return { state: 'not-released' };
  return { state: 'available', version: candidate.version, tag: candidate.tag, commit: commits.get(candidate.tag) };
}

/**
 * Builds a desired-release inventory from this repository's version tags.
 * QA contains the newest candidate whose final version has not been promoted;
 * production contains the newest final version. DEV is deliberately marked as
 * untracked because this pipeline's dev artifacts are branch/commit outputs,
 * not versioned deployments.
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

    dev[application.id] = {
      state: 'not-tracked',
      reason: 'Development artifacts are branch and commit outputs; no DEV deployment has been recorded.',
    };
    qa[application.id] = versionEntry(rc, commits);
    production[application.id] = versionEntry(final, commits);
  }

  return {
    schemaVersion: 1,
    generatedBy: 'polyglot-repository-discovery',
    generatedAt,
    environments: { dev, qa, production },
  };
}
