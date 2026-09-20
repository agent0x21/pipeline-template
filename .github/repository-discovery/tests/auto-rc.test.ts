import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { findAutoRcCandidates, latestRcCommit, type GitOps } from '../src/auto-rc.js';

const fixture = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/monorepo');

function gitOps(overrides: Partial<GitOps>): GitOps {
  return {
    listTags: vi.fn(() => []),
    tagCommit: vi.fn(() => 'unused'),
    tagCommitTimestamp: vi.fn(() => 0),
    changedFilesFromGit: vi.fn(() => []),
    ...overrides,
  };
}

describe('latestRcCommit', () => {
  it('returns undefined when the application has no rc tags at all', () => {
    const git = gitOps({ listTags: vi.fn(() => []) });
    expect(latestRcCommit(fixture, 'apps-portal', git)).toBeUndefined();
  });

  it('ignores final tags and picks the rc with the most recent commit, not the highest rc number or newest tag name', () => {
    const git = gitOps({
      listTags: vi.fn(() => ['apps-portal/v1.0.0', 'apps-portal/v2.0.0-rc.1', 'apps-portal/v1.5.0-rc.9']),
      tagCommit: vi.fn((_root: string, tag: string) => (tag === 'apps-portal/v2.0.0-rc.1' ? 'sha-newer-build' : 'sha-older-build')),
      // v2.0.0-rc.1 has the higher rc-adjacent version, but v1.5.0-rc.9's commit is
      // actually the more recent one — recency must win, not the version number.
      tagCommitTimestamp: vi.fn((_root: string, tag: string) => (tag === 'apps-portal/v1.5.0-rc.9' ? 200 : 100)),
    });
    expect(latestRcCommit(fixture, 'apps-portal', git)).toBe('sha-older-build');
  });
});

describe('findAutoRcCandidates', () => {
  it('flags an application that has never had an rc as first-rc, without diffing', () => {
    const git = gitOps({ listTags: vi.fn(() => []) });
    const result = findAutoRcCandidates(fixture, 'HEAD', git);
    const portal = result.find((c) => c.application.id === 'portal');
    expect(portal?.reason).toBe('first-rc');
    expect(git.changedFilesFromGit).not.toHaveBeenCalled();
  });

  it('skips an application whose last rc is already at head', () => {
    const git = gitOps({
      listTags: vi.fn((_root: string, pattern: string) => (pattern === 'apps-portal/v*' ? ['apps-portal/v0.1.0-rc.1'] : [])),
      tagCommit: vi.fn(() => 'head-sha'),
      tagCommitTimestamp: vi.fn(() => 1),
    });
    const result = findAutoRcCandidates(fixture, 'head-sha', git);
    expect(result.find((c) => c.application.id === 'portal')).toBeUndefined();
  });

  it('flags a direct file change within the application since its own last rc', () => {
    const git = gitOps({
      listTags: vi.fn((_root: string, pattern: string) => (pattern === 'apps-portal/v*' ? ['apps-portal/v0.1.0-rc.1'] : [])),
      tagCommit: vi.fn(() => 'portal-base-sha'),
      tagCommitTimestamp: vi.fn(() => 1),
      changedFilesFromGit: vi.fn(() => ['apps/portal/src/App.tsx']),
    });
    const result = findAutoRcCandidates(fixture, 'head-sha', git);
    expect(result.find((c) => c.application.id === 'portal')?.reason).toBe('direct-file-change');
  });

  it('flags a dependency change (a consumed local package) since the last rc, even with no direct file change', () => {
    const git = gitOps({
      listTags: vi.fn((_root: string, pattern: string) => (pattern === 'apps-portal/v*' ? ['apps-portal/v0.1.0-rc.1'] : [])),
      tagCommit: vi.fn(() => 'portal-base-sha'),
      tagCommitTimestamp: vi.fn(() => 1),
      changedFilesFromGit: vi.fn(() => ['shared/contracts/index.ts']),
    });
    const result = findAutoRcCandidates(fixture, 'head-sha', git);
    expect(result.find((c) => c.application.id === 'portal')?.reason).toBe('dependency-change');
  });

  it('does not flag an application whose baseline diff touches none of its files or dependencies', () => {
    const git = gitOps({
      listTags: vi.fn((_root: string, pattern: string) => (pattern === 'apps-portal/v*' ? ['apps-portal/v0.1.0-rc.1'] : [])),
      tagCommit: vi.fn(() => 'portal-base-sha'),
      tagCommitTimestamp: vi.fn(() => 1),
      changedFilesFromGit: vi.fn(() => ['src/api/Orders.Api/Orders.Api.csproj']),
    });
    const result = findAutoRcCandidates(fixture, 'head-sha', git);
    expect(result.find((c) => c.application.id === 'portal')).toBeUndefined();
  });

  it('reuses one diff per distinct baseline commit shared by multiple applications', () => {
    // Every application in the fixture (6 of them) reports the same underlying
    // commit as its last rc's baseline; the diff against that one commit must
    // only be computed once and reused, not once per application.
    const git = gitOps({
      listTags: vi.fn((_root: string, pattern: string) => [pattern.replace('*', '0.1.0-rc.1')]),
      tagCommit: vi.fn(() => 'shared-base-sha'),
      tagCommitTimestamp: vi.fn(() => 1),
      changedFilesFromGit: vi.fn(() => []),
    });
    findAutoRcCandidates(fixture, 'head-sha', git);
    expect(git.changedFilesFromGit).toHaveBeenCalledTimes(1);
  });
});
