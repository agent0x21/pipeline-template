import { execFileSync } from 'node:child_process';

/** Lists git tags matching a glob pattern (e.g. "app-id/v*"), oldest-to-newest order from git, unsorted semantically. */
export function listTags(root: string, pattern: string): string[] {
  const result = execFileSync('git', ['tag', '-l', pattern], { cwd: root, encoding: 'utf8' });
  return result.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

/** Resolves the commit SHA a tag points at. Throws if the tag does not exist locally. */
export function tagCommit(root: string, tag: string): string {
  return execFileSync('git', ['rev-list', '-n', '1', tag], { cwd: root, encoding: 'utf8' }).trim();
}

/** Unix timestamp (seconds) of the commit a tag points at, for ordering tags by actual recency rather than by name. */
export function tagCommitTimestamp(root: string, tag: string): number {
  return Number(execFileSync('git', ['log', '-1', '--format=%ct', tag], { cwd: root, encoding: 'utf8' }).trim());
}
