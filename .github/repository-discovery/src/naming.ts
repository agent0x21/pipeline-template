import path from 'node:path';
import type { Application } from './types.js';

const ACRONYMS = new Set(['api', 'cli', 'sdk', 'ui', 'ux', 'url']);

// Unlike project-file IDs, directory names such as "Orders.Api" must retain
// their final segment; it is a name, not a filename extension.
function directoryId(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

function directorySlug(application: Application): string {
  const directory = application.path === '.' || !application.path ? '' : path.posix.basename(application.path);
  return directoryId(directory || application.name || application.id);
}

function displayName(slug: string): string {
  return slug.split('-').map((part) => ACRONYMS.has(part) ? part.toUpperCase() : `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(' ');
}

/**
 * Replaces implementation-heavy path/project identifiers with names based on
 * the application directory. When two applications share a leaf directory,
 * progressively more of their path is used; projects still sharing a directory
 * retain their fully-qualified legacy identifier so no two apps can publish to
 * the same release or container package.
 */
export function applyAutomaticNames(applications: Application[]): Application[] {
  const candidates = new Map<Application, string>(applications.map((application) => [application, directorySlug(application)]));
  const duplicateCandidates = new Set(
    [...candidates.values()].filter((candidate, _index, all) => all.filter((item) => item === candidate).length > 1),
  );

  for (const application of applications) {
    const candidate = candidates.get(application)!;
    if (duplicateCandidates.has(candidate)) candidates.set(application, directoryId(application.path || application.id));
  }

  const duplicateResolved = new Set(
    [...candidates.values()].filter((candidate, _index, all) => all.filter((item) => item === candidate).length > 1),
  );
  for (const application of applications) {
    const candidate = candidates.get(application)!;
    if (duplicateResolved.has(candidate)) candidates.set(application, application.id);
  }

  const ids = [...candidates.values()];
  if (new Set(ids).size !== ids.length) throw new Error('Automatic application naming produced duplicate IDs. Rename one application directory or project file.');

  return applications.map((application) => {
    const id = candidates.get(application)!;
    return {
      ...application,
      id,
      name: displayName(id),
      ...(id === application.id ? {} : { legacyId: application.id }),
    };
  });
}
