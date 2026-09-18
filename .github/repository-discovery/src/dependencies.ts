import fs from 'node:fs';
import path from 'node:path';
import { discover, listFiles } from './discover.js';
import type { DependencyGraph } from './types.js';
import { repoPath, uniqueSorted } from './utils.js';

interface PackageInfo { name: string; directory: string; nodeId: string; dependencies: string[]; }

function projectReferences(xml: string): string[] {
  return [...xml.matchAll(/<ProjectReference\b[^>]*\bInclude\s*=\s*["']([^"']+)["'][^>]*\/?\s*>/gi)].map((match) => match[1]);
}

export function discoverDependencies(root: string): DependencyGraph {
  const resolvedRoot = path.resolve(root);
  const manifest = discover(resolvedRoot);
  const files = listFiles(resolvedRoot);
  const owners: Record<string, string> = {};
  const dependencies: Record<string, string[]> = {};
  const projectToId = new Map<string, string>();
  for (const app of manifest.applications) {
    owners[app.path] = app.id;
    dependencies[app.id] = [];
    for (const file of app.files.filter((item) => /\.(csproj|fsproj|vbproj)$/i.test(item))) projectToId.set(file.toLowerCase(), app.id);
  }

  const packages: PackageInfo[] = files.filter((file) => path.basename(file).toLowerCase() === 'package.json').flatMap((file) => {
    try {
      const json = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
      if (typeof json.name !== 'string') return [];
      const jsonDependencies = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']
        .flatMap((key) => Object.keys((json[key] ?? {}) as Record<string, unknown>));
      const directory = path.posix.dirname(repoPath(resolvedRoot, file));
      const application = manifest.applications.find((app) => app.path === directory);
      return [{ name: json.name, directory, nodeId: application?.id ?? `package:${json.name}`, dependencies: jsonDependencies }];
    } catch { return []; }
  });
  const packageByName = new Map(packages.map((item) => [item.name, item]));
  for (const pkg of packages) {
    owners[pkg.directory] = pkg.nodeId;
    dependencies[pkg.nodeId] ??= [];
    dependencies[pkg.nodeId] = uniqueSorted(pkg.dependencies.flatMap((name) => packageByName.get(name)?.nodeId ?? []));
  }

  for (const app of manifest.applications) {
    const projectPath = app.files.find((file) => /\.(csproj|fsproj|vbproj)$/i.test(file));
    if (!projectPath) continue;
    const absoluteProject = path.join(resolvedRoot, projectPath);
    const xml = fs.readFileSync(absoluteProject, 'utf8');
    const refs = projectReferences(xml).map((reference) => repoPath(resolvedRoot, path.resolve(path.dirname(absoluteProject), reference)).toLowerCase());
    dependencies[app.id] = uniqueSorted([...dependencies[app.id], ...refs.flatMap((reference) => projectToId.get(reference) ?? [])]);
  }
  return { schemaVersion: 1, generatedBy: 'polyglot-repository-discovery', applications: manifest.applications, dependencies, owners };
}
