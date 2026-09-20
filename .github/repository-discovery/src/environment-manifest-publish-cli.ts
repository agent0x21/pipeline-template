import fs from 'node:fs';
import { createRelease, findReleaseByTag, uploadAsset, type GitHubReleasesConfig } from './github-releases.js';

const args = process.argv.slice(2);
const value = (flag: string) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const manifestPath = value('--manifest');
const ref = value('--ref');
const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
if (!manifestPath || !ref) throw new Error('environment-manifest-publish requires --manifest and --ref.');
if (!repository || !token) throw new Error('environment-manifest-publish requires GITHUB_REPOSITORY and GITHUB_TOKEN; this command must run in GitHub Actions.');

const config: GitHubReleasesConfig = { apiUrl: process.env.GITHUB_API_URL ?? 'https://api.github.com', repository, token };
const tag = 'pipeline/environment-manifest';
const release = (await findReleaseByTag(config, tag)) ?? (await createRelease(config, tag, ref, 'Environment manifest'));
await uploadAsset(config, release, 'environment-manifest.json', fs.readFileSync(manifestPath), 'application/json');
console.log(`Published environment-manifest.json to release "${tag}".`);
