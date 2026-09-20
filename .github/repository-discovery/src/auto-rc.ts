import { changedFilesFromGit, affectedFromFiles } from './affected.js';
import { discoverDependencies } from './dependencies.js';
import { listTags, tagCommit, tagCommitTimestamp } from './git-tags.js';
import type { AffectReason, Application } from './types.js';
import { appTagPattern, parseRcVersion, tagPrefix } from './version.js';

export type AutoRcReason = 'first-rc' | AffectReason;
export interface AutoRcCandidate { application: Application; reason: AutoRcReason; }

export interface GitOps {
  listTags: typeof listTags;
  tagCommit: typeof tagCommit;
  tagCommitTimestamp: typeof tagCommitTimestamp;
  changedFilesFromGit: typeof changedFilesFromGit;
}

export const defaultGitOps: GitOps = { listTags, tagCommit, tagCommitTimestamp, changedFilesFromGit };

/**
 * The commit of an application's most recent release-candidate build, of any bump
 * level or target version, regardless of whether it was ever promoted — "most
 * recent" measured by the commit's own timestamp, not by tag name or semver
 * ordering, since those can't be trusted to reflect real chronology on their own.
 * Returns undefined if this application has never had an rc tag.
 */
export function latestRcCommit(root: string, appId: string, git: GitOps = defaultGitOps, legacyIds: string[] = []): string | undefined {
  const prefixes = [...new Set([appId, ...legacyIds])].map(tagPrefix);
  const rcTags = [...new Set([...new Set([appId, ...legacyIds])].flatMap((id) => git.listTags(root, appTagPattern(id))))]
    .filter((tag) => prefixes.some((prefix) => tag.startsWith(prefix) && parseRcVersion(tag.slice(prefix.length))));
  if (!rcTags.length) return undefined;
  const withTimestamps = rcTags.map((tag) => ({ sha: git.tagCommit(root, tag), ts: git.tagCommitTimestamp(root, tag) }));
  return withTimestamps.sort((a, b) => b.ts - a.ts)[0].sha;
}

/**
 * Every application that has changed since its own last release-candidate build,
 * for the automatic push/PR-to-main flow. Each application's baseline is its own
 * (see latestRcCommit), so this diffs once per distinct baseline commit and reuses
 * the existing direct/dependency affected-detection against the current
 * dependency graph, rather than assuming every application shares one baseline.
 * An application with no rc tag yet is always included (reason "first-rc"); one
 * whose baseline is already the head commit (nothing has moved since its last rc)
 * is skipped entirely, not re-flagged.
 */
export function findAutoRcCandidates(root: string, head: string, git: GitOps = defaultGitOps): AutoRcCandidate[] {
  const graph = discoverDependencies(root);
  const diffCache = new Map<string, string[]>();
  const candidates: AutoRcCandidate[] = [];
  for (const application of graph.applications) {
    const baseline = latestRcCommit(root, application.id, git, application.legacyId ? [application.legacyId] : []);
    if (!baseline) {
      candidates.push({ application, reason: 'first-rc' });
      continue;
    }
    if (baseline === head) continue;
    if (!diffCache.has(baseline)) diffCache.set(baseline, git.changedFilesFromGit(root, baseline, head));
    const changedFiles = diffCache.get(baseline) ?? [];
    const affected = affectedFromFiles(graph, changedFiles).affectedApplications.find((entry) => entry.id === application.id);
    if (affected) candidates.push({ application, reason: affected.reason });
  }
  return candidates;
}
