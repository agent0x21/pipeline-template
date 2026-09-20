import fs from 'node:fs';
import path from 'node:path';
import { discover } from './discover.js';
import { tagCommit, listTags } from './git-tags.js';
import { buildEnvironmentManifest } from './environment-manifest.js';

const args = process.argv.slice(2);
const value = (flag: string) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const root = path.resolve(value('--root') ?? '.');
const output = value('--output');
if (!output) throw new Error('environment-manifest requires --output.');

const applications = discover(root).applications;
const tags = listTags(root, '*');
const versionTags = new Set(tags.filter((tag) => applications.some((application) => [application.id, application.legacyId].filter(Boolean).some((id) => tag.startsWith(`${id}/v`)))));
const commits = new Map([...versionTags].map((tag) => [tag, tagCommit(root, tag)]));
const manifest = buildEnvironmentManifest(applications, tags, commits);
const outputPath = path.resolve(root, output);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);

const availableQa = Object.values(manifest.environments.qa).filter((entry) => entry.state === 'available').length;
const availableProduction = Object.values(manifest.environments.production).filter((entry) => entry.state === 'available').length;
console.log(`Generated environment manifest for ${applications.length} application(s): ${availableQa} QA candidate(s), ${availableProduction} production release(s).`);
