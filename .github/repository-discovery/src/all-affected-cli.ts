import fs from 'node:fs';
import path from 'node:path';
import type { AffectedManifest, DiscoveryManifest } from './types.js';

const args = process.argv.slice(2);
const value = (flag: string) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
const discoveryPath = value('--discovery');
const output = value('--output');
if (!discoveryPath || !output) throw new Error('Usage: all-affected --discovery <path> --output <path>');

const discovery = JSON.parse(fs.readFileSync(path.resolve(discoveryPath), 'utf8')) as DiscoveryManifest;
const manifest: AffectedManifest = {
  schemaVersion: 1,
  generatedBy: 'polyglot-repository-discovery',
  base: 'none',
  head: 'current',
  changedFiles: [],
  affectedApplications: discovery.applications.map((application) => ({ id: application.id, reason: 'full-validation', changedFiles: [] })),
};
fs.writeFileSync(path.resolve(output), JSON.stringify(manifest, null, 2) + '\n');
