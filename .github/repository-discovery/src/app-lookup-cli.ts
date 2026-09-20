import fs from 'node:fs';
import path from 'node:path';
import { discover } from './discover.js';

const args = process.argv.slice(2);
const value = (flag: string) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
const root = path.resolve(value('--root') ?? '.');
const appId = value('--app-id');
const output = process.env.GITHUB_OUTPUT;

if (!appId) throw new Error('app-lookup requires --app-id.');
if (!output) throw new Error('GITHUB_OUTPUT is not available; this command must run in GitHub Actions.');

// Promotion can still target an RC created before friendly directory IDs were
// introduced, so accept that historical ID for lookup while preserving it for
// the release/artifact operations themselves.
const application = discover(root).applications.find((app) => app.id === appId || app.legacyId === appId);
if (!application) {
  throw new Error(`Application "${appId}" was not found by discovery at this ref. Check the app id (from a discovery-manifest.json run) and that the ref actually contains it.`);
}

const projectFile = application.files.find((file) => /\.(csproj|fsproj|vbproj)$/i.test(file)) ?? '';
fs.appendFileSync(
  output,
  `name=${application.name}\nlegacy_id=${application.legacyId ?? ''}\npath=${application.path || '.'}\necosystem=${application.ecosystem}\nproject_system=${application.projectSystem}\nproject_file=${projectFile}\ndockerfile=${application.dockerfile}\nplatform=${application.buildRequirements.platform}\n`,
);
