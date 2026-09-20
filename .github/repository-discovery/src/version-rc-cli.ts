import fs from 'node:fs';
import path from 'node:path';
import { listTags } from './git-tags.js';
import { appTagPattern, nextRcVersion, type BumpLevel } from './version.js';

const args = process.argv.slice(2);
const value = (flag: string) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
const appId = value('--app-id');
const bumpArg = value('--bump') ?? 'minor';
const initialVersion = value('--initial-version');
const legacyId = value('--legacy-id');
const root = path.resolve(value('--root') ?? '.');
const output = process.env.GITHUB_OUTPUT;

if (!appId) throw new Error('version-rc requires --app-id.');
if (bumpArg !== 'major' && bumpArg !== 'minor' && bumpArg !== 'patch') throw new Error(`--bump must be major, minor, or patch (got "${bumpArg}").`);
if (!output) throw new Error('GITHUB_OUTPUT is not available; this command must run in GitHub Actions.');

const bumpLevel: BumpLevel = bumpArg;
const legacyIds = legacyId ? [legacyId] : [];
const tags = [...new Set([appId, ...legacyIds].flatMap((id) => listTags(root, appTagPattern(id))) )];
const result = nextRcVersion(appId, tags, { bumpLevel, initialVersion }, legacyIds);
fs.appendFileSync(
  output,
  `version=${result.version}\ntag=${result.tag}\ntarget=${result.target.major}.${result.target.minor}.${result.target.patch}\nrc=${result.rc}\n`,
);
