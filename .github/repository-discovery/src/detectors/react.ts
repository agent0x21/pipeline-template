import fs from 'node:fs';
import path from 'node:path';
import type { Application, Detector, DetectorContext } from '../types.js';
import { cicdSetting, idFor, repoPath } from '../utils.js';

export class ReactDetector implements Detector {
  detect({ root, files }: DetectorContext): Application[] {
    const manifests = files.filter((file) => /(^|\/)package\.json$/i.test(repoPath(root, file)));
    const result: Application[] = [];
    for (const manifest of manifests) {
      const json = JSON.parse(fs.readFileSync(manifest, 'utf8')) as Record<string, unknown>;
      const deps = { ...(json.dependencies as Record<string, unknown> | undefined), ...(json.devDependencies as Record<string, unknown> | undefined) };
      const scripts = (json.scripts ?? {}) as Record<string, unknown>;
      if (!deps.react && !deps['react-dom'] && !Object.values(scripts).some((value) => String(value).includes('react-scripts'))) continue;
      const relativeFile = repoPath(root, manifest);
      const appPath = path.posix.dirname(relativeFile);
      const dockerfile = files.map((file) => repoPath(root, file)).find((file) => path.posix.dirname(file) === appPath && path.posix.basename(file).toLowerCase() === 'dockerfile') ?? '';
      const cicd = typeof json.cicd === 'boolean'
        ? json.cicd
        : json.cicd === undefined ? undefined : cicdSetting(['invalid'], relativeFile);
      result.push({ id: idFor(appPath || 'root'), name: String(json.name ?? (path.posix.basename(appPath) || 'root')), path: appPath, ecosystem: 'node', type: 'react', subtype: 'react', projectSystem: 'npm', targetFrameworks: [], buildRequirements: { platform: 'any', tools: ['node', 'pnpm'] }, files: [relativeFile], dockerfile, ...(cicd === undefined ? {} : { cicd }) });
    }
    return result;
  }
}
