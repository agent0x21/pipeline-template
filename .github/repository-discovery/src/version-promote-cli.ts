import fs from 'node:fs';
import path from 'node:path';
import { listTags, tagCommit } from './git-tags.js';
import { finalVersionFromRc, tagPrefix } from './version.js';

const args = process.argv.slice(2);
const value = (flag: string) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
const rcTagInput = value('--rc-tag');
const root = path.resolve(value('--root') ?? '.');
const output = process.env.GITHUB_OUTPUT;

if (!rcTagInput) throw new Error('version-promote requires --rc-tag.');
if (!output) throw new Error('GITHUB_OUTPUT is not available; this command must run in GitHub Actions.');

// Application IDs can contain slashes, so split only on the final "/v" that
// directly precedes a valid RC semver version.
const rcTagMatch = /^(?<appId>.+)\/v(?<rcVersion>\d+\.\d+\.\d+-rc\.\d+)$/.exec(rcTagInput);
if (!rcTagMatch?.groups) {
  throw new Error(`Invalid RC tag "${rcTagInput}"; expected <application-id>/vX.Y.Z-rc.N.`);
}

const { appId, rcVersion } = rcTagMatch.groups;
const prefix = tagPrefix(appId);
const rcTag = rcTagInput;
const { version: finalVersion } = finalVersionFromRc(rcVersion);
const finalTag = `${prefix}${finalVersion}`;

const tags = listTags(root, `${prefix}*`);
if (!tags.includes(rcTag)) throw new Error(`RC tag "${rcTag}" was not found. It must exist (already built and tagged) before it can be promoted.`);
if (tags.includes(finalTag)) throw new Error(`Final tag "${finalTag}" already exists. Final versions are immutable and cannot be re-promoted.`);

const sourceSha = tagCommit(root, rcTag);
fs.appendFileSync(output, `app_id=${appId}\nrc_version=${rcVersion}\nfinal_version=${finalVersion}\nfinal_tag=${finalTag}\nrc_tag=${rcTag}\nsource_sha=${sourceSha}\n`);
