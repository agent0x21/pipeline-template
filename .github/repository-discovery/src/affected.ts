import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { discoverDependencies } from './dependencies.js';
import type { AffectedManifest, DependencyGraph } from './types.js';
import { uniqueSorted } from './utils.js';

export function changedFilesFromGit(root: string, base: string, head: string): string[] {
  const result = execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMRD', base, head], { cwd: root, encoding: 'utf8' });
  return uniqueSorted(result.split(/\r?\n/).filter(Boolean).map((file) => file.replace(/\\/g, '/')));
}

function owningNode(graph: DependencyGraph, file: string): string | undefined {
  return Object.entries(graph.owners)
    .filter(([directory]) => directory === '' || file === directory || file.startsWith(`${directory}/`))
    .sort(([left], [right]) => right.length - left.length)[0]?.[1];
}

export function affectedFromFiles(graph: DependencyGraph, changedFiles: string[], base = 'unknown', head = 'unknown'): AffectedManifest {
  const reverse = new Map<string, string[]>();
  for (const [source, targets] of Object.entries(graph.dependencies)) for (const target of targets) reverse.set(target, [...(reverse.get(target) ?? []), source]);
  const directNodes = new Map<string, string[]>();
  for (const file of uniqueSorted(changedFiles)) {
    const owner = owningNode(graph, file);
    if (owner) directNodes.set(owner, [...(directNodes.get(owner) ?? []), file]);
  }
  const distance = new Map<string, number>();
  const queue = [...directNodes.keys()];
  queue.forEach((node) => distance.set(node, 0));
  for (let index = 0; index < queue.length; index += 1) {
    const node = queue[index];
    for (const consumer of reverse.get(node) ?? []) if (!distance.has(consumer)) { distance.set(consumer, (distance.get(node) ?? 0) + 1); queue.push(consumer); }
  }
  const applications = new Map(graph.applications.map((app) => [app.id, app]));
  const affectedApplications = [...distance.entries()].flatMap(([id, depth]) => {
    if (!applications.has(id)) return [];
    return [{ id, reason: depth === 0 ? 'direct-file-change' as const : 'dependency-change' as const, changedFiles: uniqueSorted(directNodes.get(id) ?? []) }];
  }).sort((left, right) => left.id.localeCompare(right.id));
  return { schemaVersion: 1, generatedBy: 'polyglot-repository-discovery', base, head, changedFiles: uniqueSorted(changedFiles), affectedApplications };
}

export function discoverAffected(root: string, base: string, head: string): AffectedManifest {
  return affectedFromFiles(discoverDependencies(path.resolve(root)), changedFilesFromGit(root, base, head), base, head);
}
