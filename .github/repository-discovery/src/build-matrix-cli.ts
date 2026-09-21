import fs from 'node:fs';
import path from 'node:path';
import type { AffectedManifest, DiscoveryManifest } from './types.js';

const args = process.argv.slice(2);
const value = (flag: string) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
const affectedPath = value('--affected');
const discoveryPath = value('--discovery');
if (!affectedPath || !discoveryPath) throw new Error('Usage: build-matrix --affected <path> --discovery <path>');

const affected = JSON.parse(fs.readFileSync(path.resolve(affectedPath), 'utf8')) as AffectedManifest;
const discovery = JSON.parse(fs.readFileSync(path.resolve(discoveryPath), 'utf8')) as DiscoveryManifest;
const selected = new Set(affected.affectedApplications.map((application) => application.id));
const include = discovery.applications.filter((application) => selected.has(application.id)).map((application) => ({
  id: application.id,
  name: application.name,
  path: application.path || '.',
  ecosystem: application.ecosystem,
  projectSystem: application.projectSystem,
  projectFile: application.files.find((file) => /\.(csproj|fsproj|vbproj)$/i.test(file)) ?? '',
  dockerfile: application.dockerfile,
  platform: application.buildRequirements.platform,
  // Dockerfiles in this pipeline build Linux OCI images. Route the whole
  // application matrix entry to a Linux runner so its build, tests, and image
  // build share a compatible toolchain. Other applications retain the
  // Windows runner used for legacy MSBuild support.
  runner: application.dockerfile ? 'linux' : 'windows',
  tools: application.buildRequirements.tools,
}));
const output = process.env.GITHUB_OUTPUT;
if (!output) throw new Error('GITHUB_OUTPUT is not available; this command must run in GitHub Actions.');
fs.appendFileSync(output, `matrix=${JSON.stringify({ include })}\nhas_affected=${include.length > 0}\n`);
