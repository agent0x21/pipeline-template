import fs from 'node:fs';
import { environmentManifestMarkdown, type EnvironmentManifest } from './environment-manifest.js';
import { createRelease, findReleaseByTag, updateReleaseBody, uploadAsset, type GitHubReleasesConfig } from './github-releases.js';

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
const data = fs.readFileSync(manifestPath);
const manifest = JSON.parse(data.toString('utf8')) as EnvironmentManifest;
await uploadAsset(config, release, 'environment-manifest.json', data, 'application/json');
await updateReleaseBody(config, release.id, environmentManifestMarkdown(manifest));
console.log(`Published environment-manifest.json to release "${tag}".`);
