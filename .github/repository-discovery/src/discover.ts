import fs from 'node:fs';
import path from 'node:path';
import type { Detector, DiscoveryManifest } from './types.js';
import { DotnetDetector } from './detectors/dotnet.js';
import { ReactDetector } from './detectors/react.js';
import { applyAutomaticNames } from './naming.js';

export function listFiles(root: string, current = root): string[] {
  return fs.readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') return [];
    const full = path.join(current, entry.name);
    const relative = path.relative(root, full).split(path.sep).join('/');
    // The pipeline's own detector fixtures (a synthetic React app plus several .NET
    // projects, used only by this repo's unit tests) must never be treated as real
    // applications when this file is copied into a consuming repository and scanned
    // from its root. Do not remove this without also removing the fixtures, or adding
    // an equivalent guard, or discovery will dispatch builds for them again.
    if (relative === '.github/repository-discovery/tests' || relative.startsWith('.github/repository-discovery/tests/')) return [];
    return entry.isDirectory() ? listFiles(root, full) : [full];
  });
}

export function discover(root: string, detectors: Detector[] = [new ReactDetector(), new DotnetDetector()]): DiscoveryManifest {
  const context = { root: path.resolve(root), files: listFiles(path.resolve(root)) };
  // Keep the established discovery order based on the original path-derived ID.
  // Friendly IDs are intentionally independent from that ordering so adding a
  // friendlier name does not reshuffle matrices or summaries unexpectedly.
  const applications = applyAutomaticNames(detectors.flatMap((detector) => detector.detect(context))
    .filter((application) => application.cicd !== false))
    .sort((a, b) => (a.legacyId ?? a.id).localeCompare(b.legacyId ?? b.id));
  return { schemaVersion: 1, generatedBy: 'polyglot-repository-discovery', applications };
}
